import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Wechat } from './wechat.mjs'

const SPORTS = { biz: 'MzA3MDk5NDA0NA==', name: '浙大体育与艺术' }, NOTES = { biz: 'MTIzNDU2Nzg5MA==', name: 'ZJU微计录' }
const MINUTE = 60_000
const article = (id, title, publishedAt, extra = {}) => ({ id, title, url: `https://mp.weixin.qq.com/s?mid=${id}`, publishedAt, ...extra })

/**
 * 一个假的 weread 技能：world 里是它那边的样子（跟踪名单、两个来源各有哪些号的哪些文章、登没登录），
 * calls 记下服务跑了哪些命令、当时有没有人在场。
 */
function setup(t, patch = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-wechat-test-'))
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }) })
  const world = {
    disabled: [], calls: [], tracked: [], loggedIn: false, at: Date.parse('2026-10-11T09:00:00+08:00'), env: {},
    local: new Map([[SPORTS.biz, [article('s1', '全明星校园行', '2026-10-09T17:00:00+08:00')]]]), localProblem: null,
    web: new Map(), webProblem: null, ...patch,
  }
  const option = (args, name) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
  const known = [SPORTS, NOTES]
  const run = async (args, options) => {
    world.calls.push({ args: args.join(' '), interactive: options.interactive })
    if (world.hold) await world.hold(options.signal)
    if (args[0] === 'track') {
      const name = option(args, '--account')
      if (name && args.includes('--cancel')) world.tracked = world.tracked.filter(account => account.name !== name)
      else if (name) world.tracked.push(known.find(account => account.name === name))
      return { ok: true, tracked: world.tracked }
    }
    if (args[0] === 'login' && args.includes('--check')) return { ok: true, loggedIn: world.loggedIn }
    if (args[0] === 'login') return world.loginResult ?? (world.loggedIn = true, { ok: true })
    if (args[0] === 'logout') { world.loggedIn = false; return { ok: true } }
    if (args[0] === 'accounts') {
      if (option(args, '--source') === 'local') return world.localProblem ? { ok: false, ...world.localProblem } : { ok: true, source: 'local', accounts: [{ ...SPORTS, articles: 80, latestAt: '2026-10-09T17:00:00+08:00' }] }
      return { ok: true, source: 'web', accounts: [NOTES] }
    }
    // list：照技能的做法，先本机后微信读书；一个来源整体用不了就记在 sources 里。
    const order = option(args, '--source') ? [option(args, '--source')] : ['local', 'web'], sources = {}
    const accounts = world.tracked.map((account) => {
      let error = { status: 'account_not_found', message: `没有找到公众号「${account.name}」。` }
      for (const source of order) {
        const problem = source === 'local' ? world.localProblem : world.webProblem
        if (problem) { sources[source] = { ok: false, ...problem }; error = problem; continue }
        const articles = (source === 'local' ? world.local : world.web).get(account.biz)
        if (articles) { sources[source] = { ok: true }; return { ...account, source, articles } }
      }
      return { ...account, error }
    })
    return { ok: true, sources, accounts }
  }
  const service = new Wechat({
    plugins: { disabled: () => world.disabled }, settingsFile: path.join(root, 'profile', 'wechat.json'), cacheFile: path.join(root, 'cache', 'wechat.json'),
    run, now: () => world.at, env: world.env, schedule: (callback) => { world.timer = callback; return 7 }, cancel: (id) => { world.cancelled = id },
  })
  t.after(() => { service.dispose() })
  /** 等后台的事都做完。 */
  const settle = async () => { while (service.pending) await service.queue }
  return { world, service, settle, root, lists: () => world.calls.filter(call => call.args.startsWith('list')) }
}

