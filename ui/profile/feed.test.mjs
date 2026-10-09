import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Feed, fromNotice } from './feed.mjs'

const READY = { zju_username: '3250100000', zju_password: 'x', webvpn_username: 'a', webvpn_password: 'b' }

function fixture(t, { accounts = READY, disabled = [], articles = async () => ({ articles: [], accounts: [] }), run } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-feed-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const state = { accounts, disabled, at: Date.parse('2026-10-09T12:00:00+08:00'), calls: [] }
  const feed = new Feed({
    file: path.join(root, 'cache', 'feed.json'), account: { read: () => ({ data: state.accounts }) }, plugins: { disabled: () => state.disabled },
    articles, now: () => state.at, run: async (args, options) => { state.calls.push({ args, options }); return run(state) },
  })
  return { feed, state, file: path.join(root, 'cache', 'feed.json') }
}
const notice = (title, date, source = '教务网·本科生院通知公告') => ({ title, date, source, url: `https://example.test/${encodeURIComponent(title)}` })

test('学校通知一条条攒进缓存，和公众号文章按时间排在一起', async (t) => {
  const { feed, state, file } = fixture(t, {
    run: s => ({ notices: s.calls.length === 1 ? [notice('第三轮选课通知', '2026-10-08'), notice('国庆后班车调整', '2026-10-06', '综合服务网·重点提示')] : [notice('四六级报名', '2026-10-09')] }),
    articles: async () => ({ accounts: [{ biz: 'B1', name: '浙大体育与艺术' }], articles: [
      { id: 'a1', biz: 'B1', title: '全明星校园行', url: 'https://mp.weixin.qq.com/s/x', publishedAt: '2026-10-09T09:00:00.000Z' },
      { id: 'a2', biz: 'B1', title: '没有时间的不要', url: 'https://mp.weixin.qq.com/s/y', publishedAt: null },
    ] }),
  })
  // 只看缓存时不联网；第一次读之前学校通知是空的，公众号的已经在。
  assert.deepEqual((await feed.snapshot()).items.map(item => item.title), ['全明星校园行'])
  assert.equal(state.calls.length, 0)
  const first = await feed.refresh()
  assert.deepEqual(first.items.map(item => [item.title, item.from, item.kind]), [
    ['全明星校园行', '浙大体育与艺术', 'wechat'], ['第三轮选课通知', '教务网', 'school'], ['国庆后班车调整', '综合服务网', 'school'],
  ])
  // 应用用自己的那份已读记录，不动助手的。
  assert.deepEqual(state.calls[0].args, ['notice', 'new'])
  assert.deepEqual(state.calls[0].options.env, { ZJU_NOTICE_READER: 'app' })
  assert.equal(first.sources[0].fetchedAt, new Date(state.at).toISOString())
  // 刚读过不重读；过了十分钟再读，新的加进来，原来的还在。
  await feed.refresh()
  assert.equal(state.calls.length, 1)
  state.at += 11 * 60_000
  const second = await feed.refresh()
  assert.deepEqual(second.items.filter(item => item.kind === 'school').map(item => item.title), ['四六级报名', '第三轮选课通知', '国庆后班车调整'])
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).items.length, 3)
  // 太久以前的通知不再留。
  state.at += 43 * 86_400_000
  await feed.refresh({ force: true })
  assert.deepEqual((await feed.snapshot()).items.filter(item => item.kind === 'school').map(item => item.title), ['四六级报名', '第三轮选课通知'])
})

test('一次没读完接着读；这次没读到时原来的留着并说明原因', async (t) => {
  let fail = false
  const { feed, state } = fixture(t, { run: (s) => {
    if (fail) throw new Error('校园通知一直没有回应，稍后再试。')
    return s.calls.length === 1 ? { notices: [notice('甲', '2026-10-09')], remaining: 5 } : { notices: [notice('乙', '2026-10-08')] }
  } })
  assert.deepEqual((await feed.refresh()).items.map(item => item.title), ['甲', '乙'])
  assert.equal(state.calls.length, 2)
  fail = true
  const failed = await feed.refresh({ force: true })
  assert.deepEqual(failed.items.map(item => item.title), ['甲', '乙'])
  assert.match(failed.sources[0].error, /没有回应/)
  assert.ok(failed.sources[0].fetchedAt)
  // 失败后五分钟内不自动重试，点刷新才读。
  state.at += 60_000
  await feed.refresh()
  assert.equal(state.calls.length, 3)
})

test('插件关着或账号没填时不去读，也不拿缓存给人看', async (t) => {
  const { feed, state } = fixture(t, { run: () => ({ notices: [notice('甲', '2026-10-09')] }) })
  await feed.refresh()
  state.disabled = ['campus.notices', 'campus.wechat']
  const off = await feed.refresh({ force: true })
  assert.deepEqual(off.items, [])
  assert.deepEqual(off.sources.map(source => source.state), ['off', 'off'])
  state.disabled = ['campus.wechat']
  state.accounts = { zju_username: '3250100000' }
  const account = await feed.refresh({ force: true })
  assert.deepEqual([account.sources[0].state, account.sources[0].plugin], ['account', 'campus.account'])
  assert.equal(state.calls.length, 1)
  // 校园网直连时不用 WebVPN 账号。
  state.accounts = { zju_username: '3250100000', zju_password: 'x', transport: 'direct' }
  assert.equal((await feed.snapshot()).sources[0].state, 'ready')
})

test('格式不对的条目不要', () => {
  assert.equal(fromNotice({ title: '', date: '2026-10-09', url: 'x' }, ''), undefined)
  assert.equal(fromNotice({ title: '甲', date: '十月', url: 'x' }, ''), undefined)
  assert.equal(fromNotice({ title: '甲', date: '2026-10-09 08:00', source: '计算机科学与技术学院·本科生教育', url: 'https://x' }, 'now').from, '计算机科学与技术学院')
})
