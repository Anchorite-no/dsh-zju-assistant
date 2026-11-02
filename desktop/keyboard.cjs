/**
 * macOS 上引擎要的原生键盘桥。preload.cjs 在 Mac 上给页面打 html[data-platform=darwin]，引擎的快捷键服务（dsh-client-shortcuts）
 * 见到它就按桌面版来：可改的快捷键只认壳转过来的原生按键，页面自己的 keydown 只交给固定操作（Esc 这类），键位偏好也要壳来存。
 * 没有这座桥，它启动时就抛「Desktop keyboard bridge unavailable」，靠它的布局、对话这些插件都起不来，页面停在插件加载失败。
 * Windows 上不打那个标记，引擎按网页版来，用不着这里。
 *
 * 做法照上游 apps/desktop/src/keyboard.ts 和 keybindings.ts（这两个文件从 dsh-v0.2.0-rc.2 到 0.2.1-rc.5 没变），
 * 去掉了我们没有的原生「文件」菜单、右边栏的浏览器 webview 和强制更新的遮罩层。键位的校验、冲突、版本号都交给引擎自己的
 * protocol（main.cjs 从引擎的依赖里取，版本跟着引擎走），壳只管拦按键和读写文件。偏好存在 userData/keybindings.json，和上游同名同格式。
 */
const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

/** 和 preload.cjs 对得上的几个 IPC 通道。 */
const CHANNELS = {
  get: 'campus:shortcuts-get',
  edit: 'campus:shortcuts-edit',
  recording: 'campus:shortcuts-recording',
  close: 'campus:shortcuts-close-window',
  changed: 'campus:shortcuts-changed',
  input: 'campus:shortcuts-input',
}
const MODIFIERS = ['control', 'alt', 'shift', 'meta']

