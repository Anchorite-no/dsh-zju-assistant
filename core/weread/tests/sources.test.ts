import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// The tracking list lives in the data directory, so point it at a disposable one before loading the modules.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'weread-sources-'))
process.env.WEREAD_DATA_DIR = directory
delete process.env.WEREAD_SOURCE
const { accounts, list, listTracked, read, track, newArticles } = await import('../lib/sources.ts')
const { setLocalReader } = await import('../lib/local.ts')
const { setBrowser } = await import('../lib/browser/runtime.ts')
const { SkillError } = await import('../lib/config.ts')
test.after(() => fs.rmSync(directory, { recursive: true, force: true }))

const biz = 'MTIzNDU2Nzg5MA==', bookId = 'MP_WXS_1234567890'
const original = (mid: number) => `https://mp.weixin.qq.com/s?__biz=MTIzNDU2Nzg5MA%3D%3D&mid=${mid}&idx=1&sn=abc`
const localArticle = (mid: number, title: string) => ({ id: `${biz}:${mid}:1`, title, url: original(mid), publishedAt: `2026-10-0${mid}T08:00:00+08:00` })
const webId = (title: string) => `${bookId}_${Buffer.from(title).toString('hex')}`
const page = (text: string) => `<html><body><h1 id="activity-name">页面标题</h1><div id="js_content"><p>${text}</p></div></body></html>`

/** Both sources are faked at their outer edge: the WeChat reader, the WeRead browser and the original site. */
function setup(t: any, state: { local: any; web: string[]; fetched?: string[]; articleError?: Error }) {
  const requests: string[] = []
  useLocal(state.local)
  setBrowser({
    request: async url => {
      const target = new URL(url)
      requests.push(target.pathname)
      const body = target.pathname === '/web/shelf/sync' ? { books: [{ bookId, title: '测试号' }] }
        : target.pathname === '/web/mp/articles' ? { reviews: target.searchParams.get('offset') === '0' ? state.web.map(title => ({ subReviews: [{ review: { reviewId: webId(title), mpInfo: { title } } }] })) : [] }
        : target.pathname === '/api/store/search' ? {} : assert.fail('unexpected WeRead endpoint: ' + target.pathname)
      return { status: 200, body: typeof body === 'string' ? body : JSON.stringify(body) }
    },
    article: async url => { state.fetched?.push(url); if (state.articleError) throw state.articleError; return page('微信原文正文') },
    cookie: async () => undefined, login: async () => assert.fail('no login'), solve: async () => assert.fail('no captcha'), logout: async () => assert.fail('no logout'), close: async () => {},
  })
  t.mock.method(globalThis, 'fetch', async () => assert.fail('article must use the bundled browser'))
  t.after(() => { setLocalReader(); setBrowser(); fs.rmSync(path.join(directory, 'tracked.json'), { force: true }) })
  return requests
}
/** One command reads WeChat once, so a changed local state needs a fresh reader. */
function useLocal(value: any) { setLocalReader(async () => { if (value instanceof Error) throw value; return value }) }
const wechat = [{ biz, name: '测试号', articles: [localArticle(2, '第二篇'), localArticle(1, '第一篇')] }, { biz: 'OTg3NjU0MzIxMA==', name: '测试号二', articles: [] }]

test('without --source the local account is used and WeRead is never contacted', async t => {
  const requests = setup(t, { local: wechat, web: [] })
  const result = await list({ account: '测试号', limit: 1 })
  assert.deepEqual([result.source, result.account, result.articles.map(a => a.title)], ['local', { biz, name: '测试号' }, ['第二篇']])
  assert.deepEqual(requests, [])
})

test('when local cannot provide the account, WeRead is used; a fixed source never falls back', async t => {
  setup(t, { local: new SkillError('wechat_not_running', '微信没有运行'), web: ['网页文章'] })
  const result = await list({ account: '测试号', limit: 1 })
  assert.deepEqual([result.source, result.articles[0].url], ['web', 'https://weread.qq.com/web/mp/content?reviewId=' + webId('网页文章')])
  await assert.rejects(list({ account: '测试号', source: 'local' }), (e: any) => e.code === 'wechat_not_running')
  await assert.rejects(list({ account: '不存在' }), (e: any) => e.code === 'account_not_found' && e.message.includes('local：微信没有运行'), 'the last error says why local was skipped')
  await assert.rejects(list({ account: '测试号', source: 'both' }), (e: any) => e.code === 'invalid_source')
})

