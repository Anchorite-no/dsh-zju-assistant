/**
 * macOS 上主窗口的玻璃效果。界面在 Mac 上（html[data-platform=darwin]，引擎的布局和侧栏自带的样式）把整页底色设成透明，
 * 侧栏只铺一层半透明的底色，对话区和右边栏是实底：窗口后面垫的是什么，侧栏就透出什么。壳这里决定垫什么：
 *   liquid    macOS 26 起系统自带的液态玻璃（NSGlassEffectView），经 electron-liquid-glass 这个原生小模块垫在网页下面。
 *             它要窗口本身是透明的，所以得在开窗口之前定下来。
 *   vibrancy  更早的系统，或者那个模块加载不了：系统的毛玻璃（NSVisualEffectView 的侧栏材质），引擎上游的 Mac 版就是这样。
 *   solid     用户在系统设置里打开了「减少透明度」，或者在 设置 → 通用设置 里关掉了玻璃效果：什么都不垫，实底。
 * 开关存在 shell.json 的 glass 里（和托盘的开关同一个文件，tray.cjs），默认开；改了以后重新打开应用才生效，窗口透不透明只能在创建时定。
 * 液态玻璃这一档是照系统的公开类做的，没在每一版 macOS 上看过；哪台机器上看着不对，关掉开关就回到实底。
 */
const fs = require('node:fs')

/** 主窗口的圆角。透明窗口的四角由我们自己裁：玻璃按这个半径裁，网页也按它裁（preload.cjs 交给页面）。 */
const CORNER_RADIUS = 16

/** 设置里的开关：文件不在、读不出来都按开；只有明确写着 false 的才算关。 */
function readGlass(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8'))?.glass !== false } catch { return true }
}

/** 改开关，文件里别的选择原样留着。 */
function writeGlass(file, on) {
  let value
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
  if (!value || typeof value !== 'object') value = {}
  fs.writeFileSync(file, JSON.stringify({ ...value, glass: on === true }) + '\n')
  return on === true
}

/** 系统版本的大版本号（process.getSystemVersion() 给的是「26.0.1」这样的）。 */
const major = version => Number.parseInt(String(version ?? ''), 10) || 0

/**
 * 这台机器上用哪一档。不是 macOS 的给 undefined（Windows 有它自己的标题栏，main.cjs 里另写）。
 * version 是系统版本，reduced 是系统的「减少透明度」开没开，enabled 是设置里的开关，
 * load 加载液态玻璃的模块，加载不了时抛错或者给 undefined。返回 { mode, glass }，glass 只有 liquid 那一档才有。
 */
function glassMode({ platform = process.platform, version, reduced = false, enabled = true, load }) {
  if (platform !== 'darwin') return undefined
  if (!enabled || reduced) return { mode: 'solid' }
  if (major(version) >= 26) {
    let glass
    try { glass = load() } catch { /* 模块不在或者加载出错 */ }
    if (typeof glass?.addView === 'function') return { mode: 'liquid', glass }
  }
  return { mode: 'vibrancy' }
}

/**
 * 开窗口时 macOS 要加的那几项。fill 是实底时的底色。
 * hiddenInset 是引擎的 Mac 布局认的标题栏：三个按钮往里缩一点，侧栏顶上那一条（52 像素）给它们让位。
 */
function windowOptions(mode, fill) {
  const chrome = { titleBarStyle: 'hiddenInset' }
  if (mode === 'liquid') return { ...chrome, transparent: true, hasShadow: true, backgroundColor: '#00000000' }
  if (mode === 'vibrancy') return { ...chrome, vibrancy: 'sidebar', visualEffectState: 'followWindow', backgroundColor: '#00000000' }
  return { ...chrome, backgroundColor: fill }
}

/**
 * 窗口开好以后把液态玻璃垫上去。垫不上（模块说不支持，或者出错）就换成毛玻璃，窗口已经是透明的，不垫的话侧栏底下什么都没有。
 * 返回最后用的是哪一档。
 */
function applyGlass(window, { mode, glass }) {
  if (mode !== 'liquid') return mode
  try {
    const id = glass.addView(window.getNativeWindowHandle(), { cornerRadius: CORNER_RADIUS })
    if (typeof id === 'number' && id >= 0) {
      // 透明窗口的三个按钮要明说一声才显示（electron-liquid-glass 的说明里要求的）。
      window.setWindowButtonVisibility?.(true)
      return 'liquid'
    }
  } catch { /* 下面换成毛玻璃 */ }
  window.setVibrancy('sidebar')
  return 'vibrancy'
}

module.exports = { CORNER_RADIUS, applyGlass, glassMode, readGlass, windowOptions, writeGlass }
