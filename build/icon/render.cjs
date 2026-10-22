// 把 preview.html 渲染成 PNG（只看效果用）。用法：electron render.cjs <html> <png> <宽> <高>
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const [html, png, w, h] = process.argv.slice(-4)
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: +w, height: +h, useContentSize: true, webPreferences: { offscreen: true } })
  await win.loadFile(html)
  await new Promise(r => setTimeout(r, 800))
  fs.writeFileSync(png, (await win.webContents.capturePage()).toPNG())
  app.quit()
})
