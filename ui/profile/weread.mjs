import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const OFF = '微信公众号插件已关闭。'
export async function wereadRPC(action, input = {}, { signal, env = process.env } = {}) {
  const base = env.CAMPUS_WEREAD_BRIDGE_URL, token = env.CAMPUS_WEREAD_BRIDGE_TOKEN
  if (!base || !token || new URL(base).hostname !== '127.0.0.1') return { ok: false, status: 'desktop_required', message: '请在校园智能体桌面应用中连接微信读书。' }
  const response = await fetch(base, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action, input }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000) })
  return response.json()
}

export class WereadFeeds {
  constructor({ file, plugins, rpc = wereadRPC, now = () => Date.now() }) {
    this.file = file; this.plugins = plugins; this.rpc = rpc; this.now = now; this.pending = null; this.busy = null; this.disposed = false
  }
  state() {
    try { return { provider: 'local', accounts: [], articles: [], connection: null, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) } }
    catch { return { provider: 'local', accounts: [], articles: [], connection: null } }
  }
  save(next) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true }); const temporary = `${this.file}.${randomUUID()}.tmp`
    try { fs.writeFileSync(temporary, JSON.stringify(next, null, 2)); fs.renameSync(temporary, this.file) }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary) }
  }
  provider() { return this.state().provider }
  enabled() { return !this.disposed && !this.plugins.disabled().includes('campus.wechat') }
  requireEnabled() { if (!this.enabled()) throw new Error(OFF) }
  snapshot() { return { ...this.state(), pending: this.pending ? { taskId: this.pending.taskId, message: this.pending.message } : null, enabled: this.enabled(), busy: !!this.busy, completeAccountFeed: false } }
  setProvider(input) {
    if (!['local', 'weread'].includes(input?.provider)) throw new Error('无效的采集来源')
    this.save({ ...this.state(), provider: input.provider }); return this.snapshot()
  }
  async exclusive(operation) {
    this.requireEnabled()
    if (this.busy) throw new Error('当前正在处理另一个微信读书任务。')
    this.busy = Promise.resolve().then(operation)
    try { return await this.busy } finally { this.busy = null }
  }
  async call(action, input, continuation) {
    this.requireEnabled()
    const before = this.state()
    const result = await this.rpc(action, { ...input, ...(before.owner ? { _expectedOwner: before.owner } : {}) })
    if (result.ok && result.source?.owner && !before.owner) this.save({ ...this.state(), owner: result.source.owner })
    if (result.status === 'verification_required' && result.taskId) this.pending = { taskId: result.taskId, message: result.message, continuation }
    if (!result.ok) this.save({ ...this.state(), error: result.message ?? '微信读书任务未完成。' })
    else this.save({ ...this.state(), error: null })
    return result
  }
  async connect() { return this.call('account.connect', {}) }
  async check() {
    return this.exclusive(async () => {
      const finish = result => {
        const before = this.state(), owner = result.owner
        if (before.owner && owner && before.owner !== owner) { this.save({ ...before, connection: { status: 'account_changed', message: '微信读书账号与原绑定不同。' } }); return { ok: false, status: 'account_changed', message: '账号已变化，旧账号文章没有合并。' } }
        this.save({ ...before, ...(owner ? { owner } : {}), connection: result }); return { ...result, snapshot: this.snapshot() }
      }
      const result = await this.call('account.status', {}, finish)
      if (!result.ok) this.save({ ...this.state(), connection: { status: result.status, connected: false, message: result.message } })
      return result.ok ? finish(result) : result
    })
  }
  async discover(input = {}) {
    return this.exclusive(async () => this.call(input.query?.trim() ? 'publisher.search' : 'publisher.list', input.query?.trim() ? { query: input.query.trim() } : {}, result => result))
  }
  cacheArticles(result) {
    if (!result.ok || !result.account || !Array.isArray(result.articles)) return result
    const state = this.state(), bookId = result.account.bookId, at = new Date(this.now()).toISOString(), items = new Map(state.articles.map(a => [a.id, a]))
    let added = 0
    for (const article of result.articles) { if (!items.has(article.id)) added++; items.set(article.id, { ...article, firstSeenAt: items.get(article.id)?.firstSeenAt ?? at, lastSeenAt: at }) }
    const accounts = state.accounts.map(a => a.bookId === bookId ? { ...a, status: 'ready', lastSuccessfulSyncAt: at, nextDueAt: new Date(this.now() + 3600000).toISOString(), articleCount: [...items.values()].filter(i => i.bookId === bookId).length, newlyDiscoveredCount: a.lastSuccessfulSyncAt ? added : 0 } : a)
    this.save({ ...state, accounts, articles: [...items.values()].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')), error: null })
    return { ...result, snapshot: this.snapshot() }
  }
  async add(input) {
    if (typeof input?.account !== 'string' || !input.account.trim()) throw new Error('请选择公众号')
    return this.exclusive(async () => {
      const finish = async result => {
        const account = result.account
        if (!account) return result
        const state = this.state()
        if (!state.accounts.some(a => a.bookId === account.bookId)) this.save({ ...state, accounts: [...state.accounts, { ...account, enabled: true, status: 'pending', articleCount: 0, lastSuccessfulSyncAt: null }] })
        const listed = await this.call('article.list', { account: account.bookId, limit: 50 }, r => this.cacheArticles(r))
        return listed.ok ? this.cacheArticles(listed) : listed
      }
      const result = await this.call('publisher.subscribe', { account: input.account }, finish)
      return result.ok ? finish(result) : result
    })
  }
  set(input) {
    this.requireEnabled(); const state = this.state(), target = state.accounts.find(a => a.bookId === input?.bookId)
    if (!target || typeof input.enabled !== 'boolean') throw new Error('无效的公众号开关')
    target.enabled = input.enabled; this.save(state); return this.snapshot()
  }
  async refresh(input = {}) {
    return this.exclusive(async () => {
      const accounts = this.state().accounts.filter(a => a.enabled && (!input.bookId || a.bookId === input.bookId) && (!input.due || !a.nextDueAt || Date.parse(a.nextDueAt) <= this.now()))
      for (const account of accounts) {
        const result = await this.call('article.list', { account: account.bookId, limit: 50 }, r => this.cacheArticles(r))
        if (!result.ok) {
          const state = this.state(); state.accounts = state.accounts.map(a => a.bookId === account.bookId ? { ...a, status: result.status, nextDueAt: new Date(this.now() + (result.retryAfterSeconds ?? 1800) * 1000).toISOString() } : a); this.save(state)
          return result
        }
        this.cacheArticles(result)
      }
      return { ok: true, status: 'ready', snapshot: this.snapshot() }
    })
  }
  articles(input = {}) {
    this.requireEnabled(); const state = this.state()
    const match = input.account ? state.accounts.filter(a => a.name === input.account || a.bookId === input.account) : state.accounts
    if (input.account && match.length !== 1) throw new Error('未找到唯一的已添加公众号')
    const allowed = new Set(match.map(a => a.bookId)), limit = Math.max(1, Math.min(200, Number(input.limit) || 50))
    return { ok: true, articles: state.articles.filter(a => allowed.has(a.bookId)).slice(0, limit), accounts: match, completeAccountFeed: false }
  }
  async read(input) { return this.exclusive(() => this.call('article.read', input, result => result)) }
  async verification(action, input = {}) {
    this.requireEnabled()
    const task = input.task ?? this.pending?.taskId
    if (!task) return { ok: false, status: 'no_verification', message: '当前没有待处理的验证。' }
    const result = await this.rpc(`verification.${action}`, { ...input, task })
    if (result.state === 'failed' || result.state === 'cancelled' || result.status === 'verification_expired') { this.pending = null; this.save({ ...this.state(), error: result.message ?? '验证未完成，请重新执行原任务。' }) }
    if (result.state === 'complete' && result.result?.ok && this.pending?.taskId === task) {
      const continuation = this.pending.continuation; this.pending = null
      return continuation ? await continuation(result.result) : result.result
    }
    return result
  }
  async recognizer(action, input = {}) { this.requireEnabled(); return this.rpc(`recognizer.${action}`, input) }
  async tick() {
    if (!this.enabled() || this.provider() !== 'weread' || this.busy || this.pending || !this.state().accounts.some(a => a.enabled)) return
    try { await this.refresh({ due: true }) } catch {}
  }
  start() { this.timer = setInterval(() => { void this.tick() }, 60000); this.timer.unref?.(); return () => this.dispose() }
  changed() { if (!this.enabled()) { this.pending = null; void this.rpc('operation.cancel').catch(() => {}) } }
  dispose() { this.disposed = true; clearInterval(this.timer); void this.rpc('operation.cancel').catch(() => {}) }
}
