/**
 * 校园事务页右边的通知：学校各部门和本人学院新发的通知，加上已添加公众号的新文章，合成一条按时间排的列表。
 * 学校通知用 ZJU Core 的 `notice new` 读（只给上次之后新出现的），读到的攒在这里的缓存里；
 * 页面打开时先拿缓存，再让这里去读新的，这次没读到时原来的留着，只记下原因。
 * 公众号文章由公众号插件自己半小时检查一遍（wechat.mjs），这里只取它已经存下的；用户点刷新时催它马上再看一遍。
 * 条数多了以后，和这位学生关系不大的由 notice-filter.mjs 标出来（屏蔽词，加上模型照个人档案的判断），页面默认收起。
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { CAMPUS_PLUGINS, accountReady } from './catalog.mjs'
import { runCore } from './core.mjs'

/** 读成功以后，这么久之内再进页面不重新读；页面上点刷新不受限制。 */
const FRESH_MS = 10 * 60_000
/** 读失败以后隔一阵再自动重试：密码填错时每进一次页面就登录一次，账号可能被锁。 */
const RETRY_MS = 5 * 60_000
const DAY_MS = 86_400_000
/** 学校通知留多久、最多留多少条。 */
const KEEP_DAYS = 45, KEEP = 300
/** `notice new` 一次最多给 100 条，还有剩的接着读，最多读这么多次。 */
const ROUNDS = 4
/** 公众号文章取最近这么多篇。 */
const ARTICLES = 100
/**
 * 应用自己记一份「看到哪了」，和助手在对话里用 `notice new` 的那份分开：
 * 这里读走的，助手再问「有没有新通知」时还能读到。
 */
const READER = { ZJU_NOTICE_READER: 'app' }

const NOTICES = { id: 'school', name: '学校通知', plugin: 'campus.notices' }
const ARTICLE_SOURCE = { id: 'wechat', name: '公众号', plugin: 'campus.wechat' }
/** 公众号有的号要用户去插件页处理一下才能接着读时，这一栏下面怎么说。 */
const ATTENTION = { verification_required: '微信读书要先验证一次，有的公众号这次没读到', login_required: '微信读书的登录过期了，有的公众号这次没读到' }
const text = value => typeof value === 'string' ? value.trim() : ''
/** 账号在插件页的哪一项里填。 */
const accountPlugin = id => CAMPUS_PLUGINS.find(plugin => plugin.accounts.includes(id))?.id ?? ''
/** 学校通知只有日期；按北京时间那天的零点算，和带时刻的公众号文章排在一起。 */
const dayStart = date => `${date}T00:00:00+08:00`
const byTime = (a, b) => Date.parse(b.at) - Date.parse(a.at) || a.title.localeCompare(b.title, 'zh')

/** `notice new` 的结果里的一条。source 是「来源·栏目」，页面上只写来源。 */
export function fromNotice(entry, foundAt) {
  const title = text(entry?.title), url = text(entry?.url), date = /^\d{4}-\d{2}-\d{2}/.exec(text(entry?.date))?.[0]
  if (!title || !url || !date) return undefined
  return { id: `school:${url}`, kind: 'school', title, from: text(entry.source).split('·')[0] || '学校', at: dayStart(date), dated: false, url, foundAt }
}

export class Feed {
  /**
   * file 是缓存文件；account 和 plugins 是账号和插件开关；articles 取公众号插件已经存下的文章
   * （返回 { articles, attention }，每篇带着是哪个号发的 from；关着时抛错）；refreshArticles 让它马上再检查一遍，做完才返回；
   * filter 标出哪些该收起（hidden）、把没问过的交给模型（judge），不给就不筛；run 跑一条 ZJU Core 命令并返回结果里的 data。
   */
  constructor({ file, account, plugins, articles, refreshArticles, filter, run = runCore, now = () => Date.now() }) {
    this.file = file
    this.account = account
    this.plugins = plugins
    this.articles = articles
    this.refreshArticles = refreshArticles
    this.filter = filter
    this.run = run
    this.now = now
    this.running = undefined
    this.cache = undefined
  }

