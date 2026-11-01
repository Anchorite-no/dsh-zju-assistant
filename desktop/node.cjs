/**
 * 给命令行用的 node。技能里的命令都是「node …」（core/zju/SKILL.md 的 `node <SKILL>/scripts/zju.ts`、
 * core/learn/references/animation.md 的 `node engine/build.mjs`），由引擎的命令行工具在用户的机器上执行，找的是 PATH 上名叫 node 的程序。
 * 应用随包带独立的 Node 24 运行时，用于引擎和 Core，但需要提供一个叫 node 的程序给命令行用：
 * 没装 Node.js 的电脑上，助手一跑技能的命令就是「找不到 node」；装了旧版本的又跑不了 .ts（zju.ts 是直接拿来跑的）。
 * 引擎自己不管这件事（它的命令行工具只是原样继承进程的环境）。
 *
 * 做法：壳启动引擎时在数据目录的 bin 文件夹里放一个转手的小脚本，调用随包的 node，参数原样传过去；
 * 再把这个文件夹放到交给引擎的 PATH 最前面，引擎启动的命令都会继承。
 * 放在最前面，是要所有机器上跑技能的都是同一份 Node：用户自己装的可能太旧。开发时（npm start）也一样，免得只在装好的应用里才出问题。
 * Windows 上是 node.cmd。只放 .cmd，不放 .ps1：PowerShell 会先找 .ps1，而系统默认不许运行脚本，那样 node 反而整个用不了（npm 在 Windows 上就有这个毛病）。
 * macOS 上是一个叫 node 的 sh 脚本。从访达或程序坞打开的应用，PATH 只有 /usr/bin:/bin:/usr/sbin:/sbin，
 * 用 Homebrew、MacTeX 装的程序都不在上面（讲解要找的 latex 就在 /Library/TeX/texbin），所以紧跟着补上这几处常见的位置，有才补。
 */
const { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const path = require('node:path')

/**
 * 随包的 Node 在哪个包里：每种系统和芯片一个，package.json 里都是可选依赖，npm 只装当前这台机器的那一个。
 * Apple 芯片的包名带 bin（node-bin-darwin-arm64），是同一位作者发的：npm 上的 node-darwin-arm64 只出到 18。
 */
const RUNTIMES = {
  'win32-x64': ['node-win-x64', 'bin/node.exe'],
  'darwin-arm64': ['node-bin-darwin-arm64', 'bin/node'],
  'darwin-x64': ['node-darwin-x64', 'bin/node'],
}

/** 随包的 Node 相对应用根目录的位置（用 / 分隔）；这种系统和芯片没有随包的 Node 时给 undefined。 */
function nodeRuntime(platform = process.platform, arch = process.arch) {
  const entry = RUNTIMES[`${platform}-${arch}`]
  return entry && ['node_modules', ...entry].join('/')
}

// The engine's native loader supports stock Node independently of Electron's
// changing V8 fingerprints. Never borrow a runtime from the user's PATH.
function nodeExecutable(root = path.join(__dirname, '..'), platform = process.platform, arch = process.arch) {
  const relative = nodeRuntime(platform, arch)
  const executable = relative && path.join(root, ...relative.split('/'))
  if (!executable || !existsSync(executable)) throw new Error('缺少随应用提供的 Node 运行时，请重新安装应用；源码开发请执行 npm ci。')
  return executable
}

/** 应用的可执行文件在哪，经这个环境变量告诉转手的脚本。不直接写进文件里：.cmd 是按系统的代码页读的，用户名带中文时路径会读错，环境变量不会。 */
const EXE_VARIABLE = 'CAMPUS_NODE_EXE'

/** 各系统上放哪个文件、写什么。 */
const SHIMS = {
  win32: {
    name: 'node.cmd',
    text: [
      '@echo off',
      'rem Campus Agent: runs the Node that ships inside the app, so skills work on machines without Node.js.',
      `"%${EXE_VARIABLE}%" %*`,
      '',
    ].join('\r\n'),
  },
  darwin: {
    name: 'node',
    text: [
      '#!/bin/sh',
      '# Campus Agent: runs the Node that ships inside the app, so skills work on machines without Node.js.',
      `exec "$${EXE_VARIABLE}" "$@"`,
      '',
    ].join('\n'),
  },
}

/** macOS 上 PATH 里常缺的几处：Apple 芯片和 Intel 上 Homebrew 的位置，MacTeX 的位置。 */
const MAC_PATHS = ['/opt/homebrew/bin', '/usr/local/bin', '/Library/TeX/texbin']

/**
 * 在 dir 里放好转手的脚本，返回要交给引擎进程的环境变量：应用的可执行文件在哪，和把 dir 放在最前面的 PATH。
 * env 是壳自己的环境（PATH 在 Windows 上可能写成 Path，照原来的写法给，免得出现两个）。exists 看一个文件夹在不在，测试时换成假的。
 * 别的系统上还没有做，什么都不给；放不成时也什么都不给，命令行照旧用系统里的 node。
 */
function nodeEnv({ dir, execPath = process.execPath, env = process.env, platform = process.platform, exists = existsSync }) {
  const shim = SHIMS[platform]
  if (!shim) return {}
  const file = path.join(dir, shim.name)
  try {
    mkdirSync(dir, { recursive: true })
    // 内容没变就不重写：别的进程可能正在用它。
    let old = ''
    try { old = readFileSync(file, 'utf8') } catch { /* 还没有 */ }
    if (old !== shim.text) writeFileSync(file, shim.text)
    if (platform !== 'win32') chmodSync(file, 0o755)
  } catch {
    return {}
  }
  const paths = platform === 'win32' ? path.win32 : path.posix
  // Windows 的路径不分大小写。
  const same = platform === 'win32' ? (a, b) => a.toLowerCase() === b.toLowerCase() : (a, b) => a === b
  const key = Object.keys(env).find(name => name.toLowerCase() === 'path') ?? 'PATH'
  const rest = (env[key] ?? '').split(paths.delimiter).filter(entry => entry && !same(paths.resolve(entry), paths.resolve(dir)))
  const extra = platform === 'darwin' ? MAC_PATHS.filter(entry => !rest.includes(entry) && exists(entry)) : []
  return { [EXE_VARIABLE]: execPath, [key]: [dir, ...extra, ...rest].join(paths.delimiter) }
}

module.exports = { nodeEnv, nodeExecutable, nodeRuntime, EXE_VARIABLE, MAC_PATHS, RUNTIMES }
