import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { ACCOUNTS, CAMPUS_PLUGINS, IDENTITY_FIELDS, SHARED_MODULES, TRANSPORT, accountKeys, accountReady } from './catalog.mjs'
import { CORE_ROOT } from './skills.mjs'

const zju = (...parts) => path.join(CORE_ROOT, 'zju', ...parts)
const sorted = values => [...values].sort()

test('每个插件管的都是 ZJU Core 里真有的模块，每个模块只归一处', async () => {
  const { modules } = await import(new URL('../../core/zju/lib/cli.ts', import.meta.url))
  const claimed = [...CAMPUS_PLUGINS.flatMap(plugin => plugin.modules), ...SHARED_MODULES]
  // hidden 的是 core 留着的旧入口，不算一项功能。
  assert.deepEqual(sorted(claimed), sorted(Object.keys(modules).filter(name => !modules[name].hidden)))
  assert.equal(new Set(claimed).size, claimed.length)
  for (const plugin of CAMPUS_PLUGINS) assert.ok(plugin.modules.length > 0, `${plugin.title} 没有对应的模块`)
  assert.deepEqual(CAMPUS_PLUGINS.filter(plugin => plugin.base).map(plugin => plugin.id), ['campus.account'])
})

test('账号和基础信息的键，应用写的和 ZJU Core 读的是同一批', async () => {
  const { ACCOUNT_KEYS, IDENTITY_KEYS } = await import(new URL('../../core/zju/lib/profile/profile.ts', import.meta.url))
  assert.deepEqual(sorted(accountKeys()), sorted(ACCOUNT_KEYS))
  assert.deepEqual(sorted(IDENTITY_FIELDS.filter(field => field.core).map(field => field.key)), sorted(IDENTITY_KEYS))
  assert.equal(new Set(IDENTITY_FIELDS.map(field => field.key)).size, IDENTITY_FIELDS.length)
})

test('每个账号都在某一个插件里填，而且只在一个里', () => {
  const placed = CAMPUS_PLUGINS.flatMap(plugin => plugin.accounts)
  assert.deepEqual(sorted(placed), sorted(Object.keys(ACCOUNTS)))
  for (const plugin of CAMPUS_PLUGINS) {
    for (const id of plugin.requires) assert.ok(plugin.accounts.includes(id), `${plugin.title} 要求的 ${id} 不在它的账号里`)
  }
})

test('账号填到什么程度算能用', () => {
  assert.equal(accountReady({ zju_username: '3250100000' }, 'zju'), false)
  assert.equal(accountReady({ zju_username: '3250100000', zju_password: 'x' }, 'zju'), true)
  assert.equal(accountReady({ lab_password: 'x' }, 'lab'), true)
  assert.equal(accountReady({ tyys_card_password: 'x' }, 'tyys'), true)
  assert.equal(accountReady({}, 'webvpn'), false)
  assert.equal(accountReady({ [TRANSPORT.key]: 'direct' }, 'webvpn'), true)
})

test('ZJU Core 叫用户去哪个插件里填，说的都是插件页上真有的名字', () => {
  const titles = new Set(CAMPUS_PLUGINS.map(plugin => plugin.title))
  const files = fs.readdirSync(zju(), { recursive: true })
    .filter(name => !name.split(path.sep).some(part => part === 'node_modules' || part === 'dev') && /\.(ts|md)$/.test(name))
  let seen = 0
  for (const name of files) {
    for (const line of fs.readFileSync(zju(name), 'utf8').split('\n')) {
      if (!/「插件」页|ACCOUNT_PAGE/.test(line)) continue
      // 几种写法：「插件」页的「课程与作业」里填、「插件」页里「校园社区」的账号、在「插件」页打开「校园账号」。
      for (const [, title] of line.matchAll(/(?:「插件」页|ACCOUNT_PAGE\})(?:的|里|打开)「([^」]+)」/g)) {
        seen++
        assert.ok(titles.has(title), `${name} 提到的「${title}」不是插件页上的名字`)
      }
    }
  }
  assert.ok(seen >= 8, `只找到 ${seen} 处，匹配的写法可能变了`)
})

test('本地聊天插件在 Windows 和 macOS 可启用，仍需主动开启', async () => {
  const { LOCAL_PLUGINS } = await import('./catalog.mjs')
  for (const id of ['campus.wechat-chat', 'campus.dingtalk']) {
    const plugin = LOCAL_PLUGINS.find(item => item.id === id)
    assert.deepEqual(plugin.platforms, ['win32', 'darwin'])
    assert.equal(plugin.optIn, true)
  }
})
