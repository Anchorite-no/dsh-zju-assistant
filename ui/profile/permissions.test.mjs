import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { CORE_ROOT } from './skills.mjs'
import { TRUSTED_SCRIPTS, createScope, inside, installPermissions, literalWords, trustedCommand } from './permissions.mjs'

const zju = path.join(CORE_ROOT, 'zju', 'scripts', 'zju.ts')

test('只有每个词都是字面量的命令才拆得出来', () => {
  assert.deepEqual(literalWords('node "D:\\a b\\zju.ts" cc98 board list --keyword 情感 --all'), ['node', 'D:\\a b\\zju.ts', 'cc98', 'board', 'list', '--keyword', '情感', '--all'])
  assert.deepEqual(literalWords(`node x.ts --title 'it''s $5' --say "a ""b"""`), ['node', 'x.ts', '--title', "it's $5", '--say', 'a "b"'])
  // 结尾把错误输出并进来不算。
  assert.deepEqual(literalWords('node x.ts a 2>&1'), ['node', 'x.ts', 'a'])
  assert.deepEqual(literalWords('node x.ts user@zju.edu.cn https://a.b/c#d'), ['node', 'x.ts', 'user@zju.edu.cn', 'https://a.b/c#d'])
  for (const command of [
    '', 'node x.ts; rm y', 'node x.ts | ConvertFrom-Json', 'node x.ts > out.json', 'node x.ts && node y.ts', 'node x.ts $(whoami)', 'node x.ts "$env:TEMP"',
    'node x.ts `n', 'node x.ts\nRemove-Item y', '& node x.ts', 'node x.ts @args', 'node x.ts #c', "node x.ts 'open", 'node x.ts 2>&1 | Out-File y',
    // 弯引号在 PowerShell 里也是引号：这一条实际上会执行分号后面的东西。
    "node x.ts 'a\u2019 ; Remove-Item y '",
  ]) assert.equal(literalWords(command), undefined, command)
})

test('单独一条应用自带的校园命令才算，别的脚本、带选项的 node、接了别的东西的都不算', () => {
  for (const entry of TRUSTED_SCRIPTS) assert.ok(fs.existsSync(path.join(CORE_ROOT, entry)), entry)
  assert.equal(trustedCommand(`node "${zju}" cc98 board list --keyword 情感 --all`, 'C:\\chat'), true)
  assert.equal(trustedCommand(`node '${zju}' notice list 2>&1`, 'C:\\chat'), true)
  assert.equal(trustedCommand(`NODE.EXE ${zju.replaceAll('\\', '/')} zdbk timetable`, 'C:\\chat'), true)
  // 相对路径从这条命令的工作目录算。
  assert.equal(trustedCommand('node scripts/zju.ts cc98 hot', path.join(CORE_ROOT, 'zju')), true)
  assert.equal(trustedCommand('node scripts/zju.ts cc98 hot', 'C:\\chat'), false)
  assert.equal(trustedCommand(`node "${path.join(CORE_ROOT, 'weread', 'scripts', 'weread.ts')}" read https://mp.weixin.qq.com/s/x`, 'C:\\chat'), true)
  // 装在 C:\Program Files 下面时路径里有空格（macOS 上应用改过名也会有）：括在引号里的认，没括的在空格那里断开，不认（它也跑不起来）。
  const installed = process.platform === 'win32' ? 'C:\\Program Files\\CampusAgent\\resources\\app\\core' : '/Applications/Campus Agent.app/Contents/Resources/app/core'
  assert.equal(trustedCommand(`node "${installed}/zju/scripts/zju.ts" zdbk timetable`, 'C:\\chat', installed), true)
  assert.equal(trustedCommand(`node ${path.join(installed, 'zju', 'scripts', 'zju.ts')} zdbk timetable`, 'C:\\chat', installed), false)
  for (const command of [
    `node "${zju}" cc98 hot | ConvertFrom-Json`, `node "${zju}" cc98 hot; Remove-Item x`, `node "${zju}" cc98 hot > out.json`,
    `node -e "x" "${zju}"`, `node --require ./evil.js "${zju}" cc98 hot`, `python "${zju}"`, `node "${zju}.bak" cc98 hot`,
    // 讲解的引擎脚本会执行助手写的代码，不在名单里。
    `node "${path.join(CORE_ROOT, 'learn', 'engine', 'build.mjs')}" lessons/x/film`,
    `node "${path.join(CORE_ROOT, 'zju', 'scripts', 'command-docs.ts')}"`, 'node', '',
  ]) assert.equal(trustedCommand(command, 'C:\\chat'), false, command)
})

