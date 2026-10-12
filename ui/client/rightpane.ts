/**
 * 右边栏向右打开，不挤中间的对话。引擎的右边栏是从对话区里让出一列（第一次打开占窗口的 45%），
 * 1280 的窗口里对话只剩四百来像素。这里做两件事：
 *   1. 右边栏第一次打开的宽度改成 DEFAULT_WIDTH：放「执行过程」这样的一列足够，要宽可以自己拖。
 *   2. 在壳里（有 campusShell）时，右边栏占多宽就让壳把窗口加宽多少（desktop/pane.cjs），对话区的宽度不变；
 *      收起时窗口缩回去。屏幕放不下、窗口最大化时壳加不了那么多，差的部分照引擎原样从对话区里让。
 *
 * 引擎没有把右边栏的宽度交出来，是从它的框架那一行（三列的网格）上读的：收起时有 data-rightbar-collapsed，
 * 全屏盖住时有 data-rightbar-fullscreen，第三列写成 minmax(0px, 宽度px)。引擎升级后对着 dsh-client-ui-layout 的 AppFrame 重新核一遍。
 *
 * 窗口加宽要经过壳，比页面慢一两帧；要是等它，这一两帧里对话会先被挤一下再弹回来。所以右边栏一出现，
 * 先把框架钉成「窗口现在的宽度 + 右边栏」那么宽（多出来的一截在窗口外面，看不见），对话区一个像素都不动，
 * 窗口再拉开把右边栏露出来；窗口到位以后放开。
 * 收起时反过来：框架连同它的三列都钉成收起之前的样子，右边栏原样留在它那一列，由窗口的右边一点点盖过去，
 * 窗口到位以后放开。引擎收起右边栏时自己有一段「往右滑出去」，这里不要它：照它来，右边栏会先被挤到对话上面
 * 再滑走（2026-10-12 用系统的窗口抓取录下来看到的），样式在 style.css「右边栏向右打开」一段。
 */
import type { Context } from '@deepseek-ai/cordis'

/** 右边栏第一次打开的宽度。之后人拖成多宽就是多宽（应用开着的这段时间里记着）。 */
export const DEFAULT_WIDTH = 420

/** 壳把窗口摆好以后，页面再等这么久（毫秒）才放开钉住的框架：窗口的新尺寸传到页面要一两帧。 */
const RELEASE_AFTER = 50

/** 框架那一行的列怎么写的：最后一列是右边栏，写成 minmax(0px, 宽度px)。读不出来当没有。 */
export function parseTrack(columns: string): number {
  const match = /minmax\(\s*0(?:px)?\s*,\s*([\d.]+)px\s*\)\s*$/.exec(columns.trim())
  return match ? Math.round(Number(match[1])) : 0
}

/** 引擎的布局服务里我们要用的那一点：存右边栏宽度的动作不在它公开的接口上，挂在 panels 里。 */
interface Layout { panels?: { setRightbar?: (px: number) => void } }

/** 钉住框架的办法：宽度钉成多少；收起时还要把三列钉成收起之前的写法。 */
export interface Pin { width: number, columns?: string }

/**
 * 一次变化该不该先钉住框架、怎么钉。previous 是上一次右边栏的宽度，granted 是壳上一次实际给窗口加的，
 * columns 是这次变化之前框架那一行的列。
 */
export function pinFor(input: { previous: number, track: number, granted: number, windowWidth: number, columns: string }): Pin | undefined {
  const { previous, track, granted, windowWidth, columns } = input
  // 打开：窗口还没加宽，框架先按加宽以后的算，右边栏在窗口外面等着露出来。
  if (previous === 0 && track > 0) return { width: windowWidth + track }
  // 收起：窗口还没缩回去，框架和三列都留在收起之前的样子。壳一点都没加过（最大化着）就不钉，照引擎原样。
  if (track === 0 && granted > 0) return { width: windowWidth, columns }
  // 拖宽拖窄以后的调整：对话区在拖的时候已经变了，窗口到位时再变回来，不钉。
  return undefined
}

/** 放开以后再等这么久（毫秒）才让引擎那段滑出去的过渡恢复：右边栏这时已经没有宽度了，直接不见。 */
const SETTLE = 600

