/**
 * 放讲解的窗口。讲解是 learn 技能打包出来的单个 HTML，都在 <文档>\CampusAgent\讲解\dist 里；
 * 学习页上点播放，页面请求打开「应用自己的地址/campus-film/文件名」，壳在这里按文件名到那个文件夹里找，另开一个窗口放。
 * 页面给的只是一个文件名：不认路径，不认别的文件夹，不认 .html 以外的文件。
 * 讲解里的脚本是助手写的，所以窗口开沙箱、不给 Node、用自己的会话，也不让它跳到别的地址或再开窗口。
 */
const fs = require('node:fs')
const path = require('node:path')

const PREFIX = '/campus-film/'

/** 这个地址说的是哪一条讲解：不是讲解的地址给 undefined；是的话给文件名，名字不合规矩时给空字符串。origin 是应用自己的地址。 */
function filmName(url, origin) {
  let target
  try { target = new URL(url) } catch { return undefined }
  if (!origin || target.origin !== origin || !target.pathname.startsWith(PREFIX)) return undefined
  let name
  try { name = decodeURIComponent(target.pathname.slice(PREFIX.length)) } catch { return '' }
  return name && name === path.basename(name) && !/[\\/:*?"<>|]/.test(name) && name.toLowerCase().endsWith('.html') ? name : ''
}

/** 讲解目录的成品文件夹；CAMPUS_CHATS_DIR 把 <文档>\CampusAgent 整个换掉时跟着换（和引擎侧的 ui/profile/chats.mjs 一致）。 */
function filmDirectory(documents, env = process.env) {
  return path.join(env.CAMPUS_CHATS_DIR ? path.resolve(env.CAMPUS_CHATS_DIR) : path.join(documents, 'CampusAgent'), '讲解', 'dist')
}

const notePage = text => `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>校园智能体</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#1b1b1c;color:#c8c8c8;font:14px/1.6 system-ui,sans-serif">${text}</body>`)}`

/** directory 返回成品文件夹。返回 { open(url, origin), close() }：open 认出是讲解就自己打开并返回 true，不是就返回 false。 */
function createFilms({ BrowserWindow, session, directory }) {
  let window
  const alive = () => window && !window.isDestroyed()
  function open(url, origin) {
    const name = filmName(url, origin)
    if (name === undefined) return false
    if (!alive()) {
      window = new BrowserWindow({
        width: 1280, height: 800, minWidth: 640, minHeight: 400, title: '校园智能体', show: false, autoHideMenuBar: true, backgroundColor: '#1b1b1c',
        webPreferences: { session: session.fromPartition('campus-film'), sandbox: true, contextIsolation: true, nodeIntegration: false },
      })
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      // 只放我们自己装进去的那一页，页面里的链接和脚本不能把窗口带到别处。
      window.webContents.on('will-navigate', (event) => { event.preventDefault() })
      window.on('closed', () => { window = undefined })
    }
    const file = name ? path.join(directory(), name) : ''
    if (file && fs.existsSync(file)) void window.loadFile(file).catch(() => {})
    else void window.loadURL(notePage('这条讲解已经不在原来的位置了。')).catch(() => {})
    window.show()
    window.focus()
    return true
  }
  return { open, close: () => { if (alive()) window.close() } }
}

module.exports = { createFilms, filmName, filmDirectory }
