// 把图标 SVG 渲染成各尺寸的透明 PNG，再打成 Windows 的 .ico（PNG 压缩的条目）；另外渲染一张 1024 的 macOS 图标。
// 用法：electron rasterize.cjs <输出目录>；32 像素及以下用简化版 app-icon-small.svg。
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const out = process.argv.at(-1)
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256, 512, 1024]
const ICO = [16, 20, 24, 32, 40, 48, 64, 128, 256]
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true })
  const win = new BrowserWindow({ show: false, width: 1024, height: 1024, transparent: true, frame: false, backgroundColor: '#00000000', useContentSize: true, webPreferences: { offscreen: true } })
  const render = async (file, size) => {
    const svg = fs.readFileSync(path.join(__dirname, file), 'utf8')
    win.setContentSize(size, size)
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)}`)
    await new Promise(r => setTimeout(r, 300))
    return (await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })).resize({ width: size, height: size, quality: 'best' }).toPNG()
  }
  const pngs = {}
  for (const size of SIZES) {
    pngs[size] = await render(size <= 32 ? 'app-icon-small.svg' : 'app-icon.svg', size)
    fs.writeFileSync(path.join(out, `app-icon-${size}.png`), pngs[size])
  }
  // macOS：electron-builder 打包时从这一张生成 .icns，各尺寸由它缩。
  fs.writeFileSync(path.join(out, 'app-icon-mac-1024.png'), await render('app-icon-mac.svg', 1024))
  // ICO：6 字节头 + 每个尺寸 16 字节目录 + PNG 数据
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(ICO.length, 4)
  const dir = Buffer.alloc(16 * ICO.length)
  let offset = 6 + dir.length
  ICO.forEach((size, i) => {
    const data = pngs[size], at = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, at); dir.writeUInt8(size >= 256 ? 0 : size, at + 1)
    dir.writeUInt8(0, at + 2); dir.writeUInt8(0, at + 3); dir.writeUInt16LE(1, at + 4); dir.writeUInt16LE(32, at + 6)
    dir.writeUInt32LE(data.length, at + 8); dir.writeUInt32LE(offset, at + 12)
    offset += data.length
  })
  fs.writeFileSync(path.join(out, 'app-icon.ico'), Buffer.concat([header, dir, ...ICO.map(size => pngs[size])]))
  app.quit()
})