export function installRightPane(ctx: Context): () => void {
  const layout = (ctx as unknown as { layout?: Layout }).layout
  try { layout?.panels?.setRightbar?.(DEFAULT_WIDTH) } catch (reason) { console.warn('campus-ui: 没能设置右边栏的默认宽度', reason) }

  const shell = window.campusShell
  if (!shell?.setSidePane) return () => {}
  const still = window.matchMedia('(prefers-reduced-motion: reduce)')
  const root = document.documentElement
  let frame: HTMLElement | null = null
  /** 上一次报给壳的宽度；还没报过是 undefined。 */
  let wanted: number | undefined
  let granted = 0
  let round = 0
  /** 框架那一行的列上一次是怎么写的（引擎写在元素上的原样）。 */
  let columns = ''
  let settling: ReturnType<typeof setTimeout> | undefined

  const settled = (): void => {
    clearTimeout(settling)
    settling = undefined
    if (frame) delete frame.dataset.campusSettling
  }

  const release = (): void => {
    delete root.dataset.campusPane
    if (!frame) return
    // 刚收起的：放开的这一下右边栏那一列没有宽度了，让它直接不见，过一会儿再把引擎的过渡还回去。
    if (frame.dataset.campusPinned === 'closing') {
      frame.dataset.campusSettling = ''
      clearTimeout(settling)
      settling = setTimeout(settled, SETTLE)
    }
    delete frame.dataset.campusPinned
    frame.style.removeProperty('--campus-pin')
    frame.style.removeProperty('--campus-pin-columns')
  }

  const sync = (): void => {
    if (!frame) return
    const before = columns
    columns = frame.style.gridTemplateColumns
    // 正拖着右边栏的边时不跟：松手以后再按最后的宽度调一次。
    if (frame.hasAttribute('data-dragging')) return
    const hidden = frame.hasAttribute('data-rightbar-collapsed') || frame.hasAttribute('data-rightbar-fullscreen')
    const track = hidden ? 0 : parseTrack(columns)
    if (track === wanted) return
    // 页面刚加载的那一次只是和壳对一下数（壳记着自己加过多少），不钉。
    const pinned = wanted === undefined ? undefined : pinFor({ previous: wanted, track, granted, windowWidth: window.innerWidth, columns: before })
    wanted = track
    const mine = ++round
    release()
    settled()
    if (pinned !== undefined) {
      frame.style.setProperty('--campus-pin', `${String(pinned.width)}px`)
      if (pinned.columns !== undefined) frame.style.setProperty('--campus-pin-columns', pinned.columns)
      frame.dataset.campusPinned = pinned.columns === undefined ? 'opening' : 'closing'
      root.dataset.campusPane = ''
    }
    shell.setSidePane(track, still.matches).then((added) => {
      if (mine !== round) return
      granted = added
      // 壳说摆好了，页面这边窗口的新尺寸还要一两帧才到；等它到了再放开，放开时框架和窗口一样宽。
      // 用定时器不用「下一帧」：窗口被别的窗口盖住时页面不出帧，等帧会一直等到它重新露出来。
      setTimeout(() => { if (mine === round) release() }, RELEASE_AFTER)
    }, (reason: unknown) => {
      console.warn('campus-ui: 窗口没能跟着右边栏变宽', reason)
      if (mine === round) release()
    })
  }

  const watching = new MutationObserver(sync)
  /** 框架是引擎画的，界面包启用时它可能还没出来；用它里面那层浮层认它。 */
  const locate = (): void => {
    if (frame?.isConnected) return
    const found = document.querySelector('[data-shell-overlay]')?.parentElement ?? null
    if (found === frame) return
    watching.disconnect()
    frame = found
    if (!frame) return
    watching.observe(frame, { attributes: true, attributeFilter: ['style', 'data-rightbar-collapsed', 'data-rightbar-fullscreen', 'data-dragging'] })
    sync()
  }
  const finding = new MutationObserver(locate)
  finding.observe(document.body, { childList: true, subtree: true })
  locate()

  return () => {
    // 不在这里让窗口缩回去：开发时改一行代码界面包就重装一次，窗口不该跟着一缩一张。
    round++
    finding.disconnect()
    watching.disconnect()
    release()
    settled()
  }
}
