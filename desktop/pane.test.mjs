import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { EMPTY, planPane, createPane } = require('./pane.cjs')

const workArea = { x: 0, y: 0, width: 1920, height: 1040 }
const at = (x, width) => ({ x, y: 100, width, height: 820 })

test('右边有地方就只往右加，对话那一段不动；收起时原样缩回去', () => {
  const opened = planPane({ bounds: at(200, 1280), workArea, want: 420 })
  assert.deepEqual(opened.bounds, at(200, 1700))
  assert.deepEqual(opened.state, { added: 420, shift: 0, set: at(200, 1700) })
  // 页面重新加载后再报一次同样的宽度，不重复加。
  assert.equal(planPane({ bounds: opened.bounds, workArea, state: opened.state, want: 420 }).bounds, undefined)
  const closed = planPane({ bounds: opened.bounds, workArea, state: opened.state, want: 0 })
  assert.deepEqual(closed.bounds, at(200, 1280))
  assert.equal(closed.state.added, 0)
})

test('右边不够时把窗口往左挪着加，收起时挪回来；人自己动过窗口就不往回挪', () => {
  const opened = planPane({ bounds: at(500, 1280), workArea, want: 420 })
  // 右边只有 140，剩下 280 靠往左挪。
  assert.deepEqual(opened.bounds, at(220, 1700))
  assert.deepEqual([opened.state.added, opened.state.shift], [420, 280])
  assert.deepEqual(planPane({ bounds: opened.bounds, workArea, state: opened.state, want: 0 }).bounds, at(500, 1280))
  // 拖宽右边栏（要的更多）接着加；拖窄只还一部分，先还往左挪的。
  const wider = planPane({ bounds: opened.bounds, workArea, state: opened.state, want: 520 })
  assert.deepEqual(wider.bounds, at(120, 1800))
  const narrower = planPane({ bounds: wider.bounds, workArea, state: wider.state, want: 320 })
  assert.deepEqual(narrower.bounds, at(320, 1600))
  assert.deepEqual([narrower.state.added, narrower.state.shift], [320, 180])
  // 打开以后人把窗口拖到了别处：收起时只缩宽度。
  const dragged = { ...opened.bounds, x: 100 }
  assert.deepEqual(planPane({ bounds: dragged, workArea, state: opened.state, want: 0 }).bounds, { ...dragged, width: 1280 })
})

test('屏幕放不下就加到放得下为止，剩下的由页面去让；最大化、全屏时不动窗口', () => {
  const small = { x: 0, y: 0, width: 1536, height: 824 }
  const opened = planPane({ bounds: at(100, 1280), workArea: small, want: 420 })
  assert.deepEqual(opened.bounds, at(0, 1536))
  assert.equal(opened.state.added, 256)
  // 已经占满了：一点都加不了。
  const full = planPane({ bounds: at(0, 1536), workArea: small, want: 420 })
  assert.equal(full.bounds, undefined)
  assert.equal(full.state.added, 0)
  // 最大化着：不动，之前加的也不再记着。
  const fixed = planPane({ bounds: at(0, 1920), workArea, fixed: true, state: { added: 420, shift: 0, set: at(200, 1700) }, want: 0 })
  assert.equal(fixed.bounds, undefined)
  assert.equal(fixed.state, EMPTY)
  // 缩回去不低于窗口宽度的下限。
  const tight = planPane({ bounds: at(0, 700), workArea, minWidth: 520, state: { added: 420, shift: 0, set: at(0, 700) }, want: 0 })
  assert.deepEqual(tight.bounds, at(0, 520))
  // 乱给的宽度当 0。
  assert.equal(planPane({ bounds: at(0, 1280), workArea, want: Number.NaN }).bounds, undefined)
})

test('缩放不是整数倍的屏幕：位置读回来差一个像素不算人动过，按我们自己摆的数算，开合多少次都不走偏', () => {
  // 150% 的屏幕上实测到的样子：设进去 1716，读回来是 1717；设进去 1296，读回来是 1297。
  const screen = { x: 0, y: 0, width: 1960, height: 1178 }
  const start = { x: 325, y: 178, width: 1296, height: 820 }
  const off = spot => ({ x: spot.x, y: spot.y + 1, width: spot.width + 1, height: spot.height - 1 })
  let bounds = start, state
  for (let round = 0; round < 5; round++) {
    const opened = planPane({ bounds, workArea: screen, state, want: 420 })
    assert.deepEqual(opened.bounds, { x: 244, y: 178, width: 1716, height: 820 })
    const closed = planPane({ bounds: off(opened.bounds), workArea: screen, state: opened.state, want: 0 })
    assert.deepEqual(closed.bounds, start)
    assert.deepEqual([closed.state.added, closed.state.shift], [0, 0])
    bounds = off(closed.bounds)
    state = closed.state
  }
  // 真的被人拖走了（差得多）：从读到的位置算，只缩宽度。
  const opened = planPane({ bounds: start, workArea: screen, want: 420 })
  const dragged = { ...opened.bounds, x: 100 }
  assert.deepEqual(planPane({ bounds: dragged, workArea: screen, state: opened.state, want: 0 }).bounds, { ...dragged, width: 1296 })
  // 收起以后人把窗口拉宽了：下一次打开从拉宽以后的算。
  const closed = planPane({ bounds: opened.bounds, workArea: screen, state: opened.state, want: 0 })
  const resized = { ...start, width: 1400 }
  assert.deepEqual(planPane({ bounds: resized, workArea: screen, state: closed.state, want: 420 }).bounds, { ...resized, x: 140, width: 1820 })
})

/** 假的窗口和定时器：记下每一次摆放，时间由测试往前拨。 */
function fixture({ maximized = false } = {}) {
  let bounds = at(200, 1280), clock = 0, tick
  const moves = []
  const window = {
    isDestroyed: () => false, isMaximized: () => maximized, isFullScreen: () => false, isMinimized: () => false,
    getBounds: () => ({ ...bounds }),
    setBounds: (next) => { bounds = { ...next }; moves.push(next.width) },
  }
  const timers = { setInterval: (run) => { tick = run; return 1 }, clearInterval: () => { tick = undefined }, now: () => clock }
  const pane = createPane({ window, screen: { getDisplayMatching: () => ({ workArea }) }, minWidth: 520, duration: 160, timers })
  return { pane, moves, bounds: () => bounds, advance: (ms) => { clock += ms; tick?.() }, ticking: () => tick !== undefined }
}

test('窗口是一步步拉开的，走完才告诉页面加了多少；不要动效时一步到位', async () => {
  const f = fixture()
  const opening = f.pane.set(420)
  f.advance(80)
  assert.ok(f.moves[0] > 1280 && f.moves[0] < 1700)
  f.advance(80)
  assert.equal(await opening, 420)
  assert.equal(f.bounds().width, 1700)
  assert.equal(f.ticking(), false)
  // 走到一半又收起：先到位，再从那里缩回去。
  const again = f.pane.set(0)
  f.advance(40)
  const reopened = f.pane.set(420, true)
  assert.equal(await again, 0)
  assert.equal(await reopened, 420)
  assert.equal(f.bounds().width, 1700)
  assert.equal(await f.pane.set(0, true), 0)
  assert.equal(f.bounds().width, 1280)
})

test('最大化时窗口不动，页面得到 0', async () => {
  const f = fixture({ maximized: true })
  assert.equal(await f.pane.set(420), 0)
  assert.deepEqual(f.moves, [])
})