test('an ambiguous name is reported with its candidates instead of switching source', async t => {
  const requests = setup(t, { local: [wechat[1], { ...wechat[1], biz, name: '测试号三' }], web: [] })
  await assert.rejects(list({ account: '测试号' }), (e: any) => e.code === 'account_ambiguous' && e.details.candidates.length === 2)
  assert.deepEqual(requests, [])
})

test('read by account and title finds the article in the source and uses the same browser reader', async t => {
  const state = { local: wechat, web: ['网页文章'], fetched: [] as string[] }
  const requests = setup(t, state)
  const local = await read({ account: '测试号', title: '第一' })
  assert.match(local.markdown, /微信原文正文/); assert.deepEqual(state.fetched, [original(1)]); assert.deepEqual(requests, [])
  assert.equal(local.publishedAt, '2026-10-01T08:00:00+08:00', 'the listing supplies what the page lacks')
  const web = await read({ account: '测试号', title: '网页文章', source: 'web' })
  assert.match(web.markdown, /微信原文正文/); assert.deepEqual(requests, ['/web/shelf/sync', '/web/mp/articles'])
  assert.equal(web.url, 'https://mp.weixin.qq.com/s/' + webId('网页文章').slice(bookId.length + 1))
  await assert.rejects(read({ account: '测试号', title: '篇', source: 'local' }), (e: any) => e.code === 'article_ambiguous')
  assert.match((await read({ account: '测试号', title: '网页文章' })).markdown, /微信原文正文/, 'a title local does not have is looked up on WeRead')
})

test('both link forms go straight to the shared browser without account lookup', async t => {
  const state = { local: new Error('a link needs no account lookup'), web: [], fetched: [] as string[] }
  const requests = setup(t, state)
  assert.match((await read({ url: original(1) + '&scene=1' })).markdown, /微信原文正文/)
  assert.match((await read({ url: `https://weread.qq.com/web/mp/content?reviewId=${bookId}_x` })).markdown, /微信原文正文/)
  assert.deepEqual([state.fetched, requests], [[original(1), `https://weread.qq.com/web/mp/content?reviewId=${bookId}_x`], []])
  for (const options of [{}, { account: '测试号' }, { url: original(1), title: '第一篇' }]) await assert.rejects(read(options), (e: any) => e.code === 'invalid_input')
})

test('tracking records what exists; new returns each later article once, per source', async t => {
  const state = { local: [{ ...wechat[0], articles: [localArticle(1, '第一篇')] }], web: ['网页旧文'] }
  setup(t, state)
  await assert.rejects(newArticles({}), (e: any) => e.code === 'nothing_tracked')
  assert.deepEqual((await track({ account: '测试号' })).tracked, [{ biz, name: '测试号' }])
  assert.deepEqual((await newArticles({})).articles, [])
  useLocal(wechat)
  const found = (await newArticles({})).articles
  assert.deepEqual(found.map(a => [a.account, a.source, a.title]), [['测试号', 'local', '第二篇']])
  assert.deepEqual((await newArticles({})).articles, [], 'already returned')
  assert.deepEqual((await newArticles({ source: 'web' })).articles, [], 'the first check through another source only sets its baseline')
  state.web = ['网页新文', '网页旧文']
  assert.deepEqual((await newArticles({ source: 'web' })).articles.map(a => a.title), ['网页新文'])
  useLocal(new SkillError('wechat_not_running', '微信没有运行'))
  state.web = ['网页更新', '网页新文', '网页旧文']
  assert.deepEqual((await newArticles({ account: '测试' })).articles.map(a => [a.source, a.title]), [['web', '网页更新']], 'falls back to WeRead by the tracked identity')
  assert.deepEqual((await track({ account: '测试', cancel: true })).tracked, [])
  assert.deepEqual((await track({})).tracked, [])
})

