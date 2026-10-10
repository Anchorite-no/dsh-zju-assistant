/**
 * 最小的自写壳：一个窗口 + 一个引擎子进程。
 * 壳只负责窗口、名字和进程生命周期；界面由引擎的 Web 应用提供，壳直接加载它的地址。
 */
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeTheme, session, shell } = require('electron')
const { createTray } = require('./tray.cjs')
const { createWereadBridge } = require('./weread.cjs')
const { createReader } = require('./reader.cjs')
const { ffmpegEnv } = require('./ffmpeg.cjs')
const { createFilms, filmDirectory } = require('./film.cjs')
const { fork } = require('node:child_process')
const { mkdirSync } = require('node:fs')
const path = require('node:path')

const TITLE = '校园智能体'
/** 窗口栏高度，和 preload.cjs 里告诉界面的数字一致。 */
const TITLEBAR_HEIGHT = 40

// A separate app data directory allows a full desktop check without touching the user's sessions.
const customData = process.env.CAMPUS_AGENT_DATA_DIR || app.commandLine.getSwitchValue('campus-data-dir')
if (customData) {
  if (!path.isAbsolute(customData)) throw new Error('CAMPUS_AGENT_DATA_DIR must be an absolute path')
  app.setPath('userData', customData)
}

// 同一份数据目录只开一个。窗口隐藏在托盘里时再打开一次应用，是把原来的窗口叫回来（见 main 里的 second-instance），不是再起一个引擎。
const first = app.requestSingleInstanceLock()

// 数据放在我们自己的目录，不碰用户的 ~/.dsh。
const home = path.join(app.getPath('userData'), 'home')
const workspace = path.join(app.getPath('userData'), 'workspace')
mkdirSync(home, { recursive: true })
mkdirSync(workspace, { recursive: true })
// 密钥文件（DeepSeek Key、ChatGPT 登录的令牌）放哪：开发时在项目根目录，方便直接改；装好的应用放数据目录，
// 安装目录在升级时会被整个换掉，放在里面每次升级都要重新填。
const keysDir = app.isPackaged ? app.getPath('userData') : path.join(__dirname, '..')

let host
let wereadBridge
let quitting = false

