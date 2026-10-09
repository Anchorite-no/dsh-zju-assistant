import test from 'node:test'
import assert from 'node:assert/strict'
import { WechatFeeds, createWechatRunner } from './wechat.mjs'

const BIZ = 'MzA3MDk5NDA0NA=='
function setup(t) {
  const world = { disabled: [], calls: [], accounts: [{ biz: BIZ, name: '浙大体育与艺术', enabled: true, articleCount: 79 }], failure: null }
  const run = async (args, options) => {
    world.calls.push([...args])
    if (world.hold && args[0] === 'sync') await world.hold(options.signal)
    if (args[0] === 'list') return { ok: true, accounts: world.accounts, runtime: null }
    if (args[0] === 'sync' && world.failure) return { ok: false, error: world.failure }
    if (args[0] === 'articles') return { ok: true, articles: [{ title: '公开推文', biz: BIZ }] }
    if (args[0] === 'add') return { ok: true, account: world.accounts[0] }
    if (args[0] === 'discover') return { ok: true, accounts: world.accounts, source: { wechatVersion: '4.1.15.13' } }
    return { ok: true }
  }
  world.service = new WechatFeeds({ plugins: { disabled: () => world.disabled }, dataDir: 'unused', run,
    schedule: callback => { world.tick = callback; return 7 }, cancel: id => { world.cancelled = id } })
  t.after(() => world.service.dispose())
  return world
}

test('disabled plugin blocks discovery, mutations, refresh and assistant article reads; settings can see cached counts', async t => {
  const w = setup(t), s = w.service
  w.disabled = ['campus.wechat']
  for (const action of [() => s.discover(), () => s.add({ biz: BIZ }), () => s.set({ biz: BIZ, enabled: true }), () => s.refresh(), () => s.articles()]) {
    await assert.rejects(action(), /插件已关闭/)
  }
  await s.tick()
  assert.equal(w.calls.length, 0)
  assert.equal((await s.snapshot()).accounts[0].articleCount, 79)
  assert.deepEqual(w.calls, [['list']])
})

test('same refresh coalesces; timer does not overlap it; errors preserve cached article counts', async t => {
  const w = setup(t), s = w.service
  let release
  w.hold = () => new Promise(resolve => { release = resolve })
  const a = s.refresh(), b = s.refresh()
  await new Promise(resolve => setImmediate(resolve))
  await s.tick()
  assert.equal(w.calls.filter(x => x[0] === 'sync').length, 1)
  release(); await Promise.all([a, b]); w.hold = null
  w.failure = { code: 'wechat_not_running', message: '等待微信运行' }
  const result = await s.refresh()
  assert.equal(result.accounts[0].articleCount, 79)
  assert.equal(result.error, '等待微信运行')
  assert.equal(result.connection.running, false)
})

test('host lifecycle runs due sync and aborts owned work when disabled or disposed', async t => {
  const w = setup(t), s = w.service
  let aborted = false
  w.hold = signal => new Promise((resolve, reject) => { signal.addEventListener('abort', () => { aborted = true; reject(new Error('stopped')) }, { once: true }) })
  s.start()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(w.calls[0], ['sync', '--due'])
  w.disabled = ['campus.wechat']; s.changed()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(aborted, true)
  s.dispose()
  assert.equal(w.cancelled, 7)
})

test('selecting a local account adds then imports it without a seed article; article access checks registration', async t => {
  const w = setup(t), s = w.service
  const result = await s.add({ biz: BIZ, name: '浙大体育与艺术' })
  assert.equal(result.accounts[0].articleCount, 79)
  assert.deepEqual(w.calls[0], ['add', '--biz', BIZ, '--label', '浙大体育与艺术'])
  assert.deepEqual(w.calls[1], ['sync', '--biz', BIZ])
  const read = await s.articles({ account: '浙大体育与艺术', limit: 10 })
  assert.equal(read.articles.length, 1)
  await assert.rejects(s.articles({ biz: 'MTIzNDU2Nzg5MA==' }), /还没有添加/)
  await assert.rejects(s.add({ articleUrl: 'https://mp.weixin.qq.com@evil.example/s/abc' }), /公众号文章链接/)
})

test('runner resolves a supported interpreter and passes fixed script plus arguments without a shell', async () => {
  const calls = []
  const run = createWechatRunner({ dataDir: 'D:\\safe folder', env: { CAMPUS_WECHAT_PYTHON: 'python314' }, exec: async (command, args, options) => {
    calls.push({ command, args, options })
    return args.includes('-c') ? { code: 0, output: 'C:\\Python314\\python.exe\n' } : { code: 0, output: '{"ok":true,"accounts":[]}' }
  } })
  const name = '名字 $(not-a-command)'
  await run(['add', '--biz', BIZ, '--label', name])
  assert.equal(calls[1].command, 'C:\\Python314\\python.exe')
  assert.equal(calls[1].args.at(-1), name)
  assert.ok(calls[1].args.includes('D:\\safe folder'))
})
