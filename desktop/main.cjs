/**
 * 最小的自写壳：一个窗口 + 一个引擎子进程。
 * 壳只负责窗口、名字和进程生命周期；界面由引擎的 Web 应用提供，壳直接加载它的地址。
 */
const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, nativeTheme, safeStorage, screen, session, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const { createTray } = require('./tray.cjs')
const { createPane } = require('./pane.cjs')
const { createUpdater, githubToken } = require('./update.cjs')
const { createWereadBridge } = require('./weread.cjs')
const { createReader } = require('./reader.cjs')
const { ffmpegEnv } = require('./ffmpeg.cjs')
const { nodeEnv } = require('./node.cjs')
const { createFilms, filmDirectory } = require('./film.cjs')
const { execFile, fork } = require('node:child_process')
const { mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const path = require('node:path')

const TITLE = '校园智能体'
/** 窗口栏高度，和 preload.cjs 里告诉界面的数字一致。 */
const TITLEBAR_HEIGHT = 40
/** 窗口宽度的下限。 */
const MIN_WIDTH = 520

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
/** 引擎说有一条新消息（公众号有新文章、助手提醒的事）时叫它；主窗口和托盘都在了才接上。 */
let onAlert = () => {}

function startHost() {
  return new Promise((resolve, reject) => {
    host = fork(path.join(__dirname, 'host.mjs'), [], {
      cwd: workspace,
      // nodeEnv：把应用自己带的 Node 以「node」这个名字交给引擎启动的命令（node.cjs）。
      env: { ...process.env, ...wereadBridge?.env, ...ffmpegEnv(), ...nodeEnv({ dir: path.join(app.getPath('userData'), 'bin') }), CAMPUS_PROFILE_DIR: path.join(app.getPath('userData'), 'profile'), CAMPUS_KEYS_DIR: keysDir, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    })
    host.on('message', (message) => {
      if (message?.type === 'ready') resolve(message.url)
      else if (message?.type === 'fatal') reject(new Error(message.message))
      else if (message?.type === 'alert') onAlert(message.alert)
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
    minWidth: MIN_WIDTH,
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
  // 用程序自己的图标，和任务栏上的是同一个。有新消息时它和一张同样大小的空白图来回换，看着就是在闪。
  const trayIcon = await app.getFileIcon(process.execPath, { size: 'normal' })
  const { width: iconWidth, height: iconHeight } = trayIcon.getSize()
  /** 托盘上点了一条消息以后，页面来取的「要打开哪里」（一个对话，或者侧栏上的一页）。 */
  let opening
  const tray = createTray({
    Tray, Menu, file: path.join(app.getPath('userData'), 'shell.json'), title: TITLE,
    icon: trayIcon,
    blank: nativeImage.createFromBitmap(Buffer.alloc(iconWidth * iconHeight * 4), { width: iconWidth, height: iconHeight }),
    show, quit: () => { app.quit() },
    open: (alert) => {
      show()
      opening = alert.sessionId ? { sessionId: alert.sessionId } : alert.panel ? { panel: alert.panel } : undefined
      if (opening && !window.isDestroyed()) window.webContents.send('campus:open')
    },
  })
  onAlert = (input) => {
    // 人正看着主窗口时不闪：页面上自己有标记（通知前的小圆点、对话那一行的未读点）。
    if (window.isDestroyed() || window.isFocused()) return
    if (!tray.alert(input)) return
    // 窗口没藏起来（最小化了，或者被别的窗口盖着）时，任务栏上的按钮也跟着闪。
    if (window.isVisible()) window.flashFrame(true)
  }
  // 人回到主窗口，消息就算看过了。
  window.on('focus', () => { tray.clear(); window.flashFrame(false) })
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
  // 托盘上点了一条消息：壳喊一声（campus:open），页面来取要打开哪里，取走就清掉（ui/client/alerts.ts）。
  ipcMain.handle('campus:open:take', (event) => {
    if (!fromPage(event)) return undefined
    const target = opening
    opening = undefined
    return target
  })
  // 右边栏向右打开（pane.cjs）：页面报来右边栏要多宽，窗口跟着加宽、缩回，回给页面实际加了多少。
  const pane = createPane({ window, screen, minWidth: MIN_WIDTH })
  ipcMain.handle('campus:side-pane', (event, width, instant) =>
    fromPage(event) && typeof width === 'number' && width >= 0 && width <= 4000 ? pane.set(width, instant === true) : 0)
  // 检查更新（update.cjs）。读私有仓库要 GitHub 令牌：设置里填的那个用系统的加密存在数据目录里，没填就问本机的 GitHub CLI。
  const tokenFile = path.join(app.getPath('userData'), 'update-token')
  const savedToken = () => { try { return safeStorage.decryptString(readFileSync(tokenFile)) } catch { return undefined } }
  const run = (command, args) => new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 5000, windowsHide: true }, (error, stdout) => { if (error) reject(error); else resolve(stdout) })
  })
  const updater = createUpdater({
    autoUpdater, packaged: app.isPackaged, version: app.getVersion(),
    // 更新源是打包时按 package.json 的 build.publish 写好的。
    feed: () => require('js-yaml').load(readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8')),
    token: () => githubToken({ env: process.env, saved: savedToken, run }),
    ask: async (version) => {
      const options = {
        type: 'info', title: TITLE, message: `新版本 ${version} 已下载`, detail: '现在安装的话，应用会关闭，装好后自己重新打开。选稍后，会在下次退出应用时装上。',
        buttons: ['立即安装并重启', '稍后'], defaultId: 0, cancelId: 1, noLink: true,
      }
      // 窗口藏在托盘里时不把它叫出来，单独弹这一问。
      const { response } = window.isDestroyed() || !window.isVisible() ? await dialog.showMessageBox(options) : await dialog.showMessageBox(window, options)
      return response === 0
    },
    onChange: () => { if (!window.isDestroyed()) window.webContents.send('campus:update') },
  })
  app.on('will-quit', updater.start())
  ipcMain.handle('campus:update:get', event => fromPage(event) ? updater.state() : undefined)
  ipcMain.handle('campus:update:check', event => fromPage(event) ? updater.check() : undefined)
  ipcMain.handle('campus:update:install', (event) => { if (fromPage(event)) updater.install() })
  ipcMain.handle('campus:update:token', (event, text) => {
    if (!fromPage(event) || typeof text !== 'string') return undefined
    if (text.trim()) writeFileSync(tokenFile, safeStorage.encryptString(text.trim()))
    else rmSync(tokenFile, { force: true })
    return updater.check()
  })
  // 页面自己会改标题，壳的名字以我们为准。
  window.on('page-title-updated', (event) => { event.preventDefault() })
  window.once('ready-to-show', () => { window.show() })
  try {
    // 微信公众号插件的浏览器由壳提供（weread.cjs）；要在引擎起来之前开好，地址随环境变量交给它。
    wereadBridge = await createWereadBridge({
      BrowserWindow, ipcMain, session, parent: window, coreRoot: path.join(__dirname, '..', 'core'),
      dataDir: path.join(app.getPath('userData'), 'weread'), profileDir: path.join(app.getPath('userData'), 'profile'), keysFile: path.join(keysDir, 'api-keys.local.yaml'),
    })
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
  wereadBridge?.close()
  if (host?.connected) host.send({ type: 'shutdown' })
})
app.on('window-all-closed', () => { app.quit() })

if (first) void main()
else app.quit()
