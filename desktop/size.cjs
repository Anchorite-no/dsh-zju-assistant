/**
 * 主窗口第一次开多大。右边栏（「执行过程」，420 宽）展开时是从对话区里让出一列，窗口本身不变宽（2026-10-21 起）；
 * 所以窗口一开始就开宽一点：左栏 280、对话区 780 上下、右边栏 420，一共 1480。
 * 屏幕放不下时取能用的范围减去留边，也不小于窗口的下限。高度照原来的 820，同样按屏幕收。
 */

/** 想要的宽高、四周留的边。 */
const WANT = { width: 1480, height: 820 }, MARGIN = 40

/** workArea 是窗口所在屏幕能用的范围（去掉任务栏的，逻辑像素），min 是窗口的最小宽高。 */
function windowSize(workArea, min = { width: 0, height: 0 }) {
  const fit = (want, room, floor) => Math.max(floor, Math.min(want, Math.floor(room - MARGIN)))
  return {
    width: fit(WANT.width, workArea?.width ?? WANT.width + MARGIN, min.width),
    height: fit(WANT.height, workArea?.height ?? WANT.height + MARGIN, min.height),
  }
}

module.exports = { windowSize, WANT }