test('after resolving an article, verification or deletion errors never switch sources', async t => {
  const state = { local: wechat, web: ['第一篇'], fetched: [] as string[], articleError: new SkillError('verification_not_passed', '验证失败') }
  const requests = setup(t, state)
  await assert.rejects(read({ account: '测试号', title: '第一篇' }), (e: any) => e.code === 'verification_not_passed')
  state.articleError = new SkillError('article_deleted', '文章已删除')
  await assert.rejects(read({ account: '测试号', title: '第一篇' }), (e: any) => e.code === 'article_deleted')
  assert.deepEqual(requests, [])
  assert.deepEqual(state.fetched, [original(1), original(1)])
})

test('listing every tracked account reads each where it can and leaves the new-article cursor alone', async t => {
  const state = { local: [{ ...wechat[0], articles: [localArticle(1, '第一篇')] }, wechat[1]] as any, web: [] }
  const requests = setup(t, state)
  assert.deepEqual(await listTracked({}), { ok: true, sources: {}, accounts: [] })
  await track({ account: '测试号' }); await track({ account: '测试号二' })
  useLocal(wechat)
  const all = await listTracked({ limit: 1 })
  assert.deepEqual(all.sources, { local: { ok: true } })
  assert.deepEqual(all.accounts, [{ biz, name: '测试号', source: 'local', articles: [localArticle(2, '第二篇')] }, { biz: wechat[1].biz, name: '测试号二', source: 'local', articles: [] }])
  assert.deepEqual(requests, [])
  assert.deepEqual((await newArticles({})).articles.map(a => a.title), ['第二篇'], 'what listing showed is still new to `new`')

  // One account missing from a source is that account's problem only.
  useLocal([wechat[0]])
  const partial = await listTracked({ source: 'local' })
  assert.deepEqual([partial.sources, partial.accounts[1]], [{ local: { ok: true } }, { biz: wechat[1].biz, name: '测试号二', error: { status: 'account_not_found', message: '本机微信里没有公众号「测试号二」的消息。' } }])
})

test('a source that is down as a whole is asked once, and every account that needed it reports why', async t => {
  setup(t, { local: wechat, web: [] })
  await track({ account: '测试号' }); await track({ account: '测试号二' })
  useLocal(new SkillError('wechat_not_running', '微信没有运行'))
  const asked: string[] = []
  setBrowser({
    request: async url => { asked.push(new URL(url).pathname); return { status: 200, body: JSON.stringify({ errCode: -2041 }) } },
    // What a host answers when nobody is there to complete a verification.
    solve: async () => { throw new SkillError('verification_required', '微信读书要先完成一次验证。') },
    article: async () => assert.fail('no article'), cookie: async () => undefined, login: async () => assert.fail('no login'), logout: async () => assert.fail('no logout'), close: async () => {},
  })
  const result = await listTracked({})
  const blocked = { status: 'verification_required', message: '微信读书要先完成一次验证。' }
  assert.deepEqual(result.sources, { local: { ok: false, status: 'wechat_not_running', message: '微信没有运行' }, web: { ok: false, ...blocked } })
  assert.deepEqual(result.accounts.map(account => 'error' in account && account.error), [blocked, blocked])
  assert.deepEqual(asked, ['/web/mp/articles'], 'the tracked identity needs no lookup, and the second account does not ask again')
})

test('candidates come from one source and never touch the tracking list', async t => {
  const requests = setup(t, { local: wechat, web: [] })
  assert.deepEqual(await accounts({ query: '测试' }), { ok: true, source: 'local', accounts: [
    { biz, name: '测试号', articles: 2, latestAt: '2026-10-02T08:00:00+08:00' }, { biz: wechat[1].biz, name: '测试号二', articles: 0, latestAt: null }] })
  assert.deepEqual(requests, [])
  assert.deepEqual(await accounts({ source: 'web' }), { ok: true, source: 'web', accounts: [{ biz, name: '测试号' }] })
  assert.deepEqual(requests, ['/web/shelf/sync'], 'without a name only the shelf is listed; nothing is searched')
  await assert.rejects(accounts({ query: '没有这个号', source: 'local' }), (e: any) => e.code === 'account_not_found')
  assert.equal(fs.existsSync(path.join(directory, 'tracked.json')), false)
})
