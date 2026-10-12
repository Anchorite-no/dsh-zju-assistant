import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { dataDir, SkillError } from './config.ts'
import { localAccounts } from './local.ts'
import { bookIdOf, webAccounts, webArticles } from './web.ts'
import { articleLink, fetchArticle, parseDocument, type Document } from './article.ts'

/** Local/Web 只负责查找公众号及文章链接，正文统一由 article.ts 获取。 */
export type Source = 'local' | 'web'
/** 两个来源的 url 都可以直接交给统一的 read/download。 */
export interface Article { id: string; title: string; url: string; publishedAt: string | null; originalUrl?: string; summary?: string }
export interface Account { biz: string; name: string; articles: Article[] }
export interface Options { source?: string; account?: string; title?: string; url?: string; limit?: number; cancel?: boolean; query?: string; check?: boolean }

/** 按名称取唯一的一项：完全相同优先，否则按包含匹配。 */
function pick<T>(kind: 'account' | 'article', items: T[], text: string, name: (item: T) => string): T {
  const exact = items.filter(item => name(item) === text)
  const found = exact.length ? exact : items.filter(item => name(item).includes(text))
  if (found.length === 1) return found[0]
  const label = kind === 'account' ? '公众号' : '文章'
  throw found.length
    ? new SkillError(kind + '_ambiguous', `有 ${found.length} 个${label}匹配「${text}」，请写完整名称。`, { candidates: found.slice(0, 20).map(name) })
    : new SkillError(kind + '_not_found', `没有找到${label}「${text}」。`)
}

/** 用哪些来源、按什么顺序：指定了就只用那一个，否则先 local 后 web。 */
function sourceOrder(source = process.env.WEREAD_SOURCE): Source[] {
  if (source && source !== 'local' && source !== 'web') throw new SkillError('invalid_source', 'source 应为 local 或 web。')
  return source ? [source as Source] : ['local', 'web']
}

/** 依次尝试来源。前一个来源拿不到才换下一个，名称有歧义时不换。 */
async function fromSources<T>(source: string | undefined, run: (source: Source) => Promise<T>): Promise<T> {
  const order = sourceOrder(source)
  const skipped: string[] = []
  for (const current of order) {
    try { return await run(current) }
    catch (error: any) {
      if (!(error instanceof SkillError) || error.code.endsWith('_ambiguous')) throw error
      if (current !== order.at(-1)) { skipped.push(`${current}：${error.message}`); continue }
      throw skipped.length ? new SkillError(error.code, `${error.message}（${skipped.join('；')}）`, error.details) : error
    }
  }
  throw new Error('unreachable')
}

/** 从一个来源取某公众号最近的文章。给了 biz（已跟踪的公众号）就不再按名称查找。 */
async function accountFrom(source: Source, target: { name: string; biz?: string }, limit: number, stop?: (article: Article) => boolean): Promise<Account> {
  if (source === 'local') {
    const accounts = await localAccounts()
    const found = target.biz ? accounts.find(account => account.biz === target.biz) : pick('account', accounts, target.name, account => account.name)
    if (!found) throw new SkillError('account_not_found', `本机微信里没有公众号「${target.name}」的消息。`)
    return { ...found, articles: found.articles.slice(0, limit) }
  }
  const account = target.biz ? { biz: target.biz, name: target.name } : pick('account', await webAccounts(target.name), target.name, account => account.name)
  return { ...account, articles: await webArticles(bookIdOf(account.biz), limit, stop) }
}

export function list(options: Options) {
  return fromSources(options.source, async source => {
    const { articles, ...account } = await accountFrom(source, { name: options.account! }, options.limit ?? 20)
    return { ok: true, source, account, articles }
  })
}

/** 只说明这一个公众号读不到的错误；别的错误说明整个来源这次用不了。 */
const ACCOUNT_ONLY = ['account_not_found', 'remote_rejected', 'invalid_response']
type Failure = { status: string; message: string }

/**
 * 跟踪名单里每个号最近的文章，只看不记：new 的已读记录不动，所以宿主应用可以拿它定时刷新自己的列表。
 * 一个号读不到不影响别的号。一个来源整体用不了（微信没开、没登录、要验证、被限频）时记在 sources 里，这次不再向它逐个重试。
 */
export async function listTracked(options: Options) {
  const order = sourceOrder(options.source), limit = options.limit ?? 20
  const sources: Partial<Record<Source, { ok: true } | { ok: false } & Failure>> = {}
  const accounts: ({ biz: string; name: string } & ({ source: Source; articles: Article[] } | { error: Failure }))[] = []
  let asked = 0
  for (const [biz, { name }] of Object.entries(loadTracked())) {
    let found: { source: Source; articles: Article[] } | undefined, error: Failure = { status: 'account_not_found', message: `没有找到公众号「${name}」。` }
    for (const source of order) {
      const state = sources[source]
      if (state?.ok === false) { error = { status: state.status, message: state.message }; continue }
      try {
        if (source === 'web' && asked++) await pause(1500)   // 号与号之间也留间隔，避免触发限频
        found = { source, articles: (await accountFrom(source, { biz, name }, limit)).articles }
        sources[source] = { ok: true }
        break
      } catch (reason: any) {
        if (!(reason instanceof SkillError)) throw reason
        error = { status: reason.code, message: reason.message }
        if (!ACCOUNT_ONLY.includes(reason.code)) sources[source] = { ok: false, ...error }
      }
    }
    accounts.push(found ? { biz, name, ...found } : { biz, name, error })
  }
  return { ok: true, sources, accounts }
}

