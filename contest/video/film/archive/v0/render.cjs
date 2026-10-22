// 把 index.html 一帧一帧截下来，交给 FFmpeg 编成 MP4。画面是按时间算出来的，不会掉帧，也没有录屏软件的水印。
// 在仓库根目录运行：
//   node_modules\electron\dist\electron.exe contest\video\film\archive\v0\render.cjs [--fps 60] [--from 秒] [--to 秒] [--crf 18] [--out 文件] [--png 秒,秒]
// --png 只截指定时刻的单帧（存到 out/frames），用来检查画面，不编视频。
const { app, BrowserWindow, nativeImage } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')

const argv = process.argv.slice(2)
const opt = (name, fallback) => { const i = argv.indexOf('--' + name); return i < 0 ? fallback : argv[i + 1] }
const FPS = Number(opt('fps', 60))
const CRF = String(opt('crf', 18))
const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..')
const FFMPEG = path.join(ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
const OUT = path.resolve(opt('out', path.join(__dirname, 'out', '宣传片.mp4')))
const W = 1920, H = 1080

app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('force-color-profile', 'srgb')
if (argv.includes('--cpu')) app.disableHardwareAcceleration()

async function main() {
  const win = new BrowserWindow({
    width: W, height: H + 2, useContentSize: true, show: false, frame: false,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  })
  win.webContents.setFrameRate(60)
  await win.loadFile(path.join(__dirname, 'index.html'), { query: { render: '1' } })
  await win.webContents.executeJavaScript('window.__ready.then(() => true)')
  const duration = await win.webContents.executeJavaScript('window.__video.duration')
  const wc = win.webContents

  // 离屏窗口没人接 paint 时不出新帧，capturePage 会拿到旧画面；挂一个空的接收者让它照常出帧。
  wc.on('paint', () => {})
  // 页面在画面下面 2 像素的地方写着帧号；截到的帧号对不上（GPU 偶尔交出旧帧）就再截，最后只要上面 1080 行。
  let retries = 0
  async function grab(t, f) {
    await wc.executeJavaScript(`window.__video.seek(${t.toFixed(6)}, ${f})`)
    for (let k = 0; ; k++) {
      let image = await wc.capturePage()
      const size = image.getSize()
      if (size.width !== W || size.height !== H + 2) image = image.resize({ width: W, height: H + 2, quality: 'best' })
      const bmp = image.toBitmap(), i = ((H + 1) * W + 4) * 4
      if ((Math.abs(bmp[i + 2] - (f & 255)) <= 1 && Math.abs(bmp[i + 1] - (f >> 8 & 255)) <= 1) || k >= 30) {
        if (k >= 30) console.warn(`\n第 ${f} 帧没有等到新画面`)
        return bmp.subarray(0, W * H * 4)
      }
      retries++
      await new Promise(r => setTimeout(r, 8))
    }
  }

  const pngs = opt('png')
  if (pngs) {
    const dir = path.join(__dirname, 'out', 'frames'); fs.mkdirSync(dir, { recursive: true })
    for (const t of String(pngs).split(',').map(Number)) {
      const file = path.join(dir, `t${t.toFixed(2)}.png`)
      fs.writeFileSync(file, nativeImage.createFromBitmap(Buffer.from(await grab(t, Math.round(t * FPS))), { width: W, height: H }).toPNG())
      console.log(file)
    }
    return
  }

  const from = Number(opt('from', 0)), to = Math.min(Number(opt('to', duration)), duration)
  const f0 = Math.round(from * FPS), f1 = Math.round(to * FPS)
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  const ff = spawn(FFMPEG, ['-y', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'ignore', 'pipe'] })
  let err = ''; ff.stderr.on('data', d => { err = (err + d).slice(-4000) })
  const done = new Promise((resolve, reject) => ff.on('close', code => code === 0 ? resolve() : reject(new Error('FFmpeg 出错：\n' + err))))
  const started = Date.now()
  for (let f = f0; f < f1; f++) {
    const buf = await grab(f / FPS, f)
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r))
    if ((f - f0) % (FPS * 2) === 0) process.stdout.write(`\r${((f - f0) / (f1 - f0) * 100).toFixed(1)}%  ${(f / FPS).toFixed(1)}s / ${to.toFixed(1)}s  `)
  }
  ff.stdin.end()
  await done
  console.log(`\n写好了 ${OUT}（${f1 - f0} 帧，重截 ${retries} 次，用了 ${((Date.now() - started) / 1000).toFixed(0)} 秒）`)
}

app.whenReady().then(main).then(() => app.quit(), e => { console.error(e); app.exit(1) })
