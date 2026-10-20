import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ProfileStore } from './store.mjs'
import { PluginSwitches } from './plugins.mjs'
const CHAT_OFF = ['campus.wechat-chat', 'campus.dingtalk']

const modules = env => env.ZJU_DISABLED_MODULES.split(',').sort().join(',')

test('ZJU mail is enabled by default and an explicit disable persists', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-mail-plugin-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const store = new ProfileStore(root), switches = new PluginSwitches(store, {})
  assert.equal(switches.disabled().includes('campus.mail'), false)
  switches.set({ id: 'campus.mail', enabled: false })
  assert.match(switches.promptText(), /浙大邮箱（campus-mail 技能和 campus_mail_\* 工具）/)
  assert.equal(new PluginSwitches(store, {}).disabled().includes('campus.mail'), true)
  switches.set({ id: 'campus.mail', enabled: true })
  assert.equal(new PluginSwitches(store, {}).disabled().includes('campus.mail'), false)
})

test('campus plugin switches persist, reach the ZJU kill switch and the model context', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-plugins-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const store = new ProfileStore(root)
  const env = { ZJU_DISABLED_MODULES: 'Zhiyun' }
  const switches = new PluginSwitches(store, env)
  // 什么都没动过时，只有默认关着的「课程讲解」和「微信公众号」不在开着的里面；它们不是 ZJU Core 的功能，不占模块。
  assert.deepEqual(switches.snapshot(), { disabled: [...CHAT_OFF, 'campus.learn', 'campus.wechat'] })
  assert.equal(env.ZJU_DISABLED_MODULES, 'zhiyun')
  assert.match(switches.promptText(), /课程讲解（learn 技能，做讲解）；微信公众号（weread 技能，读公众号文章）/)

  assert.deepEqual(switches.set({ id: 'campus.community', enabled: false }), { disabled: ['campus.community', ...CHAT_OFF, 'campus.learn', 'campus.wechat'] })
  assert.equal(modules(env), 'cc98,chalaoshi,zhiyun')
  assert.match(switches.promptText(), /校园社区.*cc98/)
  switches.set({ id: 'campus.materials', enabled: false })
  assert.equal(modules(env), 'cc98,chalaoshi,chaoxing,cnki,ebook,zhiyun')

  // A restart reads the same file.
  const restarted = {}
  assert.deepEqual(new PluginSwitches(store, restarted).snapshot().disabled.sort(), ['campus.community', 'campus.dingtalk', 'campus.learn', 'campus.materials', 'campus.wechat', 'campus.wechat-chat'])
  assert.equal(modules(restarted), 'cc98,chalaoshi,chaoxing,cnki,ebook,zhiyun')

  // Switching everything back on keeps the entry the launch environment came with.
  switches.set({ id: 'campus.community', enabled: true })
  switches.set({ id: 'campus.materials', enabled: true })
  assert.equal(env.ZJU_DISABLED_MODULES, 'zhiyun')
  const clean = {}
  new PluginSwitches(store, clean)
  assert.equal('ZJU_DISABLED_MODULES' in clean, false)

  assert.throws(() => switches.set({ id: 'campus.account', enabled: false }), /无效的插件开关/)
  assert.throws(() => switches.set({ id: 'campus.notices', enabled: 'no' }), /无效的插件开关/)
})

test('the engine hands the kill switch to the shell commands it starts', async t => {
  // 引擎每次起命令都现读一遍进程环境（scrubbedParentEnv）；升级引擎后这条不成立的话，开关就只剩提示作用。
  const { scrubbedParentEnv } = await import('@deepseek-ai/dsh-subprocess')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-plugins-'))
  const previous = process.env.ZJU_DISABLED_MODULES
  t.after(() => {
    if (previous === undefined) delete process.env.ZJU_DISABLED_MODULES
    else process.env.ZJU_DISABLED_MODULES = previous
    fs.rmSync(root, { recursive: true, force: true })
  })
  delete process.env.ZJU_DISABLED_MODULES
  const switches = new PluginSwitches(new ProfileStore(root))
  switches.set({ id: 'campus.notices', enabled: false })
  assert.equal(scrubbedParentEnv().ZJU_DISABLED_MODULES, 'notice')
  switches.set({ id: 'campus.notices', enabled: true })
  assert.equal('ZJU_DISABLED_MODULES' in scrubbedParentEnv(), false)
})

