/** Both source builds and packaged apps must resolve their own runtime dependencies. */
const fs = require('node:fs')
const path = require('node:path')

const CORES = ['core/zju', 'core/weread', 'core/wechat', 'core/dingtalk', 'core/learn/engine/vendor']
function resolvePackage(name, from, root) {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name)
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate
    if (dir === root || path.dirname(dir) === dir) return undefined
  }
}

function checkRuntimeDependencies(directory) {
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
  for (const file of [
    'node_modules/node-win-x64/bin/node.exe',
    'build/licenses/NODE-LICENSE.txt',
    'core/learn/engine/vendor/node_modules/gsap/dist/gsap.min.js',
    'ui/lib/client.js',
  ]) if (!fs.existsSync(path.join(root, file))) missing.push(file)
  for (const name of ['sharp', '@deepseek-ai/libreoffice-kit']) {
    if (!resolvePackage(name, path.join(root, 'core/zju'), root)) missing.push(`ZJU 文档引擎 → ${name}`)
  }
  const ffmpeg = resolvePackage('ffmpeg-static', root, root)
  if (!ffmpeg || !fs.existsSync(path.join(ffmpeg, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'))) missing.push('ffmpeg-static 可执行文件')
  if (missing.length) throw new Error(`运行依赖不完整：\n${[...new Set(missing)].join('\n')}\n在项目根目录执行 npm ci（或 npm run setup），然后 npm run ui。`)
  return { packages: checked.size }
}

module.exports = { CORES, checkRuntimeDependencies }
if (require.main === module) {
  try { console.log('运行依赖检查通过', checkRuntimeDependencies(path.resolve(__dirname, '..'))) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
