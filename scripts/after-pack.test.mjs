import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { shipMissingDependencies } = require('./after-pack.cjs')

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
