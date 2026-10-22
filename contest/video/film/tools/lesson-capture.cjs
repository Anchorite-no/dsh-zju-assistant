// 把应用讲解引擎打包出来的一集（单个 HTML）逐帧截成视频，放进成片里的讲解窗口。
// 播放器提供 window.film.seek(t)：任意时刻的画面都能单独画出来。
// 用法（仓库根目录）：node_modules\electron\dist\electron.exe contest\video\film\tools\lesson-capture.cjs <讲解.html> <输出.mp4> [--fps 30] [--from 秒 --to 秒]
// 不给 --from/--to 时录整集，末尾多停一秒。
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const { spawn } = require('node:child_process')

const [src, out] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] || '').startsWith('--'))
const opt = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? Number(process.argv[i + 1]) : dflt }
const FPS = opt('--fps', 30), FROM = opt('--from', null), TO = opt('--to', null)
const W = 1600, H = 1000, S = 2
const FFMPEG = path.resolve(__dirname, '..', '..', '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
app.commandLine.appendSwitch('force-device-scale-factor', String(S))
app.commandLine.appendSwitch('force-color-profile', 'srgb')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: W, height: H + 2, useContentSize: true, show: false, frame: false, webPreferences: { offscreen: true, backgroundThrottling: false } })
  win.webContents.setFrameRate(60)
  const wc = win.webContents
  wc.on('paint', () => {})
  await win.loadFile(path.resolve(src))
  await wc.executeJavaScript(`new Promise(r => { const ok = () => window.film && document.fonts.status === 'loaded'; const w = () => ok() ? r() : setTimeout(w, 50); w(); })`)
  await wc.executeJavaScript(`(() => { const m = document.createElement('div'); m.id = '__mk'; m.style.cssText = 'position:fixed;left:0;bottom:0;width:16px;height:2px;z-index:99999'; document.body.appendChild(m); film.pause && film.pause(); })()`)
  const duration = await wc.executeJavaScript('film.duration')
  const t0 = FROM ?? 0, t1 = TO ?? duration
  const frames = FROM === null && TO === null ? Math.ceil(duration * FPS) + FPS : Math.round((t1 - t0) * FPS) // 整集时末尾多停一秒
  const ff = spawn(FFMPEG, ['-y', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${W * S}x${H * S}`, '-r', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.resolve(out)], { stdio: ['pipe', 'ignore', 'inherit'] })
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))))
  for (let f = 0; f < frames; f++) {
    const t = Math.min(t0 + f / FPS, duration)
    await wc.executeJavaScript(`film.seek(${t}); document.getElementById('__mk').style.background = 'rgb(${f & 255},${(f >> 8) & 255},0)'; new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`)
    let bmp
    for (let k = 0; k < 40; k++) {
      let img = await wc.capturePage()
      const sz = img.getSize()
      if (sz.width !== W * S || sz.height !== (H + 2) * S) img = img.resize({ width: W * S, height: (H + 2) * S })
      bmp = img.toBitmap()
      const i = (((H + 2) * S - 1) * W * S + 4) * 4
      if (Math.abs(bmp[i + 2] - (f & 255)) <= 1 && Math.abs(bmp[i + 1] - ((f >> 8) & 255)) <= 1) break
      await new Promise((r) => setTimeout(r, 10))
    }
    if (!ff.stdin.write(bmp.subarray(0, W * S * H * S * 4))) await new Promise((r) => ff.stdin.once('drain', r))
  }
  ff.stdin.end()
  await done
  console.log(`${out}  ${duration.toFixed(2)}s, ${frames} frames`)
  app.quit()
}).catch((e) => { console.error(e); app.exit(1) })
