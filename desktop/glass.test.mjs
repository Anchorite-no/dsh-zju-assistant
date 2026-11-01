import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { CORNER_RADIUS, applyGlass, glassMode, readGlass, windowOptions, writeGlass } = require('./glass.cjs')

/** 假的 electron-liquid-glass：记下垫到了哪个窗口；id 是 addView 要回的值。 */
const fakeGlass = (id = 0) => ({ calls: [], addView(handle, options) { this.calls.push([handle, options]); if (id instanceof Error) throw id; return id } })

/** 假的窗口：只记下壳对它做了什么。 */
const fakeWindow = () => ({ calls: [], getNativeWindowHandle() { return 'handle' }, setWindowButtonVisibility(on) { this.calls.push(['buttons', on]) }, setVibrancy(type) { this.calls.push(['vibrancy', type]) } })

test('macOS 26 起用液态玻璃；更早的系统、模块加载不了时用毛玻璃；减少透明度或者设置里关掉时是实底；别的系统不管', () => {
  const glass = fakeGlass()
  assert.deepEqual(glassMode({ platform: 'darwin', version: '26.0.1', load: () => glass }), { mode: 'liquid', glass })
  assert.deepEqual(glassMode({ platform: 'darwin', version: '27.1', load: () => glass }), { mode: 'liquid', glass })
  assert.deepEqual(glassMode({ platform: 'darwin', version: '15.6.1', load: () => glass }), { mode: 'vibrancy' })
  // 模块不在，或者加载出来不是我们认识的样子。
  assert.deepEqual(glassMode({ platform: 'darwin', version: '26.0', load: () => { throw new Error('Cannot find module') } }), { mode: 'vibrancy' })
  assert.deepEqual(glassMode({ platform: 'darwin', version: '26.0', load: () => ({}) }), { mode: 'vibrancy' })
  assert.deepEqual(glassMode({ platform: 'darwin', version: '26.0', reduced: true, load: () => glass }), { mode: 'solid' })
  assert.deepEqual(glassMode({ platform: 'darwin', version: '15.0', enabled: false, load: () => glass }), { mode: 'solid' })
  // 实底和毛玻璃都用不着那个模块，不去加载它。
  assert.deepEqual(glassMode({ platform: 'darwin', version: '14.0', load: () => { throw new Error('不该加载') } }), { mode: 'vibrancy' })
  assert.equal(glassMode({ platform: 'win32', version: '10.0.26200', load: () => glass }), undefined)
})

test('三档各自的窗口选项：都用 hiddenInset 标题栏；液态玻璃要透明窗口，毛玻璃用侧栏材质，实底用给的底色', () => {
  assert.deepEqual(windowOptions('liquid', '#f9fafb'), { titleBarStyle: 'hiddenInset', transparent: true, hasShadow: true, backgroundColor: '#00000000' })
  assert.deepEqual(windowOptions('vibrancy', '#f9fafb'), { titleBarStyle: 'hiddenInset', vibrancy: 'sidebar', visualEffectState: 'followWindow', backgroundColor: '#00000000' })
  assert.deepEqual(windowOptions('solid', '#1b1b1c'), { titleBarStyle: 'hiddenInset', backgroundColor: '#1b1b1c' })
})

test('液态玻璃垫到窗口底下，按窗口的圆角裁；垫不上时换成毛玻璃，不让透明窗口底下空着', () => {
  const glass = fakeGlass(3), window = fakeWindow()
  assert.equal(applyGlass(window, { mode: 'liquid', glass }), 'liquid')
  assert.deepEqual(glass.calls, [['handle', { cornerRadius: CORNER_RADIUS }]])
  assert.deepEqual(window.calls, [['buttons', true]])

  for (const broken of [fakeGlass(-1), fakeGlass(new Error('native'))]) {
    const other = fakeWindow()
    assert.equal(applyGlass(other, { mode: 'liquid', glass: broken }), 'vibrancy')
    assert.deepEqual(other.calls, [['vibrancy', 'sidebar']])
  }
  // 别的两档开窗口时就定好了，这里不动。
  const plain = fakeWindow()
  assert.equal(applyGlass(plain, { mode: 'vibrancy' }), 'vibrancy')
  assert.equal(applyGlass(plain, { mode: 'solid' }), 'solid')
  assert.deepEqual(plain.calls, [])
})

test('设置里的开关默认开，只有明确关过的才是关；改的时候 shell.json 里托盘的选择原样留着', async (t) => {
  const tempRoot = resolve(tmpdir())
  const root = await mkdtemp(join(tempRoot, 'campus-glass-'))
  t.after(async () => {
    assert.ok(resolve(root).startsWith(tempRoot + sep))
    await rm(root, { recursive: true, force: true })
  })
  const file = join(root, 'shell.json')
  assert.equal(readGlass(file), true)
  for (const text of ['不是 JSON', '{}', 'null', '{"glass":"no"}']) {
    await writeFile(file, text)
    assert.equal(readGlass(file), true, text)
  }
  await writeFile(file, '{"closeToTray":false,"notify":true,"hinted":true}')
  assert.equal(writeGlass(file, false), false)
  assert.equal(readGlass(file), false)
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { closeToTray: false, notify: true, hinted: true, glass: false })
  assert.equal(writeGlass(file, true), true)
  assert.equal(readGlass(file), true)
})
