import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, readFile, access, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const require = createRequire(import.meta.url)

async function fixture(t) {
  const base = await realpath(tmpdir())
  const root = await mkdtemp(join(base, 'campus-build-deps-'))
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(base))
    await rm(root, { recursive: true })
  })
  const source = join(root, 'source')
  await mkdir(join(source, 'nested'), { recursive: true })
  for (const file of ['a.txt', 'b.md', '.hidden.txt', 'nested/c.txt']) {
    await writeFile(join(source, file), file)
  }
  return { root, source }
}

test('新版 glob 适配器保持 rimraf 使用的目录、忽略、隐藏文件和回调契约', async t => {
  // temp/rimraf is still a dependency of electron-winstaller. Resolve the
  // actual legacy consumer rather than testing a different hoisted glob.
  const fromTemp = createRequire(require.resolve('temp'))
  const fromRimraf = createRequire(fromTemp.resolve('rimraf'))
  const glob = fromRimraf('glob')
  const { source } = await fixture(t)
  assert.equal(glob.hasMagic('{a,b}.txt'), true)
  assert.equal(glob.hasMagic('literal.txt'), false)
  assert.deepEqual(glob.sync('**/*.txt', { cwd: source }).sort(), ['a.txt', 'nested/c.txt'])
  assert.deepEqual(glob.sync('**/*.txt', { cwd: source, ignore: 'nested/**' }), ['a.txt'])
  assert.deepEqual(glob.sync('**/*.txt', { cwd: source, dot: true }).sort(), ['.hidden.txt', 'a.txt', 'nested/c.txt'])
  assert.deepEqual(glob.sync('missing-*.txt', { cwd: source, nonull: true }), ['missing-*.txt'])
  const matches = await new Promise((resolve, reject) => {
    glob('**/*.{txt,md}', { cwd: source }, (error, files) => error ? reject(error) : resolve(files))
  })
  assert.deepEqual(matches.sort(), ['a.txt', 'b.md', 'nested/c.txt'])
})

test('更新后的 ASAR 保持打包和读取契约，并提供 builder 使用的流式 API', async t => {
  const asar = await import('@electron/asar')
  const { root, source } = await fixture(t)
  const archive = join(root, 'fixture.asar')
  assert.equal(typeof asar.createPackageFromStreams, 'function')
  await asar.createPackage(source, archive)
  assert.equal(asar.extractFile(archive, 'nested/c.txt').toString(), 'nested/c.txt')
  assert.equal(asar.statFile(archive, 'a.txt').size, Buffer.byteLength('a.txt'))
})

test('旧 rimraf 经适配器只清理指定匹配，保留同目录其他文件', async t => {
  const fromTemp = createRequire(require.resolve('temp'))
  const rimraf = fromTemp('rimraf')
  const { root } = await fixture(t)
  const trash = join(root, 'trash')
  assert.equal(dirname(resolve(trash)), resolve(root))
  await mkdir(trash)
  await writeFile(join(trash, 'drop.tmp'), 'temporary')
  await writeFile(join(trash, 'keep.txt'), 'keep')
  await new Promise((resolve, reject) => rimraf(join(trash, '*.tmp'), error => error ? reject(error) : resolve()))
  await assert.rejects(access(join(trash, 'drop.tmp')), { code: 'ENOENT' })
  assert.equal(await readFile(join(trash, 'keep.txt'), 'utf8'), 'keep')
  rimraf.sync(join(trash, 'keep.txt'))
  await assert.rejects(access(join(trash, 'keep.txt')), { code: 'ENOENT' })
})

test('更新后的 EJS 保持 builder 的编译与转义契约', () => {
  const ejs = require('ejs')
  const render = ejs.compile('name=<%= name %>; raw=<%- raw %>')
  assert.equal(render({ name: '<Ada&>', raw: '<b>ok</b>' }), 'name=&lt;Ada&amp;&gt;; raw=<b>ok</b>')
})

test('更新后的 universal 模块仍可由 builder 动态加载', async () => {
  const universal = await import('@electron/universal')
  assert.equal(typeof universal.makeUniversalApp, 'function')
})
