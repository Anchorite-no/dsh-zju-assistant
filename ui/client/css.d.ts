/** build.mjs 把 .css 当文本打进包里。 */
declare module '*.css' {
  const text: string
  export default text
}

/** build.mjs 在构建时填进来的引擎侧代码指纹，见 ui/profile/stamp.mjs。 */
declare module 'campus:engine-stamp' {
  const stamp: string
  export default stamp
}

/** react-dom 是页面已经加载好的共享模块（build.mjs 的 SHARED），这里只用到它的 flushSync，没有另装它的类型。 */
declare module 'react-dom' {
  export function flushSync<R>(update: () => R): R
}
