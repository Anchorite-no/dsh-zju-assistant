/**
 * 页面加载前运行。系统标题栏被壳藏掉了，这里告诉界面「顶部 40px 是窗口栏」，
 * 界面自带的布局（html[data-windows-titlebar]）会据此让出位置并提供拖动区。
 * 同时把界面的侧栏底色和文字色报给壳，让右上角三个按钮跟着主题变色。
 * 做法照上游 apps/desktop/src/preload-windows.ts，去掉了它的原生菜单。
 * macOS 上换成另一套标记：html[data-platform=darwin]（引擎的 Mac 布局：左上角给三个按钮让位、侧栏透出窗口后面垫的玻璃），
 * 全屏时再加 html[data-fullscreen]；html[data-campus-glass] 说窗口后面垫的是哪一档（glass.cjs），我们自己的样式按它裁圆角。
 * 另外给页面一个 campusShell，用来读、改存在壳这边的设置。
 */
const { contextBridge, ipcRenderer } = require('electron')

// The engine's Desktop shortcut service requires these capabilities before activation.
// IPC events themselves never cross the isolation boundary.
if (process.isMainFrame) {
  const subscribe = channel => listener => {
    const handler = (_event, value) => listener(value)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
  contextBridge.exposeInMainWorld('dshDesktop', {
    shortcuts: {
      get: definitions => ipcRenderer.invoke('campus:shortcuts:get', definitions),
      edit: (edit, revision) => ipcRenderer.invoke('campus:shortcuts:edit', edit, revision),
      recording: active => ipcRenderer.invoke('campus:shortcuts:recording', active),
      subscribe: subscribe('campus:shortcuts:changed'),
    },
    keyboard: {
      subscribe: subscribe('campus:keyboard:input'),
      closeWindow: revision => ipcRenderer.invoke('campus:keyboard:close', revision),
    },
  })
}

const TITLEBAR_HEIGHT = 40

/** 壳开窗口时经命令行参数交过来的值（main.cjs 的 additionalArguments）。 */
const argument = name => process.argv.find(item => item.startsWith(`--${name}=`))?.slice(name.length + 3)
const GLASS = ['liquid', 'vibrancy', 'solid'].includes(argument('campus-glass')) ? argument('campus-glass') : 'solid'
const CORNER = Number.parseInt(argument('campus-corner') ?? '', 10) || 0

function mark() {
  const root = document.documentElement
  if (root === null) return false
  if (process.platform === 'darwin') {
    root.dataset.platform = 'darwin'
    root.dataset.campusGlass = GLASS
    root.style.setProperty('--campus-window-radius', `${CORNER}px`)
    return true
  }
  root.dataset.windowsTitlebar = ''
  root.style.setProperty('--dsh-windows-titlebar-height', `${TITLEBAR_HEIGHT}px`)
  return true
}

function syncCaptionColors() {
  const probe = document.createElement('span')
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;background-color:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-primary)'
  document.body.append(probe)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  // 任意 CSS 颜色写法统一成 rgba()，壳只接受这一种。
  const nativeColor = (color) => {
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = color
    context.fillRect(0, 0, 1, 1)
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
    return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`
  }
  let previous = ''
  const send = () => {
    const style = getComputedStyle(probe)
    const colors = [nativeColor(style.backgroundColor), nativeColor(style.color)]
    const current = colors.join('|')
    if (current === previous) return
    previous = current
    ipcRenderer.send('campus:caption-colors', ...colors)
  }
  const observer = new MutationObserver(send)
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'style'] })
  observer.observe(document.head, { childList: true, subtree: true, characterData: true })
  document.head.addEventListener('load', send, true)
  send()
}

// 壳转来的「后退」（鼠标侧键）：变成窗口上的一个事件，页面上的返回听它（ui/client/back.ts）。
ipcRenderer.on('campus:back', () => { window.dispatchEvent(new Event('campus:back')) })

// 检查更新的状态变了（开始下载、下到百分之几、下好了）：壳喊一声，页面听到后自己来读（ui/client/UpdateRow.tsx）。
ipcRenderer.on('campus:update', () => { window.dispatchEvent(new Event('campus:update')) })

// 托盘上点了一条消息：壳喊一声，页面听到后来取要打开哪里（ui/client/alerts.ts）。
ipcRenderer.on('campus:open', () => { window.dispatchEvent(new Event('campus:open')) })

// 存在壳这边的几样设置，页面经这些函数读和改：
// 「关闭窗口时隐藏到系统托盘」的开关（tray.cjs，ui/client/TrayRow.tsx），检查更新（update.cjs，ui/client/UpdateRow.tsx），
// 和 macOS 上窗口的玻璃效果（glass.cjs，也在 TrayRow.tsx）。
contextBridge.exposeInMainWorld('campusShell', {
  closeToTray: () => ipcRenderer.invoke('campus:close-to-tray:get'),
  setCloseToTray: on => ipcRenderer.invoke('campus:close-to-tray:set', on === true),
  // 「新消息时弹出系统通知」的开关（tray.cjs）。
  notify: () => ipcRenderer.invoke('campus:notify:get'),
  setNotify: on => ipcRenderer.invoke('campus:notify:set', on === true),
  notifyBlocked: () => ipcRenderer.invoke('campus:notify:blocked'),
  update: () => ipcRenderer.invoke('campus:update:get'),
  checkUpdate: () => ipcRenderer.invoke('campus:update:check'),
  installUpdate: () => ipcRenderer.invoke('campus:update:install'),
  saveUpdateToken: token => ipcRenderer.invoke('campus:update:token', String(token ?? '')),
  // 托盘上点的那条消息要打开哪里（tray.cjs）：一个对话或侧栏上的一页，取一次就没了。
  takeOpen: () => ipcRenderer.invoke('campus:open:take'),
  // 跑在哪种系统上（win32、darwin）：设置页上有几行的说法跟着变，有的插件只能在 Windows 上用。
  platform: process.platform,
  // 「窗口的玻璃效果」（glass.cjs，macOS 才有）：{ on, mode, reduced }，别的系统上是 undefined。
  glass: () => ipcRenderer.invoke('campus:glass:get'),
  setGlass: on => ipcRenderer.invoke('campus:glass:set', on === true),
})

if (process.platform === 'win32' || process.platform === 'darwin') {
  // 根元素可能还没被解析器创建，等它出现再标记，保证早于界面第一次渲染。
  if (!mark()) {
    const waiting = new MutationObserver(() => { if (mark()) waiting.disconnect() })
    waiting.observe(document, { childList: true })
  }
  const install = () => { mark(); if (process.platform === 'win32') syncCaptionColors() }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', install, { once: true })
  else install()
}

// macOS 的全屏：壳在进出全屏和页面加载完时报一次。
ipcRenderer.on('campus:fullscreen', (_event, on) => { document.documentElement?.toggleAttribute('data-fullscreen', on === true) })
