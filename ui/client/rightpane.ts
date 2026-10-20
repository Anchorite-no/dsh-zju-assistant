/**
 * 右边栏第一次打开的宽度。引擎默认让它占窗口的 45%，1280 的窗口里对话只剩四百来像素；这里改成 DEFAULT_WIDTH，
 * 放「执行过程」这样的一列足够，要宽可以自己拖（之后人拖成多宽就是多宽，应用开着的这段时间里记着）。
 * 打开、收起都照引擎原样：右边栏从对话区里让出一列，按一下收回去。
 *
 * 2026-10-12 到 10-21 之间这里还让窗口跟着右边栏向右加宽（壳那边是 desktop/pane.cjs），对话区不被挤窄。
 * 那要先把引擎的框架钉宽、等壳把窗口拉开再放开，时序一错就出渲染问题，用户 10-21 说经常碰到，整套去掉了。
 *
 * 存宽度的动作不在引擎公开的接口上，挂在 ctx.layout.panels 里。引擎升级后对着 dsh-client-ui-layout 重新核一遍。
 */
import type { Context } from '@deepseek-ai/cordis'

export const DEFAULT_WIDTH = 420

/** 引擎的布局服务里我们要用的那一点。 */
interface Layout { panels?: { setRightbar?: (px: number) => void } }

export function installRightPane(ctx: Context): () => void {
  const layout = (ctx as unknown as { layout?: Layout }).layout
  try { layout?.panels?.setRightbar?.(DEFAULT_WIDTH) } catch (reason) { console.warn('campus-ui: 没能设置右边栏的默认宽度', reason) }
  return () => {}
}
