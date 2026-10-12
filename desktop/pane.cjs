/**
 * 右边栏向右打开：页面上的右边栏占多宽，窗口就加宽多少，中间的对话不被挤窄；右边栏收起，窗口缩回去。
 * 引擎自己的做法是右边栏从对话区里让出地方（占窗口的 45%），1280 的窗口里对话只剩四百来像素。
 *
 * 页面报来右边栏现在要的宽度（ui/client/rightpane.ts），这里算窗口怎么变：先往右加；右边到了屏幕边上，
 * 不够的部分把窗口往左挪着加；还不够就只加这么多，剩下的由页面照引擎原样从对话区里让。
 * 最大化和全屏时不动窗口。加了多少记在这里，页面重新加载后再报一次同样的宽度不会重复加。
 */

/** 没加过任何宽度的状态。added 是一共加了多少，shift 是其中靠往左挪得来的，set 是上一次由我们摆好的位置。 */
const EMPTY = Object.freeze({ added: 0, shift: 0, set: undefined })

/**
 * 两个位置算不算同一个。屏幕缩放不是整数倍（125%、150%）时，窗口的位置设进去再读回来会差一个像素，
 * 差在这么多以内都算没人动过。
 */
const SLACK = 2
const sameSpot = (a, b) => !!a && !!b && ['x', 'y', 'width', 'height'].every(key => Math.abs(a[key] - b[key]) <= SLACK)

/**
 * 算一次：右边栏要 want 这么宽时，窗口该摆在哪。
 * bounds 是窗口现在的位置（读回来的），workArea 是它所在屏幕能用的范围（都是 x、y、width、height），
 * fixed 为真表示窗口最大化或全屏着。返回新的位置（不用动时是 undefined）和新的状态。
 *
 * 没人动过窗口时，按我们上一次摆的数来算，不按读回来的数：读回来的带着取整的误差，拿它一加一减，
 * 开合一次窗口就宽一个像素（2026-10-12 在 150% 的屏幕上实测到的；当时还因为差这一个像素被当成「人动过」，
 * 收起时往左挪的那一段没有还）。
 */
function planPane({ bounds, workArea, minWidth = 0, fixed = false, state = EMPTY, want }) {
  const target = Math.max(0, Math.round(Number.isFinite(want) ? want : 0))
  // 最大化、全屏时窗口的大小不归我们管；之前加的也不再记着，还原以后窗口宽一点，不去追。
  if (fixed) return { bounds: undefined, state: EMPTY }
  // 人自己挪过、拉过窗口：往左挪的那一段不再还回去，免得窗口往回跳。
  const moved = state.set !== undefined && !sameSpot(state.set, bounds)
  const here = state.set !== undefined && !moved ? state.set : bounds
  const shift = moved ? 0 : state.shift
  const delta = target - state.added
  if (delta === 0) return { bounds: undefined, state: { ...state, shift } }
  if (delta > 0) {
    const right = Math.min(delta, Math.max(0, workArea.x + workArea.width - (here.x + here.width)))
    const left = Math.min(delta - right, Math.max(0, here.x - workArea.x))
    if (right + left === 0) return { bounds: undefined, state: { ...state, shift } }
    const next = { ...here, x: here.x - left, width: here.width + right + left }
    return { bounds: next, state: { added: state.added + right + left, shift: shift + left, set: next } }
  }
  // 缩回去：先把往左挪的那一段还上，窗口宽度不低于它的下限。
  const remove = Math.min(-delta, state.added, Math.max(0, here.width - minWidth))
  const back = Math.min(shift, remove)
  if (remove === 0) return { bounds: undefined, state: { added: target, shift: shift - back, set: state.set } }
  const next = { ...here, x: here.x + back, width: here.width - remove }
  return { bounds: next, state: { added: target, shift: shift - back, set: next } }
}

/** 从 from 到 to 走到第 t 段（0 到 1），先快后慢。 */
function between(from, to, t) {
  const eased = 1 - (1 - t) ** 3
  const mix = key => Math.round(from[key] + (to[key] - from[key]) * eased)
  return { x: mix('x'), y: mix('y'), width: mix('width'), height: mix('height') }
}

/**
 * 接到窗口上。window 是主窗口，screen 是 Electron 的 screen，minWidth 是窗口宽度的下限。
 * set(want, instant) 返回一个 Promise：窗口摆好以后给出实际加了多少（页面据此知道对话区还要不要让）。
 * duration 和 timers 只在测试里换。
 */
function createPane({ window, screen, minWidth = 0, duration = 160, timers = { setInterval, clearInterval, now: () => Date.now() } }) {
  let state = EMPTY
  let running

  const finish = () => {
    if (!running) return
    const { timer, to, done } = running
    running = undefined
    timers.clearInterval(timer)
    if (!window.isDestroyed()) window.setBounds(to)
    done()
  }

  function set(want, instant = false) {
    // 上一次还没走完就来了新的：先让它到位，再从那里算。
    finish()
    if (window.isDestroyed()) return Promise.resolve(0)
    const bounds = window.getBounds()
    const plan = planPane({
      bounds, workArea: screen.getDisplayMatching(bounds).workArea, minWidth,
      fixed: window.isMaximized() || window.isFullScreen() || window.isMinimized(), state, want,
    })
    state = plan.state
    if (!plan.bounds) return Promise.resolve(state.added)
    const to = plan.bounds
    if (instant || duration <= 0) { window.setBounds(to); return Promise.resolve(state.added) }
    return new Promise((resolve) => {
      const started = timers.now()
      const timer = timers.setInterval(() => {
        if (window.isDestroyed()) { timers.clearInterval(timer); running = undefined; resolve(0); return }
        const t = Math.min(1, (timers.now() - started) / duration)
        if (t >= 1) { finish(); return }
        window.setBounds(between(bounds, to, t))
      }, 1000 / 60)
      running = { timer, to, done: () => { resolve(state.added) } }
    })
  }

  return { set, added: () => state.added }
}

module.exports = { EMPTY, planPane, createPane }
