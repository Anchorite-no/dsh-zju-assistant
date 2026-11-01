import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { nodeEnv, nodeExecutable } = require('./node.cjs')

const windows = { skip: process.platform !== 'win32' && '给命令行用的 node 只做了 Windows 的' }
const room = (t) => { const root = mkdtempSync(path.join(tmpdir(), 'campus-node-')); t.after(() => { rmSync(root, { recursive: true, force: true }) }); return root }

test('交给引擎的是放在最前面的 PATH 和应用自己的位置；PATH 照原来的写法给，重复的那一项去掉', windows, (t) => {
  const root = room(t), dir = path.join(root, 'bin'), exe = 'C:\\Users\\张三\\AppData\\Local\\Programs\\campus-agent\\CampusAgent.exe'
  const env = nodeEnv({ dir, execPath: exe, env: { Path: `C:\\Windows\\System32;${dir.toUpperCase()};C:\\Program Files\\nodejs` } })
  assert.deepEqual(env, { CAMPUS_NODE_EXE: exe, Path: `${dir};C:\\Windows\\System32;C:\\Program Files\\nodejs` })
  // 脚本里没有写死路径（.cmd 按系统的代码页读，中文路径会读错），全是 ASCII。
  const shim = readFileSync(path.join(dir, 'node.cmd'), 'utf8')
  assert.match(shim, /"%CAMPUS_NODE_EXE%" %\*/)
  assert.doesNotMatch(shim, /[^\x00-\x7F]/)
  assert.equal(existsSync(path.join(dir, 'node.ps1')), false)
  // 再启动一次不重写文件；环境里没有 PATH 时也给得出来。
  const before = statSync(path.join(dir, 'node.cmd')).mtimeMs
  assert.deepEqual(nodeEnv({ dir, execPath: exe, env: {} }), { CAMPUS_NODE_EXE: exe, PATH: dir })
  assert.equal(statSync(path.join(dir, 'node.cmd')).mtimeMs, before)
  // 别的系统上不动。
  assert.deepEqual(nodeEnv({ dir: path.join(root, 'other'), execPath: exe, env: {}, platform: 'darwin' }), {})
  assert.equal(existsSync(path.join(root, 'other')), false)
})

test('没装 Node 的命令行里，node 就是应用自己带的那一份：跑得了 .ts，参数原样到', windows, (t) => {
  // 数据目录带中文和空格（用户名常常是这样）。
  const root = room(t), dir = path.join(root, '数据 目录', 'bin'), runtime = nodeExecutable()
  const system = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')
  // 只留系统自己的那几样：PATH 里没有 Node.js。PATHEXT 要在，命令行靠它认 .cmd。
  const kept = Object.fromEntries(['SystemRoot', 'TEMP', 'TMP', 'PATHEXT', 'ComSpec', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'].map(name => [name, process.env[name]]).filter(([, value]) => value))
  const env = { ...kept, ...nodeEnv({ dir, execPath: runtime, env: { PATH: system } }) }
  const powershell = path.join(system, 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const run = command => execFileSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); ${command}; exit $LASTEXITCODE`], { env, encoding: 'utf8', timeout: 60_000 }).trim()

  // 这个环境里没有系统的 node：只能使用随应用提供的独立运行时。
  const versions = JSON.parse(run(`node -e "console.log(JSON.stringify(process.versions))"`))
  assert.equal(versions.electron, undefined)
  assert.equal(versions.node, require('node-win-x64/package.json').version)

  // 技能里的命令是「node 某个.ts 参数…」：类型标注要能直接跑，带空格和中文的参数要原样到，退出码要传回来。
  const script = path.join(root, 'echo.ts')
  writeFileSync(script, 'const given: string[] = process.argv.slice(2)\nconsole.log(JSON.stringify(given))\nprocess.exit(given.includes("--fail") ? 3 : 0)\n')
  assert.deepEqual(JSON.parse(run(`node '${script}' zhiyun search --keyword '数据结构 基础' --lesson 3`)), ['zhiyun', 'search', '--keyword', '数据结构 基础', '--lesson', '3'])
  assert.throws(() => run(`node '${script}' --fail`), error => error.status === 3)

  // 讲解的引擎会用「正在跑自己的那个程序」再起一个子进程（engine/lint.mjs 的 process.execPath）：子进程也得是 Node。
  const nested = path.join(root, 'nested.mjs')
  writeFileSync(nested, 'import { spawnSync } from "node:child_process"\nconst child = spawnSync(process.execPath, ["-e", "console.log(1 + 1)"], { encoding: "utf8" })\nconsole.log(child.stdout.trim())\n')
  assert.equal(run(`node '${nested}'`), '2')
})

test('随包的 Node 支持引擎原生加载器，运行时缺失不会借用系统 Node', windows, (t) => {
  assert.throws(() => nodeExecutable(room(t)), /缺少随应用提供的 Node/)
  const loader = JSON.stringify(require.resolve('node-addon-require-builtin'))
  execFileSync(nodeExecutable(), ['-e', `const assert = require('node:assert/strict'); const loader = require(${loader}); assert.equal(typeof loader.requireBuiltin('internal/modules/cjs/loader').Module, 'function')`], { windowsHide: true, timeout: 30_000 })
})

test('引擎起命令时把放在最前面的 PATH 和应用的位置原样带下去', windows, async (t) => {
  // 引擎每次起命令都现读一遍自己进程的环境（scrubbedParentEnv），会筛掉一些变量；这两样被筛掉的话，node.cmd 就白放了。
  const { scrubbedParentEnv } = await import('@deepseek-ai/dsh-subprocess')
  const key = Object.keys(process.env).find(name => name.toLowerCase() === 'path') ?? 'PATH'
  const saved = { path: process.env[key], exe: process.env.CAMPUS_NODE_EXE }
  t.after(() => {
    process.env[key] = saved.path
    if (saved.exe === undefined) delete process.env.CAMPUS_NODE_EXE
    else process.env.CAMPUS_NODE_EXE = saved.exe
  })
  const root = room(t)
  const exe = path.join('C:', 'Programs', 'campus-agent', 'CampusAgent.exe')
  Object.assign(process.env, nodeEnv({ dir: path.join(root, 'bin'), execPath: exe }))
  const passed = scrubbedParentEnv(), passedKey = Object.keys(passed).find(name => name.toLowerCase() === 'path')
  assert.equal(passed.CAMPUS_NODE_EXE, exe)
  assert.ok(passed[passedKey].startsWith(`${path.join(root, 'bin')}${path.delimiter}`))
  assert.ok(passed.PATHEXT, '没有 PATHEXT 的话命令行不认 .cmd')
})