  /** 缓存：学校通知攒下的条目，和最近一次读的情况。 */
  load() {
    if (this.cache) return this.cache
    let saved
    try { saved = JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch { /* 没有缓存或读不了，都当作没有 */ }
    this.cache = { items: Array.isArray(saved?.items) ? saved.items : [], fetchedAt: saved?.fetchedAt ?? null, triedAt: saved?.triedAt ?? null, error: saved?.error ?? null }
    return this.cache
  }

  write(cache) {
    this.cache = cache
    const temp = `${this.file}.${randomUUID()}.tmp`
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    try { fs.writeFileSync(temp, JSON.stringify(cache, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(temp, this.file) }
    finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
  }

  /** 学校通知现在能不能读：off 是插件关了，account 是统一身份认证或校内网站的访问方式还没填好。 */
  status() {
    if (this.plugins.disabled().includes(NOTICES.plugin)) return { state: 'off', plugin: NOTICES.plugin }
    const accounts = this.account.read().data
    for (const id of ['zju', 'webvpn']) if (!accountReady(accounts, id)) return { state: 'account', plugin: accountPlugin(id) }
    return { state: 'ready', plugin: NOTICES.plugin }
  }

  /** 公众号插件已经存下的文章；插件关着或还读不了时是空的。error 是有的号要用户去插件页处理时的那句话。 */
  async wechat() {
    if (this.plugins.disabled().includes(ARTICLE_SOURCE.plugin)) return { state: 'off', items: [], error: null }
    try {
      const { articles = [], attention = '' } = await this.articles({ limit: ARTICLES })
      const items = articles.flatMap((article) => {
        const title = text(article.title), url = text(article.url), at = text(article.publishedAt)
        if (!title || !url || !Number.isFinite(Date.parse(at))) return []
        return [{ id: `wechat:${article.id}`, kind: 'wechat', title, from: text(article.from) || '公众号', at: new Date(at).toISOString(), dated: true, url, foundAt: text(article.foundAt) || null }]
      })
      return { state: 'ready', items, error: ATTENTION[attention] ?? null }
    } catch { return { state: 'ready', items: [], error: null } }
  }

  /**
   * 页面要的全部内容，只看已经存下的，不联网：items 按时间从新到旧，每条的 hidden 说它该不该收起
   * （'blocked' 标题里有屏蔽词，'irrelevant' 模型判断和这位学生关系不大，null 不收起）；
   * sources 是两个来源各自的情况：state、最近一次读成功的时间 fetchedAt、最近一次没读到的原因 error。
   */
  async snapshot() {
    const status = this.status(), cache = this.load(), wechat = await this.wechat()
    const school = status.state === 'ready' ? cache.items : []
    const items = [...school, ...wechat.items].sort(byTime), hidden = this.filter?.hidden(items)
    return {
      items: items.map(item => ({ ...item, hidden: hidden?.get(item.id) ?? null })),
      sources: [
        { ...NOTICES, state: status.state, plugin: status.plugin, fetchedAt: status.state === 'ready' ? cache.fetchedAt : null, error: status.state === 'ready' ? cache.error : null },
        { ...ARTICLE_SOURCE, state: wechat.state, fetchedAt: null, error: wechat.error },
      ],
    }
  }

  /**
   * 去读学校新发的通知，读完返回最新的全部内容。刚读过就不再读（force 为真时照读）；同一时间只读一次。
   * 公众号平时不在这里催，它有自己的定时；用户点的刷新（force）连它一起再看一遍，学校通知读不了时也照样看。
   */
  async refresh({ force = false } = {}) {
    const articles = force && this.refreshArticles && !this.plugins.disabled().includes(ARTICLE_SOURCE.plugin) ? this.refreshArticles().catch(() => {}) : undefined
    if (this.status().state === 'ready') {
      if (!this.running) {
        const { triedAt, error } = this.load()
        if (force || !triedAt || this.now() - Date.parse(triedAt) >= (error ? RETRY_MS : FRESH_MS)) this.running = this.fetch().finally(() => { this.running = undefined })
      }
      await this.running
    }
    await articles
    // 还没问过模型的（刚读到的、公众号定时检查攒下的）问一遍，问完再给页面；问不成就照原样给。
    if (this.filter) await this.filter.judge((await this.snapshot()).items)
    return this.snapshot()
  }

  async fetch() {
    const triedAt = new Date(this.now()).toISOString(), found = []
    let error = null
    try {
      for (let round = 0; round < ROUNDS; round++) {
        const data = await this.run(['notice', 'new'], { system: '校园通知', timeoutMs: 180_000, env: READER })
        if (!Array.isArray(data?.notices)) throw new Error('校园通知给的格式不对。')
        found.push(...data.notices.flatMap(entry => fromNotice(entry, triedAt) ?? []))
        if (!data.remaining) break
      }
    } catch (reason) { error = reason instanceof Error ? reason.message : String(reason) }
    // 读到一半出错时，已经读到的照样留下：core 那边已经把它们记成看过了，丢掉就再也读不回来。
    const cache = this.load(), horizon = this.now() - KEEP_DAYS * DAY_MS, merged = new Map(cache.items.map(item => [item.id, item]))
    for (const item of found) if (!merged.has(item.id)) merged.set(item.id, item)
    const items = [...merged.values()].filter(item => Date.parse(item.at) >= horizon).sort(byTime).slice(0, KEEP)
    this.write({ items, fetchedAt: error ? cache.fetchedAt : triedAt, triedAt, error })
  }
}
