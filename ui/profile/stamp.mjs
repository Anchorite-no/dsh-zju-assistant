import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/** 引擎侧的代码文件：本目录下的 .mjs，不含测试。 */
export function engineFiles() {
  return fs.readdirSync(here).filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs')).sort().map(name => path.join(here, name))
}

/**
 * 引擎侧代码的内容指纹。界面包每次构建时记一份（build.mjs），引擎启动时算一份（host.mjs）。
 * 开发时界面会热更新、引擎不会：两份对不上就是界面比后台新，页面上请求出错时会改成提示重新打开应用。
 */
export function engineStamp() {
  const hash = createHash('sha256')
  for (const file of engineFiles()) hash.update(path.basename(file)).update(fs.readFileSync(file))
  return hash.digest('hex').slice(0, 12)
}
