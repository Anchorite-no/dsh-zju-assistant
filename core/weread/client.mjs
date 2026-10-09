/** WeRead public-account tasks. Transport owns credentials; none leave this API. */
import { createHash } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'

export const ORIGIN = 'https://weread.qq.com'
export const CAPTCHA_APP_ID = '2044038556'
const authCodes = new Set([-2010, -2012])
const object = value => value && typeof value === 'object' && !Array.isArray(value)
export class WereadError extends Error {
  constructor(code, message, details = {}) { super(message); this.code = code; this.details = details }
  publicResult() { return { ok: false, status: this.code, message: this.message, ...this.details.public } }
}
export const bookId = value => {
  const id = String(value ?? '').trim()
  if (/^MP_WXS_\d{6,20}$/.test(id)) return id
  if (/^\d{6,20}$/.test(id)) return `MP_WXS_${id}`
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(id)) {
    const number = Buffer.from(id, 'base64').toString('utf8')
    if (/^\d{6,20}$/.test(number)) return `MP_WXS_${number}`
  }
  return null
}
export const bizOf = id => Buffer.from(id.replace(/^MP_WXS_/, '')).toString('base64')
const stamp = value => Number.isFinite(Number(value)) && Number(value) >= 946684800 && Number(value) < 4102444800 ? new Date(Number(value) * 1000).toISOString() : null
const keyOf = request => createHash('sha256').update(JSON.stringify(request)).digest('hex')
const text = value => typeof value === 'string' ? value : ''
function unescapeHTML(input) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return String(input).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, entity) => {
    if (entity[0] !== '#') return entities[entity.toLowerCase()] ?? all
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
  })
}
export function publicLink(originalId, reviewId = '', id = '') {
  let token = text(originalId).trim()
  if (!token && reviewId.startsWith(`${id}_`)) token = reviewId.slice(id.length + 1)
  token = token.replaceAll('~', '_')
  return /^[A-Za-z0-9_-]{8,120}$/.test(token) ? `https://mp.weixin.qq.com/s/${token}` : null
}
export function parseArticles(payload, id) {
  if (!Array.isArray(payload?.reviews)) throw new WereadError('invalid_response', '微信读书未返回文章列表，不能当成没有新文章。')
  const items = []
  for (const group of payload.reviews) for (const sub of group.subReviews ?? []) {
    const review = sub.review ?? {}, mp = review.mpInfo ?? {}, articleId = review.reviewId ?? sub.reviewId
    if (typeof articleId !== 'string' || !articleId.startsWith(`${id}_`)) continue
    const url = publicLink(mp.originalId, articleId, id)
    if (!url) continue
    items.push({ id: articleId, bookId: id, biz: bizOf(id), title: unescapeHTML(mp.title ?? ''), url,
      publishedAt: stamp(mp.time || review.createTime || group.createTime), summary: unescapeHTML(mp.content || review.content || ''),
      cover: /^https:\/\//.test(mp.pic_url ?? '') ? mp.pic_url : null })
  }
  return { items, groups: payload.reviews.length }
}
export function parseContent(html) {
  if (typeof html !== 'string') throw new WereadError('invalid_content', '微信读书没有返回可识别的文章正文。')
  const source = html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  const opening = /<div\b[^>]*\bid\s*=\s*['"]js_content['"][^>]*>/i.exec(source)
  if (!opening) throw new WereadError('invalid_content', '文章正文尚未加载，未将验证页或错误页当作正文。')
  let depth = 1, end = -1
  const tags = /<\/?div\b[^>]*>/gi; tags.lastIndex = opening.index + opening[0].length
  for (let match; (match = tags.exec(source));) { depth += match[0].startsWith('</') ? -1 : 1; if (!depth) { end = match.index; break } }
  if (end < 0) throw new WereadError('invalid_content', '文章正文不完整，请稍后重试。')
  const content = source.slice(opening.index + opening[0].length, end)
  const images = [...content.matchAll(/<img\b[^>]*(?:data-src|src)\s*=\s*['"]([^'"]+)['"][^>]*>/gi)]
    .map(m => unescapeHTML(m[1])).filter(url => /^https:\/\//i.test(url))
  const plain = unescapeHTML(content.replace(/<br\s*\/?\s*>|<\/(?:p|section|div|h[1-6]|li|blockquote)>/gi, '\n').replace(/<[^>]*>/g, ''))
    .replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!plain) throw new WereadError('invalid_content', '文章正文为空，请在微信读书确认该文章是否可读。')
  return { content: plain.slice(0, 150000), images: [...new Set(images)], truncated: plain.length > 150000 }
}
export function parsePublishers(payload) {
  const found = new Map()
  function visit(value) {
    if (!value || typeof value !== 'object') return
    if (bookId(value.bookId) && String(value.bookId).startsWith('MP_WXS_')) {
      const id = bookId(value.bookId), name = text(value.title || value.name)
      if (name) found.set(id, { bookId: id, biz: bizOf(id), name })
    }
    for (const child of Object.values(value)) if (child && typeof child === 'object') {
      if (Array.isArray(child)) child.forEach(visit); else visit(child)
    }
  }
  visit(payload)
  return [...found.values()]
}

export class WereadClient {
  constructor({ transport, quickLogin = async () => false, delay = ms => new Promise(resolve => setTimeout(resolve, ms)), pageDelayMs = 1500 }) {
    this.transport = transport; this.quickLogin = quickLogin; this.delay = delay; this.pageDelayMs = pageDelayMs
    this.proofs = new Map(); this.index = new Map(); this.operations = new AsyncLocalStorage()
  }
  provideProof(requestKey, proof) {
    if (!/^[a-f0-9]{64}$/.test(requestKey) || typeof proof?.ticket !== 'string' || typeof proof.randstr !== 'string' || !proof.ticket || !proof.randstr || proof.ticket.length > 8192 || proof.randstr.length > 512) throw new WereadError('invalid_verification', '验证码未返回有效结果。')
    this.proofs.set(requestKey, { ticket: proof.ticket, randstr: proof.randstr, expires: Date.now() + 120000 })
  }
  async request(method, path, { query = {}, body, signal, renew = true, html = false } = {}) {
    const request = { method, path, query, ...(body ? { body } : {}) }, requestKey = keyOf(request), headers = {}
    const operation = this.operations.getStore()
    // A completed lookup may now be cached (for example read()'s article index).
    // Skip those completed steps without sending the verified request twice.
    const replayIndex = operation?.replay?.findIndex((step, index) => index >= operation.position && step.key === requestKey) ?? -1
    const replayed = replayIndex >= 0 ? operation.replay[replayIndex] : null
    let response
    try {
      if (replayed) { response = replayed.response; operation.position = replayIndex + 1 }
      else {
        const proof = this.proofs.get(requestKey); this.proofs.delete(requestKey)
        if (proof && proof.expires > Date.now()) { headers['x-wr-ticket'] = proof.ticket; headers['x-wr-randstr'] = proof.randstr }
        response = await this.transport({ ...request, headers, signal })
      }
    }
    catch (error) { if (error instanceof WereadError) throw error; throw new WereadError(signal?.aborted ? 'cancelled' : 'network_error', signal?.aborted ? '任务已停止。' : '微信读书连接失败，已有结果保留。') }
    let payload = response.body
    if (typeof payload === 'string') { try { payload = JSON.parse(payload) } catch {} }
    const code = object(payload) ? Number(payload.errCode ?? payload.errcode ?? 0) : 0
    if (code === -2041) throw new WereadError('verification_required', '微信读书需要完成图片验证，验证后会继续当前任务。', { requestKey, request: { ...request, html }, trace: operation?.trace ?? [], public: { verification: { provider: 'tencent', status: 'required' } } })
    operation?.trace.push({ key: requestKey, response })
    if (response.status === 429 || code === -429) throw new WereadError('rate_limited', '微信读书暂时限制了访问，请稍后再试。', { public: { retryAfterSeconds: Math.min(21600, Math.max(900, Number(response.retryAfter) || 1800)) } })
    if (authCodes.has(code) || response.status === 401) {
      if (renew) {
        const renewed = await this.request('POST', '/web/login/renewal', { body: { rq: encodeURIComponent(path), ql: await this.quickLogin() }, renew: false, signal })
        if (renewed?.succ === 1) return this.request(method, path, { query, body, signal, renew: false, html })
      }
      throw new WereadError('login_required', '微信读书登录已失效，请重新连接。')
    }
    if (code || response.status < 200 || response.status >= 300) throw new WereadError('remote_rejected', '微信读书未完成这次请求。', { public: { remoteCode: code || response.status } })
    if (html) {
      if (typeof payload !== 'string') throw new WereadError('invalid_content', '没有收到文章正文。')
      return payload
    }
    if (!object(payload) && !Array.isArray(payload)) throw new WereadError('invalid_response', '微信读书返回格式异常，未将其当作成功。')
    return payload
  }
  async publishers({ query = '', signal } = {}) {
    const payload = query.trim()
      ? await this.request('GET', '/api/store/search', { query: { keyword: query.trim() }, signal })
      : await this.request('GET', '/web/shelf/sync', { query: { userVid: '', synckey: 0, lectureSynckey: 0 }, signal })
    if (!query.trim() && !Array.isArray(payload.books)) throw new WereadError('invalid_response', '微信读书书架未返回完整账号列表。')
    const needle = query.trim().toLocaleLowerCase().replaceAll(/\s/g, '')
    const accounts = parsePublishers(query.trim() ? payload : payload.books).filter(a => !needle || a.name.toLocaleLowerCase().replaceAll(/\s/g, '').includes(needle))
    return { ok: true, status: 'ready', accounts, scope: query.trim() ? 'search_results' : 'weread_shelf', completeAccountFeed: false }
  }
  async retryVerified(details, proof, signal) {
    if (!details?.request || !details.requestKey) throw new WereadError('verification_expired', '原请求已不可恢复，请重新执行任务。')
    this.provideProof(details.requestKey, proof)
    const request = details.request
    const payload = await this.request(request.method, request.path, { query: request.query, body: request.body, html: request.html, signal })
    return [...(details.trace ?? []), { key: details.requestKey, response: { status: 200, body: payload } }]
  }
  async resolve(account, signal) {
    let id = bookId(account)
    if (!id && /^https:\/\/mp\.weixin\.qq\.com\//.test(String(account))) {
      try { id = bookId(new URL(account).searchParams.get('__biz')) } catch {}
    }
    if (id) return { bookId: id, biz: bizOf(id), name: null }
    if (typeof account !== 'string' || !account.trim() || account.length > 200) throw new WereadError('needs_input', '请给出公众号名称。')
    const shelf = await this.publishers({ signal })
    const exact = shelf.accounts.filter(a => a.name.toLocaleLowerCase() === account.trim().toLocaleLowerCase())
    if (exact.length === 1) return exact[0]
    const result = await this.publishers({ query: account, signal })
    const matched = result.accounts.filter(a => a.name.toLocaleLowerCase() === account.trim().toLocaleLowerCase())
    if (matched.length === 1) return matched[0]
    throw new WereadError(matched.length ? 'ambiguous_account' : 'account_not_found', matched.length ? '公众号名称不唯一，请选择具体账号。' : '未找到可唯一确认的公众号，请先在微信读书添加，或提供公众号数字 ID。', { public: { candidates: result.accounts.slice(0, 10) } })
  }
  async articles({ account, limit = 20, since, signal } = {}) {
    const publisher = await this.resolve(account, signal), id = publisher.bookId
    limit = Math.min(500, Math.max(1, Number(limit) || 20))
    const items = new Map(), signatures = new Set(); let offset = 0, reachedEnd = false, stoppedByDate = false
    if (since && !Number.isFinite(Date.parse(since))) throw new WereadError('needs_input', '起始日期格式不正确。')
    for (let page = 0; page < 30; page++) {
      signal?.throwIfAborted()
      if (page) await this.delay(this.pageDelayMs)
      const parsed = parseArticles(await this.request('GET', '/web/mp/articles', { query: { bookId: id, offset }, signal }), id)
      if (!parsed.groups) { reachedEnd = true; break }
      const signature = parsed.items.map(a => a.id).join('|')
      if (!signature || signatures.has(signature)) throw new WereadError('pagination_incomplete', '文章分页没有继续前进，已停止重复请求。', { public: { partialArticles: [...items.values()] } })
      signatures.add(signature)
      for (const article of parsed.items) {
        this.index.set(article.id, article); this.index.set(article.url, article)
        if (since && article.publishedAt && Date.parse(article.publishedAt) < Date.parse(since)) { stoppedByDate = true; continue }
        items.set(article.id, article)
      }
      offset += parsed.groups
      if (items.size >= limit || stoppedByDate) break
    }
    return { ok: true, status: 'ready', account: publisher, articles: [...items.values()].slice(0, limit), hasMore: !reachedEnd && !stoppedByDate,
      completeAccountFeed: reachedEnd, scope: since ? 'since_date' : 'latest', checkedAt: new Date().toISOString() }
  }
  async read({ account, title, url, signal } = {}) {
    let article = url ? this.index.get(url) : null
    if (!article) {
      const result = await this.articles({ account, limit: 100, signal })
      const matches = result.articles.filter(a => url ? a.url === url : a.title === String(title ?? '').trim())
      if (matches.length !== 1) throw new WereadError(matches.length ? 'ambiguous_article' : 'article_not_found', '没有找到唯一匹配的文章，请核对公众号和标题。', { public: { candidates: matches.slice(0, 10) } })
      article = matches[0]
    }
    const html = await this.request('GET', '/web/mp/content', { query: { reviewId: article.id }, signal, html: true })
    return { ok: true, status: 'ready', article: { ...article, ...parseContent(html) }, contentIsUntrusted: true }
  }
  async subscribe({ account, signal } = {}) {
    const publisher = await this.resolve(account, signal), current = await this.publishers({ signal })
    const existing = current.accounts.find(a => a.bookId === publisher.bookId)
    if (existing) return { ok: true, status: 'already_added', account: existing }
    let uncertain = false
    try {
      const written = await this.request('POST', '/mp/shelf/addToShelf', { body: { bookIds: [publisher.bookId] }, signal })
      if (written.succ !== 1) throw new WereadError('remote_rejected', '微信读书没有确认添加公众号。')
    } catch (error) { if (error.code !== 'network_error') throw error; uncertain = true }
    const checked = await this.publishers({ signal })
    const saved = checked.accounts.find(a => a.bookId === publisher.bookId)
    if (saved) return { ok: true, status: 'added', account: saved }
    throw new WereadError(uncertain ? 'write_unknown' : 'write_not_confirmed', '尚未确认公众号已加入书架，请在微信读书核对；未重复提交。')
  }
  async run(action, input = {}, signal, replay = []) {
    return this.operations.run({ trace: [], replay, position: 0 }, async () => {
      if (action === 'publisher.list') return this.publishers({ signal })
      if (action === 'publisher.search') return this.publishers({ query: input.query ?? '', signal })
      if (action === 'publisher.subscribe') return this.subscribe({ ...input, signal })
      if (action === 'article.list') return this.articles({ ...input, signal })
      if (action === 'article.read') return this.read({ ...input, signal })
      throw new WereadError('unknown_action', '不支持这个微信读书操作。')
    })
  }
}
