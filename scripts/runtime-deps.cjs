/** Both source builds and packaged apps must resolve their own runtime dependencies. */
const fs = require('node:fs')
const path = require('node:path')
const { nodeRuntime } = require('../desktop/node.cjs')

const CORES = ['core/zju', 'core/weread', 'core/wechat', 'core/dingtalk', 'core/learn/engine/vendor']
function resolvePackage(name, from, root) {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name)
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate
    if (dir === root || path.dirname(dir) === dir) return undefined
  }
}

/** platform、arch 是成品要跑在哪种系统和芯片上：随包的 Node 每种一个包（desktop/node.cjs），查的是那一个。 */
function checkRuntimeDependencies(directory, { platform = process.platform, arch = process.arch } = {}) {
  const root = fs.realpathSync(directory), missing = [], checked = new Set()
  const visit = (dir) => {
    if (checked.has(dir)) return
    checked.add(dir)
    let manifest
    try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) }
    catch { missing.push(`${path.relative(root, dir) || '.'}/package.json`); return }
    // An optional dependency may deliberately be absent on this OS.
    for (const name of Object.keys(manifest.dependencies ?? {}).filter(name => !manifest.optionalDependencies?.[name])) {
      const found = resolvePackage(name, dir, root)
      if (found) visit(found)
      else missing.push(`${manifest.name || path.relative(root, dir)} → ${name}`)
    }
  }
  for (const entry of ['', ...CORES]) visit(path.join(root, entry))
  const runtime = nodeRuntime(platform, arch)
  if (!runtime) missing.push(`${platform}-${arch} 没有随应用提供的 Node 运行时`)
  for (const file of [
    ...(runtime ? [runtime] : []),
    'build/licenses/NODE-LICENSE.txt',
    'core/learn/engine/vendor/node_modules/gsap/dist/gsap.min.js',
    'ui/lib/client.js',
  ]) if (!fs.existsSync(path.join(root, file))) missing.push(file)
  for (const name of ['sharp', '@deepseek-ai/libreoffice-kit']) {
    if (!resolvePackage(name, path.join(root, 'core/zju'), root)) missing.push(`ZJU 文档引擎 → ${name}`)
  }
  // Mac 上壳的键盘桥（desktop/keyboard.cjs）直接用引擎依赖里的快捷键协议，不另装一份；哪版引擎不再带它，打包时就拦下来。
  if (platform === 'darwin' && !resolvePackage('@deepseek-ai/dsh-client-shortcuts', root, root)) missing.push('Mac 键盘桥 → @deepseek-ai/dsh-client-shortcuts')
  const ffmpeg = resolvePackage('ffmpeg-static', root, root)
  if (!ffmpeg || !fs.existsSync(path.join(ffmpeg, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'))) missing.push('ffmpeg-static 可执行文件')
  if (missing.length) throw new Error(`运行依赖不完整：\n${[...new Set(missing)].join('\n')}\n在项目根目录执行 npm ci（或 npm run setup），然后 npm run ui。`)
  return { packages: checked.size }
}

module.exports = { CORES, checkRuntimeDependencies }
if (require.main === module) {
  try { console.log('运行依赖检查通过', checkRuntimeDependencies(path.resolve(__dirname, '..'))) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
