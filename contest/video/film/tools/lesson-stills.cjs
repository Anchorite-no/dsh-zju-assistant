// 从讲解引擎打包出的一集里截几张定格，挑镜头用。
// 用法（仓库根目录）：node_modules\electron\dist\electron.exe contest\video\film\tools\lesson-stills.cjs <讲解.html> <输出目录> 12,60,130 …
// 时刻也可以写成 every:30（每 30 秒一张）。
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const [src, outDir, when = 'every:30'] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const W = 1600, H = 1000
app.commandLine.appendSwitch('force-device-scale-factor', '1')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: W, height: H, useContentSize: true, show: false, frame: false, webPreferences: { offscreen: true, backgroundThrottling: false } })
  const wc = win.webContents
  await win.loadFile(path.resolve(src))
  await wc.executeJavaScript(`new Promise(r => { const ok = () => window.film && document.fonts.status === 'loaded'; const w = () => ok() ? r() : setTimeout(w, 50); w(); })`)
  await wc.executeJavaScript('film.pause && film.pause()')
  const duration = await wc.executeJavaScript('film.duration')
  const times = when.startsWith('every:') ? [...Array(Math.floor(duration / Number(when.slice(6))) + 1).keys()].map((i) => i * Number(when.slice(6))) : when.split(',').map(Number)
  fs.mkdirSync(outDir, { recursive: true })
  for (const t of times) {
    await wc.executeJavaScript(`film.seek(${t}); new Promise(r => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 120))`)
    const img = await wc.capturePage()
    fs.writeFileSync(path.join(outDir, `t${String(Math.round(t)).padStart(5, '0')}.png`), img.toPNG())
  }
  console.log(`duration ${duration.toFixed(1)}s, ${times.length} stills`)
  app.quit()
}).catch((e) => { console.error(e); app.exit(1) })