test('半小时看一遍：一个号现有的文章不算新出现的，之后多出来的才算；页面和通知只看存下的', async (t) => {
  const { world, service, settle, lists } = setup(t)
  // 应用启动时先检查一次；名单还空着，只对了一遍名单和登录状态。
  await service.tick()
  assert.deepEqual(world.calls.map(call => call.args), ['track', 'login --check'])
  assert.deepEqual((await service.find({ source: 'local' })).accounts.map(account => account.name), ['浙大体育与艺术'])
  assert.equal(service.snapshot().local.ok, true, '找候选时顺带知道了本机微信能不能读')
  const added = await service.track({ name: SPORTS.name, source: 'local' })
  assert.deepEqual(added.accounts.map(account => [account.name, account.count]), [['浙大体育与艺术', 0]], '先看到它在名单里')
  await settle()
  assert.deepEqual(lists().at(-1), { args: 'list --limit 20 --source local', interactive: true }, '微信读书没登录，只看本机')
  assert.deepEqual(service.articles().articles.map(item => [item.title, item.from, item.foundAt]), [['全明星校园行', '浙大体育与艺术', null]])

  // 不到半小时不检查，打开详情页也不去读文章；到点以后多出来的一篇带上发现的时间。
  const before = lists().length
  world.local.get(SPORTS.biz).unshift(article('s2', '校园赛车体验', '2026-10-11T08:00:00+08:00'))
  world.at += 29 * MINUTE
  await service.tick()
  service.visit()
  await settle()
  assert.equal(lists().length, before)
  world.at += 2 * MINUTE
  await service.tick()
  assert.equal(lists().at(-1).interactive, false, '后台的检查没有人在场')
  const snapshot = service.snapshot()
  assert.deepEqual([snapshot.accounts[0].count, snapshot.accounts[0].latest.title, snapshot.accounts[0].source, snapshot.checkedAt], [2, '校园赛车体验', 'local', new Date(world.at).toISOString()])
  assert.deepEqual(service.articles().articles.map(item => item.foundAt), [new Date(world.at).toISOString(), null])

  // 「校园事务」页点刷新：不等半小时，马上再看一遍。
  world.local.get(SPORTS.biz).unshift(article('s3', '临湖歌会报名', '2026-10-11T09:20:00+08:00'))
  world.at += MINUTE
  await service.refresh()
  assert.deepEqual([lists().at(-1).interactive, service.articles().articles[0].title], [false, '临湖歌会报名'])

  // 助手在对话里去掉了这个号：下一次检查名单跟着变。
  world.tracked = []
  world.at += 31 * MINUTE
  await service.tick()
  assert.deepEqual(service.snapshot().accounts, [])
})

test('本机没有的号问微信读书；要用户自己验证时停下，自动验证打开或者用户点了才接着读', async (t) => {
  const blocked = { status: 'verification_required', message: '微信读书要先完成一次验证。' }
  const { world, service, settle, lists } = setup(t, { loggedIn: true, tracked: [SPORTS, NOTES], webProblem: blocked })
  world.web.set(NOTES.biz, [article('MP_1', '期中复习资料', '2026-10-10T20:00:00+08:00', { url: 'https://weread.qq.com/web/mp/content?reviewId=MP_1', originalUrl: 'https://mp.weixin.qq.com/s/abc' })])
  await service.tick()
  assert.deepEqual(lists().at(-1), { args: 'list --limit 20', interactive: false }, '两个来源一起看')
  let snapshot = service.snapshot()
  assert.deepEqual([snapshot.weread.loggedIn, snapshot.weread.state.status], [true, 'verification_required'])
  assert.deepEqual(snapshot.accounts.map(account => [account.name, account.count, account.error?.status ?? null]), [['浙大体育与艺术', 1, null], ['ZJU微计录', 0, 'verification_required']])
  assert.equal(service.articles().attention, 'verification_required')

  // 之后的检查只看本机，不再去碰微信读书；那个号的原因也不被「本机没有」盖掉。
  world.at += 31 * MINUTE
  await service.tick()
  assert.equal(lists().at(-1).args, 'list --limit 20 --source local')
  assert.equal(service.snapshot().accounts[1].error.status, 'verification_required')

  // 用户把「自动完成验证」打开了：不用等他去点，马上再读一遍；给人看的链接是原文的。
  world.webProblem = null
  service.set({ autoVerify: true })
  await settle()
  assert.deepEqual(lists().at(-1), { args: 'list --limit 20', interactive: false })
  snapshot = service.snapshot()
  assert.deepEqual([snapshot.weread.state.ok, snapshot.accounts[1].source, snapshot.accounts[1].latest.url, snapshot.accounts[1].error], [true, 'web', 'https://mp.weixin.qq.com/s/abc', null])
  assert.equal(service.articles().attention, '')

  // 又被要求验证；这回用户在详情页点了「去验证」：有人在场。
  world.webProblem = blocked
  world.at += 31 * MINUTE
  await service.tick()
  world.webProblem = null
  assert.equal(service.retry().busy, true)
  await settle()
  assert.deepEqual([lists().at(-1), service.snapshot().weread.state.ok], [{ args: 'list --limit 20', interactive: true }, true])

  // 被限频的过两个小时自己再试，不用用户管。
  world.webProblem = { status: 'rate_limited', message: '微信读书暂时限制了访问。' }
  world.at += 31 * MINUTE
  await service.tick()
  for (let round = 0; round < 3; round++) { world.at += 31 * MINUTE; await service.tick() }
  assert.equal(lists().at(-1).args, 'list --limit 20 --source local', '还没到两个小时')
  world.at += 31 * MINUTE
  await service.tick()
  assert.equal(lists().at(-1).args, 'list --limit 20')
})