/** 先写同目录的临时文件再改名换上去：写到一半崩了，原来的偏好还在。 */
async function writeAtomic(file, raw) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  const temp = `${file}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temp, raw, { mode: 0o600 })
    await fs.rename(temp, file)
  } finally {
    await fs.rm(temp, { force: true })
  }
}

/**
 * 给主窗口接上键盘桥。只认这个窗口、它的顶层页面，而且页面得是引擎的地址（origin()，引擎起来以前是空的）。
 * protocol 是 @deepseek-ai/dsh-client-shortcuts/protocol；platform 是引擎认的设备名，Mac 上是 macos。
 * 返回拆掉它的函数；窗口关了也会自己拆。
 */
function installKeyboard({ window, ipcMain, protocol, file, origin, platform = 'macos' }) {
  const { ShortcutPersistence, bindingKey, effectiveShortcuts, parseShortcutDefinitions, parseShortcutEdit } = protocol
  const contents = window.webContents
  let definitions = [], recording = false, revision, keys = new Set()
  const trusted = frame => {
    try { return Boolean(origin()) && new URL(frame.url).origin === origin() } catch { return false }
  }
  const send = (channel, value) => { if (!window.isDestroyed()) contents.send(channel, value) }
  // 偏好每换一次（读到了、改了、目录变了），就重算哪些组合要拦：没生效的、有冲突的不拦。
  const persistence = new ShortcutPersistence({
    read: async () => {
      try { return await fs.readFile(file, 'utf8') } catch (error) {
        if (error.code === 'ENOENT') return null
        throw error
      }
    },
    write: raw => writeAtomic(file, raw),
  }, 'desktop', platform, false, snapshot => {
    revision = definitions.length === 0 || snapshot.status === 'loading' ? undefined : snapshot.revision
    const rows = snapshot.status === 'loading' ? [] : effectiveShortcuts(definitions, snapshot.document, 'desktop', platform)
    keys = new Set(rows.flatMap(row => row.binding !== null && row.issue === null && row.conflicts.length === 0 ? [bindingKey(row.binding)] : []))
    if (!window.isDestroyed() && trusted(contents.mainFrame)) send(CHANNELS.changed, snapshot)
  })
  const assertSender = event => {
    if (window.isDestroyed() || event.sender !== contents || event.senderFrame !== contents.mainFrame || !trusted(event.senderFrame)) {
      throw new Error('键盘桥只接受主窗口里引擎页面的请求')
    }
  }
  const handlers = {
    [CHANNELS.get]: async (event, input) => {
      assertSender(event)
      definitions = parseShortcutDefinitions(input)
      persistence.setDefinitions(definitions)
      return persistence.readCurrent()
    },
    [CHANNELS.edit]: async (event, input, expected) => {
      assertSender(event)
      if (typeof expected !== 'string') throw new Error('键位版本号不对')
      return persistence.edit(parseShortcutEdit(input), expected)
    },
    // 用户在设置里录新键位时什么都不拦，菜单上的快捷键也先让开，按下的键原样交给页面去录。
    [CHANNELS.recording]: (event, active) => {
      assertSender(event)
      if (typeof active !== 'boolean') throw new Error('录制状态不对')
      recording = active
      contents.setIgnoreMenuShortcuts(active)
    },
    // 引擎的「关闭页面」没有页面可关时要关窗口；带来的版本号得是当前的，录键位时、窗口不在前台时不关。
    [CHANNELS.close]: (event, expected) => {
      assertSender(event)
      if (expected !== revision || revision === undefined || recording || !window.isFocused() || !window.isEnabled()) return
      window.close()
    },
  }
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler)

  // 一次按键的状态：输入法的死键、按住了哪些键（两个普通键一起按的组合）、哪些键按下时被我们拦了（松开也要拦）。
  let deadKey = false, inputFrame = null, inputRevision
  const held = new Set(), consumed = new Map()
  const resetInput = () => {
    deadKey = false; held.clear(); consumed.clear(); inputFrame = null; inputRevision = undefined
    if (!window.isDestroyed()) contents.setIgnoreMenuShortcuts(false)
  }
  // 页面整个换掉了，它注册过的命令也就不算数，等新页面重新来取。
  const clear = () => {
    resetInput()
    definitions = []; keys.clear(); recording = false
    persistence.setDefinitions(null)
  }
  const navigation = event => { if (event.isMainFrame && !event.isSameDocument) clear() }
  const beforeInput = (event, input) => {
    if (event.defaultPrevented) { resetInput(); return }
    if (!window.isFocused() || !window.isEnabled() || revision === undefined) {
      contents.setIgnoreMenuShortcuts(false)
      held.clear()
      consumed.clear()
      return
    }
    const modifiers = MODIFIERS.filter(modifier => input[modifier])
    const match = keys.has(bindingKey({ code: input.code, modifiers }))
    // 拦下来的组合别再让菜单接着响（比如 ⌘W 先给引擎关页面，不直接关窗口）。
    contents.setIgnoreMenuShortcuts(recording || match)
    const frame = contents.focusedFrame
    const composing = input.isComposing || input.key === 'Dead' || deadKey || input.modifiers.includes('altgr')
    if (input.type === 'keyDown') deadKey = input.key === 'Dead'
    if (recording || composing || frame === null) { held.clear(); consumed.clear(); return }
    if (frame !== inputFrame || inputRevision !== revision) { held.clear(); inputFrame = frame; inputRevision = revision }
    const modifierKey = /^(Control|Alt|Shift|Meta)(Left|Right)$/u.test(input.code)
    if (input.type === 'keyUp') {
      // 组合的第一个键已经到了页面，它松开时也得让页面收到；我们拦下的那个键，松开也拦。
      if (consumed.get(input.code) === 'press') event.preventDefault()
      consumed.delete(input.code)
      held.delete(input.code)
      // macOS 按住 ⌘ 时可能不给字母键的 keyUp，松开修饰键就当全松开了。
      if (modifierKey) held.clear()
      return
    }
    if (!input.isAutoRepeat) consumed.delete(input.code)
    if (modifierKey) { held.clear(); return }
    if (input.isAutoRepeat && consumed.has(input.code) && !match) { event.preventDefault(); return }
    if (input.isAutoRepeat && !held.has(input.code) && !match) return
    held.add(input.code)
    const codes = [input.code, ...[...held].filter(code => code !== input.code)].sort()
    const pair = { code: codes[0], ...(codes[1] === undefined ? {} : { secondCode: codes[1] }), modifiers }
    let binding = { code: input.code, modifiers }, hit = match
    if (codes.length === 2 && keys.has(bindingKey(pair))) { binding = pair; hit = true }
    if (!hit) return
    event.preventDefault()
    if (input.type !== 'keyDown') return
    if (!input.isAutoRepeat) {
      if (binding.secondCode !== undefined) { consumed.set(binding.code, 'repeat'); consumed.set(binding.secondCode, 'repeat') }
      consumed.set(input.code, 'press')
    }
    // Electron 拦下以后可能两个 keyUp 都不给；按完一次就清掉，下一次组合要重新按。
    held.clear()
    // 焦点在页面里的 iframe（右边栏的网页、HTML 预览）时，报最外面那层 iframe 的名字，页面拿它核对焦点。
    const main = frame === contents.mainFrame
    let embedding = frame
    while (!main && embedding.parent !== null && embedding.parent !== contents.mainFrame) embedding = embedding.parent
    send(CHANNELS.input, {
      kind: main ? 'keyboard' : 'iframe', revision, frameName: main ? '' : embedding.name,
      code: binding.code, ...(binding.secondCode === undefined ? {} : { secondCode: binding.secondCode }),
      repeat: input.isAutoRepeat, control: input.control, alt: input.alt, shift: input.shift, meta: input.meta,
    })
  }
  const dispose = () => {
    contents.off('did-start-navigation', navigation)
    contents.off('before-input-event', beforeInput)
    contents.off('blur', resetInput)
    window.off('blur', resetInput)
    window.off('closed', closed)
    for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel)
    persistence.dispose()
  }
  const closed = () => { clear(); dispose() }
  contents.on('did-start-navigation', navigation)
  contents.on('before-input-event', beforeInput)
  contents.on('blur', resetInput)
  window.on('blur', resetInput)
  window.on('closed', closed)
  return dispose
}

module.exports = { CHANNELS, installKeyboard }
