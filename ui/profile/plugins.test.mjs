import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ProfileStore } from './store.mjs'
import { PluginSwitches } from './plugins.mjs'

const modules = env => env.ZJU_DISABLED_MODULES.split(',').sort().join(',')

test('campus plugin switches persist, reach the ZJU kill switch and the model context', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-plugins-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const store = new ProfileStore(root)
  const env = { ZJU_DISABLED_MODULES: 'Zhiyun' }
  const switches = new PluginSwitches(store, env)
  assert.deepEqual(switches.snapshot(), { disabled: [] })
  assert.equal(env.ZJU_DISABLED_MODULES, 'zhiyun')
  assert.equal(switches.promptText(), '')

  assert.deepEqual(switches.set({ id: 'campus.community', enabled: false }), { disabled: ['campus.community'] })
  assert.equal(modules(env), 'cc98,chalaoshi,zhiyun')
  assert.match(switches.promptText(), /校园社区.*cc98/)
  switches.set({ id: 'campus.materials', enabled: false })
  assert.equal(modules(env), 'cc98,chalaoshi,chaoxing,cnki,ebook,zhiyun')

  // A restart reads the same file.
  const restarted = {}
  assert.deepEqual(new PluginSwitches(store, restarted).snapshot().disabled.sort(), ['campus.community', 'campus.materials'])
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

test('independent WeChat switch persists without claiming a ZJU module', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-wechat-switch-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const env = {}, store = new ProfileStore(root), switches = new PluginSwitches(store, env)
  switches.set({ id: 'campus.wechat', enabled: false })
  assert.equal(env.CAMPUS_WECHAT_DISABLED, '1')
  assert.equal(env.ZJU_DISABLED_MODULES, undefined)
  assert.match(switches.promptText(), /微信公众号.*独立采集模块/)
  assert.deepEqual(new PluginSwitches(store, {}).disabled(), ['campus.wechat'])
  switches.set({ id: 'campus.wechat', enabled: true })
  assert.equal(env.CAMPUS_WECHAT_DISABLED, undefined)
})
