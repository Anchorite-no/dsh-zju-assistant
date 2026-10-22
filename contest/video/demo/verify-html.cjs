/**
 * 核对静态快照：用项目里的 Electron 离屏打开 shots/v2/html/*.html（视口 1600×1000，不跑脚本），
 * 截一张，和同名的 PNG 缩到 1600×1000 以后逐像素比。结果写在 html/verify.json，对比图存在 --out 给的文件夹（默认不存）。
 * 用法（仓库根目录）：node_modules/electron/dist/electron.exe contest/video/demo/verify-html.cjs [--out 文件夹]
 */
const { app, BrowserWindow, nativeImage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const SHOTS = path.join(__dirname, '..', 'shots', 'v2')
const HTML = path.join(SHOTS, 'html')
const outAt = process.argv.indexOf('--out')
const OUT = outAt > 0 ? process.argv[outAt + 1] : null

app.disableHardwareAcceleration()

let win
/** 一个离屏窗口轮流打开每一份；打开失败的再试一次。 */
async function render(file) {
  win ??= new BrowserWindow({ show: false, width: 1600, height: 1000, useContentSize: true, webPreferences: { offscreen: true, javascript: false, backgroundThrottling: false } })
  win.webContents.setFrameRate(30)
  for (let attempt = 0; ; attempt++) {
    try { await win.loadFile(file); break } catch (error) { if (attempt >= 2) throw error; await new Promise(resolve => setTimeout(resolve, 500)) }
  }
  await new Promise(resolve => setTimeout(resolve, 1500))
  return win.webContents.capturePage({ x: 0, y: 0, width: 1600, height: 1000 })
}

function compare(a, b) {
  const size = a.getSize(), left = a.toBitmap(), right = b.resize({ width: size.width, height: size.height, quality: 'best' }).toBitmap()
  let differ = 0, total = 0
  for (let i = 0; i < left.length; i += 4) {
    const delta = (Math.abs(left[i] - right[i]) + Math.abs(left[i + 1] - right[i + 1]) + Math.abs(left[i + 2] - right[i + 2])) / 3
    total += delta
    if (delta > 32) differ++
  }
  const pixels = left.length / 4
  return { differentPixels: Math.round(differ / pixels * 10000) / 100, meanDelta: Math.round(total / pixels * 100) / 100 }
}

app.whenReady().then(async () => {
  const report = []
  for (const name of fs.readdirSync(HTML).filter(file => file.endsWith('.html')).map(file => file.slice(0, -5)).sort()) {
    const png = path.join(SHOTS, `${name}.png`)
    if (!fs.existsSync(png)) continue
    let image
    try { image = await render(path.join(HTML, `${name}.html`)) } catch (error) { report.push({ name, error: String(error.message) }); console.log(`${name} 打不开：${error.message}`); continue }
    const result = { name, htmlKB: Math.round(fs.statSync(path.join(HTML, `${name}.html`)).size / 1024), ...compare(image, nativeImage.createFromPath(png)) }
    if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, `${name}.png`), image.toPNG()) }
    report.push(result)
    console.log(`${name.padEnd(20)} ${String(result.htmlKB).padStart(6)} KB  不同的像素 ${result.differentPixels}%  平均差 ${result.meanDelta}`)
  }
  fs.writeFileSync(path.join(HTML, 'verify.json'), JSON.stringify(report, null, 2) + '\n')
  app.quit()
})
