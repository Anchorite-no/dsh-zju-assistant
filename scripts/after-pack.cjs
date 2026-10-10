/**
 * electron-builder 打包后补一步：把项目里装着、成品里却没有的依赖补进成品。
 * electron-builder 只沿着 dependencies 收集要带的包，而引擎的包之间大量用 peerDependencies 互相引用（npm 会把它们装上），
 * 这些包就被漏掉了。漏了以后，在项目目录里试成品照样能启动（Node 一层层往上找，找到了项目自己的 node_modules），
 * 换个位置、换台机器就起不来。0.1.0 的便携包就是这样发出去的。
 * 这里对成品里的每个包，看它的 dependencies 和必需的 peerDependencies 在成品里找不找得到；找不到的从项目里照同样的找法拷过来，
 * 拷来的包再照样看，直到没有缺的。标了可选的 peer 和 devDependencies 不补。
 */
const fs = require('node:fs')
const path = require('node:path')

function manifestOf(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) } catch { return undefined }
}

/** 一个 node_modules 文件夹下面的所有包，连同它们自己带的 node_modules 里的。 */
function packagesUnder(modules) {
  const found = []
  let names
  try { names = fs.readdirSync(modules) } catch { return found }
  for (const name of names) {
    if (name.startsWith('.')) continue
    const dirs = name.startsWith('@') ? fs.readdirSync(path.join(modules, name)).map(child => path.join(modules, name, child)) : [path.join(modules, name)]
    for (const dir of dirs) {
      if (!fs.statSync(dir).isDirectory()) continue
      found.push(dir, ...packagesUnder(path.join(dir, 'node_modules')))
    }
  }
  return found
}

/** 从 from 这个包起，照 Node 的规矩一层层往上找名叫 name 的包，最多找到 top 这一层；找不到给 undefined。 */
function resolvePackage(name, from, top) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name)
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate
    if (dir === top || dir === path.dirname(dir)) return undefined
  }
}

/**
 * appDir 是成品里应用的文件夹（里面有 node_modules），projectDir 是项目根目录。
 * 返回补了哪些包，和哪些引用在项目里也找不到（「谁 -> 要什么」）。
 */
function shipMissingDependencies(appDir, projectDir) {
  const target = path.join(appDir, 'node_modules'), source = path.join(projectDir, 'node_modules')
  const queue = packagesUnder(target), added = [], unresolved = []
  while (queue.length > 0) {
    const dir = queue.pop()
    const manifest = manifestOf(dir)
    if (!manifest) continue
    const optional = manifest.peerDependenciesMeta ?? {}
    const wanted = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}).filter(name => optional[name]?.optional !== true),
    ])
    for (const name of wanted) {
      if (resolvePackage(name, dir, appDir)) continue
      const from = resolvePackage(name, path.join(source, path.relative(target, dir)), projectDir)
      if (!from) { unresolved.push(`${manifest.name} -> ${name}`); continue }
      const to = path.join(target, name)
      fs.cpSync(from, to, { recursive: true })
      added.push(name)
      queue.push(to, ...packagesUnder(path.join(to, 'node_modules')))
    }
  }
  return { added: added.sort(), unresolved: unresolved.sort() }
}

/** electron-builder 的 afterPack 钩子。 */
async function afterPack(context) {
  const { added, unresolved } = shipMissingDependencies(path.join(context.appOutDir, 'resources', 'app'), context.packager.projectDir)
  console.log(`  • shipped ${added.length} installed packages the dependency walk left out${added.length ? `: ${added.join(', ')}` : ''}`)
  if (unresolved.length > 0) console.log(`  • not installed in the project either (left as they are): ${unresolved.join('; ')}`)
}

module.exports = afterPack
module.exports.default = afterPack
module.exports.shipMissingDependencies = shipMissingDependencies
