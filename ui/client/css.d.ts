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
