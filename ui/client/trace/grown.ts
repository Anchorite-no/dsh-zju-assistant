/**
 * 「执行过程」里哪些行已经长出来过，按「哪个对话的第几轮」记着。
 * 不记在页签的组件里，是因为引擎只在页签看得见的时候才挂着它的正文：切到右边栏的另一个页签（比如助手交付文件时
 * 自己打开的预览）、换一个对话、打开设置或学习这样占满中间的页面，正文都会被卸掉，回来是重新挂一遍。
 * 记在组件里，每回来一次整张图就从头再长一遍（2026-10-12 用户看到的「整条路径重放」）。
 * 记在这里，回来时长过的行直接摆好，只有离开的这段时间里新多出来的行接着长。
 * 没有改用页签类型的 keepMounted：正文留着不卸，但引擎是用 display: none 把它藏起来的，再露出来时
 * 所有行的动效会同时重放一遍，而且每个看过的对话都要一直挂着一份。
 * 只在应用开着的这段时间里记着，重开以后第一次打开照旧长一遍。
 */

/** 只留最近看过的这么多轮；再早的回来时重新长一遍无妨。 */
export const KEPT = 200

const NONE: ReadonlySet<string> = new Set()
const routes = new Map<string, ReadonlySet<string>>()

/** 这一轮里已经长出来过的行；没看过就是空的。 */
export function grownBefore(route: string): ReadonlySet<string> {
  return routes.get(route) ?? NONE
}

/** 记下这一轮现在长出来了哪些行。 */
export function rememberGrown(route: string, rows: ReadonlySet<string>): void {
  routes.delete(route)
  routes.set(route, rows)
  if (routes.size > KEPT) routes.delete(routes.keys().next().value!)
}