test('两个选择：不用本机微信时只用微信读书，也这样告诉助手那边的技能', async (t) => {
  const { world, service, settle, lists, root } = setup(t, { loggedIn: true, tracked: [NOTES], env: { WEREAD_SOURCE: 'local' } })
  world.web.set(NOTES.biz, [article('MP_1', '期中复习资料', '2026-10-10T20:00:00+08:00')])
  assert.deepEqual(service.snapshot().settings, { local: true, autoVerify: true })
  assert.equal(service.set({ local: false, autoVerify: false }).local, null)
  assert.equal(world.env.WEREAD_SOURCE, 'web')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'profile', 'wechat.json'), 'utf8')), { local: false, autoVerify: false }, '壳从这个文件知道要不要自动验证')
  await settle()
  assert.equal(lists().at(-1).args, 'list --limit 20 --source web')
  assert.deepEqual(await service.find({ source: 'local' }), { ok: true, source: 'local', accounts: [] })
  assert.deepEqual((await service.find({ source: 'web' })).accounts, [NOTES], '微信读书那边列的是书架上的')
  assert.equal(world.calls.at(-1).args, 'accounts --source web')
  // 只关掉自动验证不用重新检查。
  const checks = lists().length
  service.set({ autoVerify: false })
  await settle()
  assert.equal(lists().length, checks)
  // 微信读书也退出了：两个来源都没有，每个号说明原因，不去跑命令。
  await service.logout()
  world.at += 31 * MINUTE
  await service.tick()
  assert.equal(lists().length, checks)
  assert.equal(service.snapshot().accounts[0].error.status, 'no_source')
  service.set({ local: true })
  assert.equal(world.env.WEREAD_SOURCE, 'local', '启动环境里原有的设置照原样放回去')
})

test('登录在后台等用户扫码：窗口被关掉不算出错，别的失败留给页面显示', async (t) => {
  const { world, service, settle } = setup(t, { tracked: [SPORTS] })
  world.loginResult = { ok: false, status: 'login_cancelled', message: '登录窗口已关闭。' }
  assert.deepEqual([service.login().busy, service.snapshot().activity], [true, ''])
  await settle()
  assert.deepEqual([service.snapshot().problem, service.snapshot().weread.loggedIn], ['', false])
  world.loginResult = { ok: false, status: 'login_timeout', message: '没有在限定时间内完成微信读书登录。' }
  service.login()
  await settle()
  assert.equal(service.snapshot().problem, '没有在限定时间内完成微信读书登录。')
  world.loginResult = undefined
  service.login()
  await settle()
  assert.deepEqual([service.snapshot().problem, service.snapshot().weread.loggedIn], ['', true])
  assert.deepEqual(world.calls.filter(call => call.args === 'login').map(call => call.interactive), [true, true, true])
})

test('插件关着时什么都不做；关掉的那一刻停下正在跑的命令', async (t) => {
  const { world, service } = setup(t, { tracked: [SPORTS] })
  world.disabled = ['campus.wechat']
  for (const action of [() => service.find({ source: 'local' }), () => service.track({ name: SPORTS.name }), () => service.untrack({ biz: SPORTS.biz }), () => service.logout(), () => service.refresh()]) await assert.rejects(action(), /插件已关闭/)
  for (const action of [() => service.login(), () => service.retry(), () => service.articles()]) assert.throws(action, /插件已关闭/)
  await service.tick()
  assert.deepEqual([world.calls.length, service.visit().enabled], [0, false])

  world.disabled = []
  let started
  const running = new Promise((resolve) => { started = resolve })
  world.hold = signal => new Promise((_resolve, reject) => { started(); signal.addEventListener('abort', () => { reject(new Error('已停止')) }) })
  const checking = service.tick()
  await running
  world.disabled = ['campus.wechat']
  service.changed()
  await checking
  assert.equal(service.pending, 0)
  service.start()
  service.dispose()
  assert.equal(world.cancelled, 7)
})