test('对话里放宽到整个对话总目录，校园命令不进沙箱', async () => {
  const root = path.resolve('docs', 'CampusAgent'), chat = path.join(root, '2026-10-12', '0134'), project = path.resolve('code', 'project')
  const scope = createScope({ chats: { root: async () => root } })
  const write = { mode: 'workspace-write', workspaceRoot: chat, sessionId: 's1' }
  // 对话总目录还没问到时照引擎原样。
  assert.equal(scope.file(write), write)
  await scope.located
  assert.equal(scope.chatRoot(), root)

  assert.equal(inside(chat, root), true)
  assert.equal(inside(root, root), true)
  assert.equal(inside(`${root}-other`, root), false)
  assert.equal(inside(path.resolve('docs'), root), false)

  // 写文件的工具：围栏放宽，别的不变；只读和完全权限不动。
  assert.deepEqual(scope.file(write), { ...write, workspaceRoot: root })
  const readOnly = { mode: 'read-only', workspaceRoot: chat }, full = { mode: 'danger-full-access', workspaceRoot: chat }
  assert.equal(scope.file(readOnly), readOnly)
  assert.equal(scope.file(full), full)
  assert.equal(scope.scopeOf(write), root)
  assert.equal(scope.scopeOf({ ...write, workspaceRoot: project }), undefined)

  // 助手自己写的命令：沙箱还在，根是对话总目录，工作目录不变。
  const own = scope.command({ command: 'python tidy.py', workdir: chat, sandboxPolicy: write })
  assert.deepEqual(own.sandboxPolicy, { ...write, workspaceRoot: root })
  assert.equal(own.workdir, chat)
  // 校园命令：只读和工作区内修改下都不进沙箱；接了管道就还在沙箱里。
  for (const policy of [write, readOnly]) assert.equal(scope.command({ command: `node "${zju}" cc98 hot`, workdir: chat, sandboxPolicy: policy }).sandboxPolicy.mode, 'danger-full-access')
  assert.equal(scope.command({ command: `node "${zju}" cc98 hot | ConvertFrom-Json`, workdir: chat, sandboxPolicy: write }).sandboxPolicy.mode, 'workspace-write')
  // 完全权限、没有策略的原样返回。
  const free = { command: 'x', workdir: chat, sandboxPolicy: full }
  assert.equal(scope.command(free), free)
  const bare = { command: 'x', workdir: chat }
  assert.equal(scope.command(bare), bare)

  // 用户自己添加的工作区：原样。
  const inProject = { command: 'npm test', workdir: project, sandboxPolicy: { mode: 'workspace-write', workspaceRoot: project } }
  assert.equal(scope.command(inProject), inProject)
})

test('对话总目录问不到时，一切照引擎原样', async () => {
  const scope = createScope({ chats: { root: async () => { throw new Error('问不到') } } })
  await scope.located
  const policy = { mode: 'workspace-write', workspaceRoot: path.resolve('docs', 'CampusAgent', 'x') }
  assert.equal(scope.file(policy), policy)
  assert.equal(scope.scopeOf(policy), undefined)
})

test('接到引擎上：包住 shell.resolve 和 fs.checkedTarget，撤掉时露出原来的方法', async () => {
  const root = path.resolve('docs', 'CampusAgent'), chat = path.join(root, '2026-10-12', '0134')
  const session = { id: 's1', header: { cwd: chat } }
  class Shell { resolve(request) { return { command: request.command, workdir: request.workdir, sandboxPolicy: request.sandboxPolicy } } }
  class Files { async checkedTarget(target, policy) { return { target, policy } } }
  const shell = new Shell(), files = new Files(), disposers = [], contexts = []
  let mode = 'workspace-write'
  const services = {
    shell, fs: files,
    sandboxPolicy: { resolve: ({ session: from } = {}) => ({ mode, workspaceRoot: from?.header.cwd ?? path.resolve('fallback') }) },
    systemPrompt: { context: value => contexts.push(value), getContextOrder: () => 40 },
  }
  const inner = { ...services, effect: (create) => { disposers.push(create()) } }
  const ctx = { inject: (_names, run) => { run(inner) }, logger: { warn: message => assert.fail(message) } }
  installPermissions(ctx, { chats: { root: async () => root } })
  await new Promise(resolve => setImmediate(resolve))

  const policy = services.sandboxPolicy.resolve({ session })
  assert.equal(shell.resolve({ command: `node "${zju}" cc98 hot`, workdir: chat, sandboxPolicy: policy }).sandboxPolicy.mode, 'danger-full-access')
  assert.equal((await files.checkedTarget('t', policy)).policy.workspaceRoot, root)
  // 没给策略时用部署默认的那一份，不在对话里就不放宽。
  assert.equal((await files.checkedTarget('t')).policy.workspaceRoot, path.resolve('fallback'))

  const [scopeText] = contexts
  assert.equal(scopeText.order, 41)
  assert.match(scopeText.text({ agent: { session } }), /整个 .*CampusAgent.* 都能写[\s\S]*单独一条执行/)
  assert.doesNotMatch(scopeText.text({ agent: { session: { id: 's2', header: { cwd: path.resolve('code') } } } }), /都能写/)
  assert.equal(scopeText.text({}), '')
  mode = 'danger-full-access'
  assert.equal(scopeText.text({ agent: { session } }), '')

  for (const dispose of disposers) dispose()
  assert.equal(Object.hasOwn(shell, 'resolve'), false)
  assert.equal(Object.hasOwn(files, 'checkedTarget'), false)
})