/** 按名称找公众号的候选，不改动任何记录；不给名称时列出这个来源里现有的全部公众号。 */
export function accounts(options: Options) {
  const query = options.query?.trim() ?? ''
  return fromSources(options.source, async source => {
    // 本机来源顺带给出每个号在本机有几篇、最新一篇是什么时候，由新到旧。
    const found = source === 'web' ? await webAccounts(query) : (await localAccounts())
      .filter(account => account.name && account.name.includes(query))
      .map(({ biz, name, articles }) => ({ biz, name, articles: articles.length, latestAt: articles[0]?.publishedAt ?? null }))
      .sort((a, b) => (b.latestAt ?? '').localeCompare(a.latestAt ?? ''))
    if (!found.length) throw new SkillError('account_not_found', query ? `没有找到名称里带「${query}」的公众号。` : '这个来源里还没有公众号。')
    return { ok: true, source, accounts: found.slice(0, 100) }
  })
}

async function readLink(url: string, known?: Article): Promise<Document> {
  const link = articleLink(url)
  return parseDocument(await fetchArticle(link.url), known?.originalUrl ?? link.url, known)
}

/** 取一篇文章并转成 Markdown：给链接就直接取；给公众号和标题就先在来源里找到这篇文章。 */
export async function read(options: Options): Promise<Document> {
  const { url, account, title } = options
  if (url ? account || title : !account || !title) throw new SkillError('invalid_input', '请提供 --url，或者同时提供 --account 和 --title（二选一）。')
  if (url) return readLink(url)
  const matches = (article: Article) => article.title.includes(title!)
  const article = await fromSources(options.source, async source => {
    const { articles } = await accountFrom(source, { name: account! }, 100, matches)
    return pick('article', articles, title!, article => article.title)
  })
  return readLink(article.url, article)
}

// 跟踪名单：每个公众号在每个来源下见过的文章。两个来源的文章标识不同，所以分开记。
type Tracked = Record<string, { name: string; seen: Partial<Record<Source, string[]>> }>
const trackedFile = () => path.join(dataDir, 'tracked.json')
const loadTracked = (): Tracked => fs.existsSync(trackedFile()) ? JSON.parse(fs.readFileSync(trackedFile(), 'utf8')) : {}
function saveTracked(tracked: Tracked) {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(trackedFile(), JSON.stringify(tracked, null, 2))
}

/** 带公众号时开始跟踪（现有文章记为已读），再带 cancel 则停止跟踪；返回当前的跟踪名单。 */
export async function track(options: Options) {
  const tracked = loadTracked()
  let message: string | undefined
  if (options.account && options.cancel) {
    const [biz, { name }] = pick('account', Object.entries(tracked), options.account, ([, entry]) => entry.name)
    delete tracked[biz]
    message = `已停止跟踪「${name}」。`
  } else if (options.account) {
    message = await fromSources(options.source, async source => {
      const { biz, name, articles } = await accountFrom(source, { name: options.account! }, 50)
      tracked[biz] = { name, seen: { ...tracked[biz]?.seen, [source]: articles.map(article => article.id) } }
      return `开始跟踪「${name}」（${source}），现有的 ${articles.length} 篇记为已读；之后用 new 查看新文章。`
    })
  }
  if (message) saveTracked(tracked)
  return { ok: true, message, tracked: Object.entries(tracked).map(([biz, entry]) => ({ biz, name: entry.name })) }
}

/** 跟踪的公众号里上次检查之后新出现的文章。全部检查成功才记为已读，中途失败下次会重新返回。 */
export async function newArticles(options: Options) {
  const tracked = loadTracked()
  const targets = options.account ? [pick('account', Object.entries(tracked), options.account, ([, entry]) => entry.name)] : Object.entries(tracked)
  if (!targets.length) throw new SkillError('nothing_tracked', '还没有跟踪任何公众号，先执行 track --account 名称。')
  const articles: (Article & { account: string; source: Source })[] = []
  for (const [biz, entry] of targets) {
    const { source, latest } = await fromSources(options.source, async source => ({ source, latest: (await accountFrom(source, { biz, name: entry.name }, 50)).articles }))
    // 第一次经由这个来源检查时没有基线，只记录不报新。
    const seen = entry.seen[source]
    if (seen) articles.push(...latest.filter(article => !seen.includes(article.id)).map(article => ({ account: entry.name, source, ...article })))
    entry.seen[source] = [...new Set([...latest.map(article => article.id), ...seen ?? []])]
  }
  saveTracked(tracked)
  return { ok: true, articles }
}
