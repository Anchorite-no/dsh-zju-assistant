/**
 * 给命令行用的 node。技能里的命令都是「node …」（core/zju/SKILL.md 的 `node <SKILL>/scripts/zju.ts`、
 * core/learn/references/animation.md 的 `node engine/build.mjs`），由引擎的命令行工具在用户的机器上执行，找的是 PATH 上名叫 node 的程序。
 * 应用自己带着一份 Node（Electron 里的那一份，应用自己跑 core 用的就是它，见 ui/profile/core.mjs），却没有一个叫 node 的程序给命令行用：
 * 没装 Node.js 的电脑上，助手一跑技能的命令就是「找不到 node」；装了旧版本的又跑不了 .ts（zju.ts 是直接拿来跑的）。
 * 引擎自己不管这件事（它的命令行工具只是原样继承进程的环境）。
 *
 * 做法：壳启动引擎时在数据目录的 bin 文件夹里放一个 node.cmd，它把应用自己的可执行文件当 Node 用（ELECTRON_RUN_AS_NODE），参数原样传过去；
 * 再把这个文件夹放到交给引擎的 PATH 最前面，引擎启动的命令都会继承。
 * 放在最前面，是要所有机器上跑技能的都是同一份 Node：用户自己装的可能太旧。开发时（npm start）也一样，免得只在装好的应用里才出问题。
 * 只放 .cmd，不放 .ps1：PowerShell 会先找 .ps1，而系统默认不许运行脚本，那样 node 反而整个用不了（npm 在 Windows 上就有这个毛病）。
 */
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const path = require('node:path')

/** 应用的可执行文件在哪，经这个环境变量告诉 node.cmd。不直接写进文件里：.cmd 是按系统的代码页读的，用户名带中文时路径会读错，环境变量不会。 */
const EXE_VARIABLE = 'CAMPUS_NODE_EXE'

const SHIM = [
  '@echo off',
  'rem Campus Agent: runs the Node that ships inside the app, so skills work on machines without Node.js.',
  'set "ELECTRON_RUN_AS_NODE=1"',
  `"%${EXE_VARIABLE}%" %*`,
  '',
].join('\r\n')

/**
 * 在 dir 里放好 node.cmd，返回要交给引擎进程的环境变量：应用的可执行文件在哪，和把 dir 放在最前面的 PATH。
 * env 是壳自己的环境（PATH 在 Windows 上可能写成 Path，照原来的写法给，免得出现两个）。
 * 别的系统上还没有做（应用现在只有 Windows 的），什么都不给；放不成时也什么都不给，命令行照旧用系统里的 node。
 */
function nodeEnv({ dir, execPath = process.execPath, env = process.env, platform = process.platform }) {
  if (platform !== 'win32') return {}
  const file = path.join(dir, 'node.cmd')
  try {
    mkdirSync(dir, { recursive: true })
    // 内容没变就不重写：别的进程可能正在用它。
    let old = ''
    try { old = readFileSync(file, 'utf8') } catch { /* 还没有 */ }
    if (old !== SHIM) writeFileSync(file, SHIM)
  } catch {
    return {}
  }
  const key = Object.keys(env).find(name => name.toLowerCase() === 'path') ?? 'PATH'
  const rest = (env[key] ?? '').split(path.delimiter).filter(entry => entry && path.resolve(entry).toLowerCase() !== path.resolve(dir).toLowerCase())
  return { [EXE_VARIABLE]: execPath, [key]: [dir, ...rest].join(path.delimiter) }
}

module.exports = { nodeEnv, EXE_VARIABLE }
