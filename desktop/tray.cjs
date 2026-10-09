/**
 * 点主窗口的关闭按钮时去哪：直接退出，还是隐藏到系统托盘。开关在 设置 → 通用设置 里，默认关（直接退出）。
 * 关窗口这件事发生在壳里，所以选择由壳自己存：应用数据目录下的 shell.json。
 * 托盘图标只在开关打开时才有；点它把主窗口叫回来，右键菜单里可以退出。
 */
const fs = require('node:fs')

/** 存着的选择。文件不在、读不出来、写的不是 true，都按关算。 */
function readCloseToTray(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).closeToTray === true } catch { return false }
}

/** file 是存选择的文件，icon 是托盘上的图标，show 把主窗口叫回来，quit 真正退出应用。返回 { enabled(), set(on), dispose() }。 */
function createTray({ Tray, Menu, file, title, icon, show, quit }) {
  let on = readCloseToTray(file)
  let tray
  function sync() {
    if (on && !tray) {
      tray = new Tray(icon)
      tray.setToolTip(title)
      tray.setContextMenu(Menu.buildFromTemplate([{ label: '打开主窗口', click: show }, { type: 'separator' }, { label: '退出', click: quit }]))
      tray.on('click', show)
    } else if (!on && tray) {
      tray.destroy()
      tray = undefined
    }
  }
  sync()
  return {
    enabled: () => on,
    set(value) {
      on = value === true
      fs.writeFileSync(file, JSON.stringify({ closeToTray: on }) + '\n')
      sync()
      return on
    },
    dispose() { if (tray) { tray.destroy(); tray = undefined } },
  }
}

module.exports = { createTray, readCloseToTray }
