/**
 * electron-builder 打包后补一步：把项目里装着、成品里却没有的依赖补进成品。
 * electron-builder 只沿着 dependencies 收集要带的包，而引擎的包之间大量用 peerDependencies 互相引用（npm 会把它们装上），
 * 这些包就被漏掉了。漏了以后，在项目目录里试成品照样能启动（Node 一层层往上找，找到了项目自己的 node_modules），
 * 换个位置、换台机器就起不来。0.1.0 的便携包就是这样发出去的。
 * 这里对成品里的每个包，看它的 dependencies 和必需的 peerDependencies 在成品里找不找得到；找不到的从项目里照同样的找法拷过来，
 * 拷来的包再照样看，直到没有缺的。标了可选的 peer 和 devDependencies 不补。
 *
 * 补完以后再删一遍运行时用不到的文件（dropDeadWeight）：安装程序是一个文件一个文件装的，文件越多装得越慢。
 * 最后查两件安装程序装不了的事：名字带中文的文件（oddNames）、太长的路径（installDirRoom）。
 */
const fs = require('node:fs')
const path = require('node:path')
const { checkRuntimeDependencies } = require('./runtime-deps.cjs')

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
      ...Object.keys(manifest.dependencies ?? {}).filter(name => !manifest.optionalDependencies?.[name]),
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

/** 各个 node_modules 里运行时用不到的文件：源码映射（调试时把报错对回源码用的）和 TypeScript 的类型声明。 */
const DEAD_WEIGHT = /\.map$|\.d\.[cm]?ts$/i

/**
 * 把成品里各个 node_modules 下面运行时用不到的文件删掉，返回删了多少个、多少字节。
 * 只动 node_modules 里面的：我们自己的代码和 core 里的东西（那里的 .ts 是直接拿来跑的）一个不删。
 * 0.1.2 的成品有 19,494 个文件，这两种占 5,680 个。说明文档（README 等）不删：引擎有的页面会读包里的说明。
 */
function dropDeadWeight(appDir) {
  let files = 0, bytes = 0
  const walk = (dir, inModules) => {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file, inModules || entry.name === 'node_modules')
      else if (inModules && entry.isFile() && DEAD_WEIGHT.test(entry.name)) {
        bytes += fs.statSync(file).size
        fs.rmSync(file)
        files++
      }
    }
  }
  walk(appDir, false)
  return { files, bytes }
}

/**
 * 成品里名字带中文（或别的非 ASCII 字符）的文件。安装程序解压用的那个组件（nsisunz）写不了这样的文件：
 * 装到那一个就弹「Failed to decompress files」停住，后面的都没装上。有的话打包直接失败，比发出去才发现好。
 */
function oddNames(dir, base = dir) {
  const found = []
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return found }
  for (const entry of entries) {
    const file = path.join(dir, entry.name)
    if (/[^ -~]/.test(entry.name)) found.push(path.relative(base, file))
    else if (entry.isDirectory()) found.push(...oddNames(file, base))
  }
  return found
}

/**
 * 安装位置（安装文件夹的完整路径）最长能有多少个字符，和成品里路径最长的那个文件。
 * 安装程序解压用的组件写不了超过 Windows 老限制的路径（文件 259 个字符，文件夹 247 个）：安装位置选得太深，
 * 装到一半弹「Failed to decompress files」（拿一个 248 个字符的安装位置试出来的）。成品里最深的文件和文件夹占掉多少，剩下的就是留给安装位置的。
 */
function installDirRoom(dir) {
  let file = 0, folder = 0, longest = ''
  const walk = (current, relative) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const name = path.join(relative, entry.name)
      if (entry.isDirectory()) { folder = Math.max(folder, name.length); walk(path.join(current, entry.name), name) }
      else if (name.length > file) { file = name.length; longest = name }
    }
  }
  walk(dir, '')
  return { room: Math.min(259 - 1 - file, 247 - 1 - folder), longest }
}

/** 默认的安装位置有多长：C:\Program Files\<应用名>。 */
const defaultDirLength = name => 'C:\\Program Files\\'.length + name.length

/** electron-builder 的 afterPack 钩子。 */
async function afterPack(context) {
  const appDir = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources', 'app')
    : path.join(context.appOutDir, 'resources', 'app')
  const { added, unresolved } = shipMissingDependencies(appDir, context.packager.projectDir)
  console.log(`  • shipped ${added.length} installed packages the dependency walk left out${added.length ? `: ${added.join(', ')}` : ''}`)
  if (unresolved.length > 0) throw new Error(`成品缺少必需依赖：${unresolved.join('; ')}`)
  checkRuntimeDependencies(appDir)
  const dropped = dropDeadWeight(appDir)
  console.log(`  • dropped ${dropped.files} source maps and type declarations (${Math.round(dropped.bytes / 1048576)} MB) nothing reads at run time`)
  if (context.electronPlatformName !== 'win32') return
  const odd = oddNames(context.appOutDir)
  if (odd.length > 0) throw new Error(`安装程序装不了名字带中文的文件，改名或者在 package.json 的 build.files 里排除：${odd.slice(0, 10).join('、')}`)
  const { room, longest } = installDirRoom(context.appOutDir)
  if (room < defaultDirLength(context.packager.appInfo.productFilename)) throw new Error(`成品里的路径太长，安装位置只能有 ${room} 个字符，默认的位置都装不下：${longest}`)
  // 交给安装程序：scripts/installer.nsh 编译时读这个环境变量，用户选的位置超过了就不让往下走。
  process.env.CAMPUS_INSTALL_DIR_MAX = String(room)
  console.log(`  • install folder path can be up to ${room} characters (deepest file: ${longest})`)
}

module.exports = afterPack
module.exports.default = afterPack
module.exports.shipMissingDependencies = shipMissingDependencies
module.exports.dropDeadWeight = dropDeadWeight
module.exports.oddNames = oddNames
module.exports.installDirRoom = installDirRoom