function startHost() {
  return new Promise((resolve, reject) => {
    host = fork(path.join(__dirname, 'host.mjs'), [], {
      cwd: workspace,
      env: { ...process.env, ...wereadBridge?.env, ...ffmpegEnv(), CAMPUS_PROFILE_DIR: path.join(app.getPath('userData'), 'profile'), CAMPUS_KEYS_DIR: keysDir, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    })
    host.on('message', (message) => {
      if (message?.type === 'ready') resolve(message.url)
      else if (message?.type === 'fatal') reject(new Error(message.message))
    })
    host.once('exit', (code) => {
      reject(new Error(`引擎进程退出，代码 ${String(code)}`))
      if (!quitting) app.quit()
    })
  })
}

async function main() {
  await app.whenReady()
  Menu.setApplicationMenu(null)
  const windows = process.platform === 'win32'
  const dark = nativeTheme.shouldUseDarkColors
  // 界面样式到位前先用引擎侧栏的默认底色，避免闪白。
  const fill = dark ? '#1b1b1c' : '#f9fafb'
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 520,
    minHeight: 600,
    title: TITLE,
    show: false,
    backgroundColor: fill,
    // 藏掉系统标题栏，界面顶到窗口边缘，只留右上角三个原生按钮。
    ...(windows ? {
      titleBarStyle: 'hidden',
      titleBarOverlay: { height: TITLEBAR_HEIGHT, color: fill, symbolColor: dark ? '#f9fafb' : '#0f1115' },
    } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  if (windows) {
    // 三个按钮的底色和符号色跟随界面主题；只接受本窗口主页面发来的 rgba() 值。
    const color = /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, [\d.]+\)$/
    ipcMain.on('campus:caption-colors', (event, background, symbol) => {
      if (window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return
      if (typeof background !== 'string' || typeof symbol !== 'string' || !color.test(background) || !color.test(symbol)) return
      window.setTitleBarOverlay({ color: background, symbolColor: symbol })
    })
  }
  // 鼠标侧键的后退：系统给的是「浏览器后退」命令，转给页面，由页面上的返回来处理（ui/client/back.ts）。
  window.on('app-command', (_event, command) => {
    if (command === 'browser-backward' && !window.isDestroyed()) window.webContents.send('campus:back')
  })
  // 页面里点开的链接（通知原文、公众号文章、对话里的网址）都在应用自己的阅读窗口里开，
  // 它复用 ZJU Core 存着的统一身份认证和 WebVPN 的会话（reader.cjs）；主窗口关了它也跟着关。
  const reader = createReader({
    BrowserWindow, session, profileDir: path.join(app.getPath('userData'), 'profile'), coreRoot: path.join(__dirname, '..', 'core'),
    dark: () => nativeTheme.shouldUseDarkColors,
  })
  // 学习页上点播放的讲解另开一个窗口放（film.cjs），别的链接照旧进阅读窗口。appOrigin 是引擎起来以后应用自己的地址。
  let appOrigin = ''
  const films = createFilms({ BrowserWindow, session, directory: () => filmDirectory(app.getPath('documents')) })
  // ChatGPT 的登录页（设置 → 模型）交给系统浏览器：那里多半已经登着，密码管理器和第三方账号登录也只有它能用；登完它跳回本机，引擎自己接。
  const openAiLogin = (url) => { try { return new URL(url).origin === 'https://auth.openai.com' } catch { return false } }
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (openAiLogin(url)) void shell.openExternal(url)
    else if (!films.open(url, appOrigin)) reader.open(url)
    return { action: 'deny' }
  })
  window.on('closed', () => { reader.close(); films.close() })
  // 关闭按钮的去向（tray.cjs）：设置里的开关打开时只是把窗口藏起来，应用留在托盘里；默认关，照旧退出。
  const show = () => {
    if (window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }
  const tray = createTray({
    Tray, Menu, file: path.join(app.getPath('userData'), 'shell.json'), title: TITLE,
    // 用程序自己的图标，和任务栏上的是同一个。
    icon: await app.getFileIcon(process.execPath, { size: 'normal' }),
    show, quit: () => { app.quit() },
  })
  window.on('close', (event) => {
    if (quitting || !tray.enabled()) return
    event.preventDefault()
    window.hide()
  })
  // 关机、注销时系统要窗口真的关掉，不能再藏。
  window.on('session-end', () => { quitting = true })
  app.on('second-instance', show)
  app.on('will-quit', () => { tray.dispose() })
  // 设置页读、改这个开关（preload.cjs 的 campusShell）；只认本窗口主页面发来的。
  const fromPage = event => !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame
  ipcMain.handle('campus:close-to-tray:get', event => fromPage(event) && tray.enabled())
  ipcMain.handle('campus:close-to-tray:set', (event, on) => fromPage(event) ? tray.set(on === true) : false)
  // 页面自己会改标题，壳的名字以我们为准。
  window.on('page-title-updated', (event) => { event.preventDefault() })
  window.once('ready-to-show', () => { window.show() })
  try {
    wereadBridge = await createWereadBridge({ app, BrowserWindow, session, ipcMain, parent: window, root: path.join(__dirname, '..'), keysFile: path.join(keysDir, 'api-keys.local.yaml') })
    const url = await startHost()
    appOrigin = new URL(url).origin
    console.log(`desktop: host ready at ${appOrigin}`)
    await window.loadURL(url)
    console.log('desktop: document loaded')
  } catch (error) {
    dialog.showErrorBox(TITLE, error instanceof Error ? error.message : String(error))
    app.quit()
  }
}

app.on('before-quit', () => {
  quitting = true
  void wereadBridge?.close()
  if (host?.connected) host.send({ type: 'shutdown' })
})
app.on('window-all-closed', () => { app.quit() })

if (first) void main()
else app.quit()