test('WeChat starts closed, its switch persists and does not claim a ZJU module', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-wechat-switch-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const env = {}, store = new ProfileStore(root), switches = new PluginSwitches(store, env)
  // 默认关着：技能的命令一条都不执行，也告诉模型它关着。
  assert.equal(env.WEREAD_DISABLED, '1')
  assert.equal(env.ZJU_DISABLED_MODULES, undefined)
  assert.match(switches.promptText(), /微信公众号（weread 技能/)
  switches.set({ id: 'campus.wechat', enabled: true })
  assert.equal(env.WEREAD_DISABLED, undefined)
  assert.deepEqual(new PluginSwitches(store, {}).disabled(), [...CHAT_OFF, 'campus.learn'])
  // 壳读的是同一个文件里的 enabled（desktop/weread.cjs）。
  assert.deepEqual(JSON.parse(fs.readFileSync(store.file('plugins.json'), 'utf8')).enabled, ['campus.wechat'])
  switches.set({ id: 'campus.wechat', enabled: false })
  assert.equal(env.WEREAD_DISABLED, '1')
  // 以前存下的文件里没有 enabled：照旧能读，公众号是关着的（升级上来的人不另外照顾）。
  fs.writeFileSync(store.file('plugins.json'), JSON.stringify({ disabled: [] }))
  assert.deepEqual(new PluginSwitches(store, {}).disabled(), [...CHAT_OFF, 'campus.learn', 'campus.wechat'])
})

test('a plugin that starts closed stays closed until the user opens it, and that choice survives a restart', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-optin-switch-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const store = new ProfileStore(root), switches = new PluginSwitches(store, {})
  assert.deepEqual(switches.disabled(), [...CHAT_OFF, 'campus.learn', 'campus.wechat'])

  for (const id of CHAT_OFF) switches.set({ id, enabled: true })
  // 打开：记在 enabled 那张单子里；都开着时就没有要对模型说的了。
  assert.deepEqual(switches.set({ id: 'campus.learn', enabled: true }), { disabled: ['campus.wechat'] })
  assert.deepEqual(switches.set({ id: 'campus.wechat', enabled: true }), { disabled: [] })
  assert.equal(switches.promptText(), '')
  assert.deepEqual(JSON.parse(fs.readFileSync(store.file('plugins.json'), 'utf8')), { disabled: [], enabled: [...CHAT_OFF, 'campus.learn', 'campus.wechat'] })
  assert.deepEqual(new PluginSwitches(store, {}).disabled(), [])

  // 再关上；和默认开着的那些互不相干。
  switches.set({ id: 'campus.notices', enabled: false })
  assert.deepEqual(switches.set({ id: 'campus.learn', enabled: false }), { disabled: ['campus.notices', 'campus.learn'] })
  assert.deepEqual(JSON.parse(fs.readFileSync(store.file('plugins.json'), 'utf8')), { disabled: ['campus.notices'], enabled: [...CHAT_OFF, 'campus.wechat'] })

  // 加这两项以前存下的文件只有 disabled：照旧能读，它们是关着的。放错单子的不认。
  fs.writeFileSync(store.file('plugins.json'), JSON.stringify({ disabled: ['campus.community', 'campus.learn'], enabled: ['campus.community'] }))
  assert.deepEqual(new PluginSwitches(store, {}).disabled(), ['campus.community', ...CHAT_OFF, 'campus.learn', 'campus.wechat'])
  fs.writeFileSync(store.file('plugins.json'), JSON.stringify({ disabled: ['campus.community'] }))
  assert.deepEqual(new PluginSwitches(store, {}).disabled(), ['campus.community', ...CHAT_OFF, 'campus.learn', 'campus.wechat'])
})
