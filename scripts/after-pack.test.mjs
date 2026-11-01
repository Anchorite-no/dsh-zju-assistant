import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { appDirOf, dropDeadWeight, installDirRoom, oddNames, shipMissingDependencies } = require('./after-pack.cjs')

/** 在 root 下面按 { '包的路径': package.json 的内容 } 建一棵 node_modules。 */
async function install(root, packages) {
  for (const [location, manifest] of Object.entries(packages)) {
    const dir = join(root, 'node_modules', ...location.split('/'))
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: location.split('/node_modules/').at(-1), ...manifest }))
    await writeFile(join(dir, 'index.js'), '')
  }
}

test('成品里补上没带的依赖：必需的 peer、它们的依赖和自带的包都拷过来；可选的 peer 和 devDependencies 不补', async (t) => {
  const tempRoot = resolve(tmpdir())
  const root = await mkdtemp(join(tempRoot, 'campus-after-pack-'))
  t.after(async () => {
    // 递归清理只允许作用于本测试创建的临时目录。
    assert.ok(resolve(root).startsWith(tempRoot + sep))
    await rm(root, { recursive: true, force: true })
  })
  const project = join(root, 'project'), app = join(root, 'out', 'resources', 'app')
  const all = {
    '@engine/boot': { dependencies: { lodash: '1' }, peerDependencies: { '@engine/group': '1', '@types/react': '1', missing: '1' }, peerDependenciesMeta: { '@types/react': { optional: true } }, devDependencies: { typescript: '1' } },
    lodash: {},
    '@engine/group': { dependencies: { parser: '1', nested: '2' }, peerDependencies: { '@engine/deep': '1' } },
    '@engine/group/node_modules/nested': {},
    '@engine/deep': {},
    parser: {},
    '@types/react': {},
    typescript: {},
  }
  await install(project, all)
  // electron-builder 只带了沿 dependencies 能走到的。
  await install(app, { '@engine/boot': all['@engine/boot'], lodash: {} })

  const result = shipMissingDependencies(app, project)
  assert.deepEqual(result, { added: ['@engine/deep', '@engine/group', 'parser'], unresolved: ['@engine/boot -> missing'] })
  const shipped = name => existsSync(join(app, 'node_modules', ...name.split('/'), 'package.json'))
  for (const name of ['@engine/group', '@engine/group/node_modules/nested', '@engine/deep', 'parser']) assert.equal(shipped(name), true, name)
  for (const name of ['@types/react', 'typescript', 'missing']) assert.equal(shipped(name), false, name)
  // 都齐了以后再跑一遍，不再拷任何东西。
  assert.deepEqual(shipMissingDependencies(app, project).added, [])
})

test('成品里删掉 node_modules 下面的源码映射和类型声明，别的都留着；我们自己的代码和 core 里的不动', async (t) => {
  const tempRoot = resolve(tmpdir())
  const root = await mkdtemp(join(tempRoot, 'campus-after-pack-'))
  t.after(async () => {
    assert.ok(resolve(root).startsWith(tempRoot + sep))
    await rm(root, { recursive: true, force: true })
  })
  const app = join(root, 'resources', 'app')
  const put = async (file, text = 'x') => { await mkdir(join(app, file, '..'), { recursive: true }); await writeFile(join(app, file), text) }
  const gone = ['node_modules/a/lib/index.js.map', 'node_modules/a/lib/types/index.d.ts', 'node_modules/@s/b/index.d.mts', 'node_modules/@s/b/index.d.cts',
    'node_modules/a/node_modules/c/c.css.map', 'core/zju/node_modules/d/d.d.ts', 'core/learn/engine/vendor/node_modules/e/e.js.map']
  const kept = ['node_modules/a/lib/index.js', 'node_modules/a/package.json', 'node_modules/a/README.md', 'node_modules/a/data.ts', 'node_modules/a/roadmap',
    'core/zju/scripts/zju.ts', 'core/zju/lib/types.d.ts', 'ui/lib/client.js.map', 'desktop/main.cjs']
  for (const file of [...gone, ...kept]) await put(file)
  assert.deepEqual(dropDeadWeight(app), { files: gone.length, bytes: gone.length })
  for (const file of gone) assert.equal(existsSync(join(app, file)), false, file)
  for (const file of kept) assert.equal(existsSync(join(app, file)), true, file)
  // 再跑一遍没有可删的。
  assert.deepEqual(dropDeadWeight(app), { files: 0, bytes: 0 })

  // 名字带中文的文件安装程序装不了，要在打包时就找出来；带中文的文件夹只报它自己，不再往里数。
  assert.deepEqual(oddNames(join(root, 'resources')), [])
  await put('core/learn/朗读器.cmd')
  await put('core/资料/a.txt')
  assert.deepEqual(oddNames(join(root, 'resources')).sort(), [join('app', 'core', 'learn', '朗读器.cmd'), join('app', 'core', '资料')].sort())
})

test('安装位置最长能有多少个字符：看成品里最深的文件（整条路径 259 个字符以内）和最深的文件夹（247 个以内），取紧的那个', async (t) => {
  const tempRoot = resolve(tmpdir())
  const root = await mkdtemp(join(tempRoot, 'campus-after-pack-'))
  t.after(async () => {
    assert.ok(resolve(root).startsWith(tempRoot + sep))
    await rm(root, { recursive: true, force: true })
  })
  const put = async (file) => { await mkdir(join(root, file, '..'), { recursive: true }); await writeFile(join(root, file), '') }
  await put('App.exe')
  await put('resources/app/node_modules/pkg/build/a-long-file-name.js')
  // 安装位置 + 反斜杠 + 最深的那个文件，不超过 259。
  const deepest = join('resources', 'app', 'node_modules', 'pkg', 'build', 'a-long-file-name.js')
  assert.deepEqual(installDirRoom(root), { room: 259 - 1 - deepest.length, longest: deepest })
  // 文件夹的限制更紧：一个很深的文件夹里只有名字很短的文件时，是它说了算。
  const folder = join('resources', 'app', 'a'.repeat(60))
  await put(join(folder, 'b'))
  assert.deepEqual(installDirRoom(root), { room: 247 - 1 - folder.length, longest: join(folder, 'b') })
})

test('成品里应用的文件夹：Windows 在 resources/app，macOS 在 .app 包里的 Contents/Resources/app', () => {
  assert.equal(appDirOf(join('dist', 'win-unpacked'), 'win32', 'CampusAgent'), join('dist', 'win-unpacked', 'resources', 'app'))
  assert.equal(appDirOf(join('dist', 'mac-arm64'), 'darwin', 'CampusAgent'), join('dist', 'mac-arm64', 'CampusAgent.app', 'Contents', 'Resources', 'app'))
})
