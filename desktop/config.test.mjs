import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, rm, copyFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { LocalCredentialProvider, parseCredentialsDocument } from '@deepseek-ai/dsh-credentials-local'
import { load } from 'js-yaml'
import { API_KEYS_FILE, campusEnvironment, writeCampusPatch } from './config.mjs'

const KEY = credentialRef('DEEPSEEK_API_KEY')

async function fixture(t) {
  const tempRoot = resolve(tmpdir())
  const root = await mkdtemp(join(tempRoot, 'campus-credentials-'))
  const fibers = []
  t.after(async () => {
    // 先停掉凭据服务（它在监听这个目录里的文件），再删目录；反过来的话，监听还开着时目录没了，
    // 它在测试结束后报出 realpath 的错，测试文件会偶发地整个算失败。
    for (const fiber of fibers) await fiber.dispose()
    // 递归清理只允许作用于本测试创建的临时目录。
    assert.ok(resolve(root).startsWith(tempRoot + sep))
    await rm(root, { recursive: true, force: true })
  })
  const app = join(root, "App's folder")
  const home = join(root, 'home')
  await mkdir(app)
  await mkdir(home)
  await copyFile(new URL('../app.patch.yml', import.meta.url), join(app, 'app.patch.yml'))
  const patch = load(await readFile(writeCampusPatch(app, home), 'utf8'))
  const config = patch.find(row => row.id === 'credentials').config
  assert.equal(resolve(config.path), join(app, API_KEYS_FILE))
  // 新位置没有 Key 时，旧的应用文件和 .env 中的值也不能被沿用。
  await writeFile(join(home, '.credentials.yaml'), 'version: 1\nrefs:\n  DEEPSEEK_API_KEY: old-home-key\n', { mode: 0o600 })
  await writeFile(join(home, '.env'), 'DEEPSEEK_API_KEY=old-dotenv-key\n')
  const ctx = new Context()
  ctx.reflect.provide('launchEnvironment', campusEnvironment({
    DEEPSEEK_API_KEY: 'old-environment-key',
    deepseek_api_key: 'old-lowercase-environment-key',
    DSH_HOME: home,
    PATH: 'preserved-path',
  }))
  assert.equal(ctx.launchEnvironment.get('PATH').value, 'preserved-path')
  assert.equal(ctx.launchEnvironment.get(KEY), undefined)
  return {
    ctx, path: config.path,
    async boot(watch = false) {
      const fiber = ctx.plugin(LocalCredentialProvider, { ...config, watch, debounceMs: 5 })
      fibers.push(fiber)
      await fiber
    },
  }
}

test('没有本地 Key 时不读取环境、.env 或旧凭据；界面保存写入新文件', async (t) => {
  const f = await fixture(t)
  await f.boot()
  assert.equal(await f.ctx.credentials.resolve(KEY), undefined)
  assert.deepEqual(await f.ctx.credentials.describe(KEY), { configured: false, writable: true })
  await f.ctx.credentials.set(KEY, 'key-from-settings')
  const saved = parseCredentialsDocument(await readFile(f.path, 'utf8'), f.path)
  assert.equal(saved.refs.get(KEY), 'key-from-settings')
  assert.deepEqual(await f.ctx.credentials.describe(KEY), { configured: true, writable: true, source: 'file' })
})

test('本地 Key 优先且可更换；直接编辑文件会更新后续请求读到的值', async (t) => {
  const f = await fixture(t)
  await writeFile(f.path, 'version: 1\nrefs:\n  DEEPSEEK_API_KEY: local-key\n', { mode: 0o600 })
  await f.boot(true)
  assert.deepEqual(await f.ctx.credentials.resolve(KEY), { value: 'local-key', source: 'file' })
  await f.ctx.credentials.set(KEY, 'key-from-settings')
  const edited = keyBecomes(f.ctx, 'edited-in-file')
  await writeFile(f.path, 'version: 1\nrefs:\n  DEEPSEEK_API_KEY: edited-in-file\n', { mode: 0o600 })
  assert.deepEqual(await edited, { value: 'edited-in-file', source: 'file' })
})

test('引擎的「预览版说明」弹窗按当前引擎里的版本号记为已读', async () => {
  const patch = load(await readFile(new URL('../app.patch.yml', import.meta.url), 'utf8'))
  // 版本号只写在引擎界面包的构建产物里，没有导出，只能从文件里读。
  const client = await readFile(createRequire(import.meta.url).resolve('@deepseek-ai/dsh-client-ui-settings-models/client'), 'utf8')
  const version = /WELCOME_NOTICE_VERSION = "([^"]+)"/.exec(client)?.[1]
  assert.ok(version, '引擎里找不到预览版说明的版本号')
  assert.equal(patch.find(row => row.id === 'ui-settings-general').config.welcomeNoticeVersion, version)
})

/**
 * 等到这把 Key 读出来是 value：每次文件变化生效后读一次，五秒还没等到就失败，并说明最后读到的是什么。
 * 不能只等第一次「Key 变了」的通知：刚在应用里保存完紧接着直接改文件时，应用自己那次保存引起的文件通知
 * 可能正好落在这次改写的半中间（文件已清空、内容还没写进去），于是先报一次「Key 没了」，随后才是改好的内容。
 * 实测这种先空后对的情况约占一半，最后读到的总是对的；只改文件、或保存后隔半秒再改，都不会出现。
 */
function keyBecomes(ctx, value) {
  return new Promise((resolveKey, reject) => {
    let last
    const timeout = setTimeout(() => { off(); reject(new Error(`密钥文件变化未生效，最后读到的是 ${JSON.stringify(last)}`)) }, 5000)
    const off = ctx.on('credentials/reference-updated', async (ref) => {
      if (ref !== KEY) return
      last = await ctx.credentials.resolve(KEY)
      if (last?.value !== value) return
      clearTimeout(timeout)
      off()
      resolveKey(last)
    })
  })
}
