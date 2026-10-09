/**
 * 最小的自写壳：一个窗口 + 一个引擎子进程。
 * 壳只负责窗口、名字和进程生命周期；界面由引擎的 Web 应用提供，壳直接加载它的地址。
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, session } = require('electron')
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

// 数据放在我们自己的目录，不碰用户的 ~/.dsh。
const home = path.join(app.getPath('userData'), 'home')
const workspace = path.join(app.getPath('userData'), 'workspace')
mkdirSync(home, { recursive: true })
mkdirSync(workspace, { recursive: true })

let host
let wereadBridge
let quitting = false

function startHost() {
  return new Promise((resolve, reject) => {
    host = fork(path.join(__dirname, 'host.mjs'), [], {
      cwd: workspace,
      env: { ...process.env, ...wereadBridge?.env, ...ffmpegEnv(), CAMPUS_PROFILE_DIR: path.join(app.getPath('userData'), 'profile'), DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', ELECTRON_RUN_AS_NODE: '1' },
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
  window.webContents.setWindowOpenHandler(({ url }) => { if (!films.open(url, appOrigin)) reader.open(url); return { action: 'deny' } })
  window.on('closed', () => { reader.close(); films.close() })
  // 页面自己会改标题，壳的名字以我们为准。
  window.on('page-title-updated', (event) => { event.preventDefault() })
  window.once('ready-to-show', () => { window.show() })
  try {
    wereadBridge = await createWereadBridge({ app, BrowserWindow, session, ipcMain, parent: window, root: path.join(__dirname, '..') })
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

void main()
