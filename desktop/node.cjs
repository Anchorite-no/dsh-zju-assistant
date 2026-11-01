/**
 * 给命令行用的 node。技能里的命令都是「node …」（core/zju/SKILL.md 的 `node <SKILL>/scripts/zju.ts`、
 * core/learn/references/animation.md 的 `node engine/build.mjs`），由引擎的命令行工具在用户的机器上执行，找的是 PATH 上名叫 node 的程序。
 * 应用随包带独立的 Node 24 运行时，用于引擎和 Core，但需要提供一个叫 node 的程序给命令行用：
 * 没装 Node.js 的电脑上，助手一跑技能的命令就是「找不到 node」；装了旧版本的又跑不了 .ts（zju.ts 是直接拿来跑的）。
 * 引擎自己不管这件事（它的命令行工具只是原样继承进程的环境）。
 *
 * 做法：壳启动引擎时在数据目录的 bin 文件夹里放一个 node.cmd（Windows）或 node shell 脚本（macOS），调用随包的 Node，参数原样传过去；
 * 再把这个文件夹放到交给引擎的 PATH 最前面，引擎启动的命令都会继承。
 * 放在最前面，是要所有机器上跑技能的都是同一份 Node：用户自己装的可能太旧。开发时（npm start）也一样，免得只在装好的应用里才出问题。
 * 只放 .cmd，不放 .ps1：PowerShell 会先找 .ps1，而系统默认不许运行脚本，那样 node 反而整个用不了（npm 在 Windows 上就有这个毛病）。
 */
const { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } = require('node:fs')
const path = require('node:path')

// The engine's native loader supports stock Node independently of Electron's
// changing V8 fingerprints. Never borrow a runtime from the user's PATH.
function nodeRuntimePath(platform = process.platform, arch = process.arch) {
  const packages = { 'win32-x64': 'node-win-x64', 'darwin-arm64': 'node-bin-darwin-arm64', 'darwin-x64': 'node-darwin-x64' }
  const name = packages[`${platform}-${arch}`]
  if (!name) throw new Error(`不支持的运行平台：${platform}-${arch}`)
  return path.join('node_modules', name, 'bin', platform === 'win32' ? 'node.exe' : 'node')
}
function nodeExecutable(root = path.join(__dirname, '..')) {
  const executable = path.join(root, nodeRuntimePath())
  if (!existsSync(executable)) throw new Error('缺少随应用提供的 Node 运行时，请重新安装应用；源码开发请执行 npm ci。')
  return executable
}

/** 应用的可执行文件在哪，经这个环境变量告诉 node.cmd。不直接写进文件里：.cmd 是按系统的代码页读的，用户名带中文时路径会读错，环境变量不会。 */
const EXE_VARIABLE = 'CAMPUS_NODE_EXE'

const SHIM = [
  '@echo off',
  'rem Campus Agent: runs the Node that ships inside the app, so skills work on machines without Node.js.',
  `"%${EXE_VARIABLE}%" %*`,
  '',
].join('\r\n')

/**
 * 在 dir 里放好 node.cmd，返回要交给引擎进程的环境变量：应用的可执行文件在哪，和把 dir 放在最前面的 PATH。
 * env 是壳自己的环境（PATH 在 Windows 上可能写成 Path，照原来的写法给，免得出现两个）。
 * macOS 使用可执行的 POSIX shell 包装脚本；不支持的平台什么都不给；放不成时也什么都不给，命令行照旧用系统里的 node。
 */
function nodeEnv({ dir, execPath = process.execPath, env = process.env, platform = process.platform }) {
  if (!['win32', 'darwin'].includes(platform)) return {}
  const windows = platform === 'win32'
  const content = windows ? SHIM : '#!/bin/sh\nexec "$CAMPUS_NODE_EXE" "$@"\n'
  const file = path.join(dir, windows ? 'node.cmd' : 'node')
  try {
    mkdirSync(dir, { recursive: true })
    // 内容没变就不重写：别的进程可能正在用它。
    let old = ''
    try { old = readFileSync(file, 'utf8') } catch { /* 还没有 */ }
    if (old !== content) writeFileSync(file, content)
    if (!windows) chmodSync(file, 0o755)
  } catch {
    return {}
  }
  const key = (windows ? Object.keys(env).find(name => name.toLowerCase() === 'path') : 'PATH') ?? 'PATH'
  const delimiter = windows ? ';' : ':'
  const normalize = value => windows ? path.resolve(value).toLowerCase() : path.resolve(value)
  const rest = (env[key] ?? '').split(delimiter).filter(entry => entry && normalize(entry) !== normalize(dir))
  return { [EXE_VARIABLE]: execPath, [key]: [dir, ...rest].join(delimiter) }
}

module.exports = { nodeEnv, nodeExecutable, nodeRuntimePath, EXE_VARIABLE }
