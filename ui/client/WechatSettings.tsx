/** 微信公众号详情，复用插件页的分组、列表、表单与控件。 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, IconPlusOutlineRegular, Modal, Switch, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import { errorText, profileApi } from './api.ts'
import { Alert, Field, Select } from './controls.tsx'
import { Choice } from './controls.tsx'
import { WereadSettings } from './WereadSettings.tsx'

interface Account { biz: string, name: string, enabled: boolean, status: string, articleCount: number, lastSuccessfulSyncAt: string | null, message?: string | null }
interface Snapshot {
  enabled: boolean, accounts: Account[], busy: boolean, error: string | null
  connection: { running: boolean, version: string | null, message: string } | null
  runtime: { lastObserved: { source: { wechatVersion: string }, lastAttemptVerified: boolean } | null } | null
}
interface Found { biz: string, name: string, articleCount: number }
interface Article { id: string, biz: string, title: string, url: string, publishedAt: string | null }
const STATUS: Record<string, string> = {
  pending: '等待首次导入', synced_local_cache: '本地读取成功', waiting_for_local_messages: '等待微信同步图文', wechat_not_running: '等待微信运行',
  partial_local_read: '读取不完整', wechat_session_or_version_unavailable: '需要检查微信状态', snapshot_verification_failed: '数据校验失败', wechat_account_changed: '微信账号已变化', paused: '已暂停',
}
const time = (value: string | null | undefined) => value ? new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

function LocalWechatSettings({ enabled }: { enabled: boolean }) {
  const [data, setData] = useState<Snapshot | null>(null)
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [adding, setAdding] = useState(false), [found, setFound] = useState<Found[] | null>(null), [query, setQuery] = useState('')
  const [withLink, setWithLink] = useState(false), [articleUrl, setArticleUrl] = useState('')
  const [selected, setSelected] = useState('all'), [articles, setArticles] = useState<Article[]>([])
  const [articlesLoading, setArticlesLoading] = useState(false), [articleError, setArticleError] = useState(''), [revision, setRevision] = useState(0)
  const operation = useRef(false), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const load = useCallback(async () => {
    try { const next = await profileApi<Snapshot>('wechat-read'); if (alive.current) setData(next) }
    catch (reason) { if (alive.current) setError(errorText(reason)) }
  }, [])
  useEffect(() => { void load(); const timer = setInterval(() => { void load() }, 15_000); return () => { clearInterval(timer) } }, [enabled, load])
  useEffect(() => { if (!enabled) { setAdding(false); setError(''); setArticles([]) } }, [enabled])
  const latest = data?.accounts.map(a => `${a.biz}:${a.lastSuccessfulSyncAt}:${a.articleCount}`).join('|') ?? ''
  useEffect(() => {
    let active = true
    if (!enabled || !data?.accounts.length) { setArticles([]); return }
    setArticlesLoading(true); setArticleError('')
    profileApi<{ articles: Article[] }>('wechat-articles', { ...(selected === 'all' ? {} : { biz: selected }), limit: 50 })
      .then(value => { if (active) setArticles(value.articles) })
      .catch(reason => { if (active) setArticleError(errorText(reason)) })
      .finally(() => { if (active) setArticlesLoading(false) })
    return () => { active = false }
  }, [enabled, selected, latest, revision])
  async function run(label: string, action: () => Promise<void>) {
    if (operation.current) return
    operation.current = true; setBusy(label); setError('')
    try { await action() } catch (reason) { if (alive.current) setError(errorText(reason)) }
    finally { operation.current = false; if (alive.current) setBusy('') }
  }
  const apply = (next: Snapshot) => { if (alive.current) { setData(next); setRevision(n => n + 1) } }
  const discover = () => run('discover', async () => {
    const result = await profileApi<{ accounts: Found[] }>('wechat-discover')
    if (alive.current) setFound(result.accounts)
    await load()
  })
  const openAdd = () => { setAdding(true); setQuery(''); setWithLink(false); setError(''); if (!found) void discover() }
  const add = (input: { biz: string, name: string } | { articleUrl: string }) => run('add', async () => {
    apply(await profileApi<Snapshot>('wechat-add', input))
    if (alive.current) { setNotice('已添加公众号'); setArticleUrl('') }
  })
  const registered = new Set(data?.accounts.map(a => a.biz) ?? [])
  const matches = found?.filter(a => a.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? []
  const observed = data?.runtime?.lastObserved, version = data?.connection?.version ?? observed?.source.wechatVersion
  const connectionText = !enabled ? '插件已关闭' : data?.connection?.message ?? (observed?.lastAttemptVerified ? '本地读取已验证' : '等待检查微信')
  const blocked = !enabled || !!busy || !!data?.busy, problem = error || data?.error
  return <>
    <section className="campus-section" aria-labelledby="wechat-connection">
      <div className="campus-section-head"><h2 id="wechat-connection" className="campus-section-title">电脑版微信</h2>
        <Button size="sm" variant="outline" disabled={blocked} onClick={() => { void run('check', async () => { apply(await profileApi<Snapshot>('wechat-check')) }) }}>{busy === 'check' ? '检查中…' : '检查连接'}</Button></div>
      <div className="campus-wechat-status" role="status"><span>{connectionText}</span>{version && <span>Windows 微信 {version}</span>}</div>
      <p className="campus-note">保持微信登录并在后台运行。仅同步本机已收到的公众号推文。</p>
      {enabled && problem && !adding && <Alert>{problem}</Alert>}
    </section>
    <section className="campus-section" aria-labelledby="wechat-accounts">
      <div className="campus-section-head campus-wechat-heading">
        <div className="campus-group-head"><h2 id="wechat-accounts" className="campus-section-title">已添加的公众号</h2><span className="campus-count">{data?.accounts.length ?? 0}</span></div>
        <div className="campus-wechat-actions">
          <Button size="sm" variant="outline" disabled={blocked || !data?.accounts.some(a => a.enabled)} onClick={() => { void run('refresh', async () => { apply(await profileApi<Snapshot>('wechat-refresh')) }) }}>{busy === 'refresh' ? '更新中…' : '立即更新'}</Button>
          <Button size="sm" variant="outline" icon={<IconPlusOutlineRegular size={14} />} disabled={blocked} onClick={openAdd}>添加公众号</Button>
        </div>
      </div>
      {!data ? <p className="campus-note">正在读取订阅…</p> : !data.accounts.length ? <div className="campus-empty"><p>还没有添加公众号。从微信已同步的列表中选择即可。</p></div> :
        <ul className="campus-rows">{data.accounts.map(account => <li key={account.biz} className="campus-row">
          <div className="campus-wechat-main"><button type="button" className="campus-wechat-name" disabled={!enabled} onClick={() => { setSelected(account.biz) }}>{account.name}</button>
            <span className="campus-wechat-meta">{account.articleCount} 篇 · {STATUS[account.status] ?? account.message ?? '暂时无法读取'}{account.lastSuccessfulSyncAt ? ` · ${time(account.lastSuccessfulSyncAt)} 检查` : ''}</span></div>
          <Switch label={`同步${account.name}`} checked={account.enabled} disabled={blocked} onChange={value => { void run(account.biz, async () => { apply(await profileApi<Snapshot>('wechat-set', { biz: account.biz, enabled: value })) }) }} />
        </li>)}</ul>}
      {!!data?.accounts.length && <p className="campus-note">应用运行时自动检查；暂停公众号后保留已保存的文章。</p>}
    </section>
    {enabled && !!data?.accounts.length && <section className="campus-section" aria-labelledby="wechat-articles">
      <div className="campus-section-head campus-wechat-heading"><h2 id="wechat-articles" className="campus-section-title">最近文章</h2>
        <div className="campus-wechat-filter"><Select label="筛选公众号" value={selected} onChange={setSelected} options={[{ value: 'all', label: '全部公众号' }, ...data.accounts.map(a => ({ value: a.biz, label: a.name }))]} /></div></div>
      {articleError && <Alert>{articleError}</Alert>}
      {articlesLoading && !articles.length ? <p className="campus-note">正在读取文章…</p> : !articles.length ? <p className="campus-note">本机还没有该公众号的图文记录。</p> :
        <ul className="campus-rows">{articles.map(article => <li key={article.id} className="campus-row campus-wechat-article">
          <div className="campus-wechat-main"><a className="campus-wechat-name" href={article.url} target="_blank" rel="noreferrer">{article.title || '未命名文章'}</a><span className="campus-wechat-meta">{data.accounts.find(a => a.biz === article.biz)?.name}</span></div>
          <time dateTime={article.publishedAt ?? undefined}>{time(article.publishedAt) || '发布时间未知'}</time>
        </li>)}</ul>}
    </section>}
    <Modal open={adding} title="添加公众号" closeLabel="关闭" onClose={() => { setAdding(false) }} footer={<Button variant="outline" onClick={() => { setAdding(false) }}>完成</Button>}>
      <div className="campus-section">
        <Field id="wechat-account-query" label="搜索本机公众号" aside={<button type="button" className="campus-textlink" disabled={!!busy} onClick={() => { void discover() }}>重新读取</button>}>
          <input id="wechat-account-query" data-modal-autofocus className="campus-input" placeholder="公众号名称" value={query} onChange={event => { setQuery(event.target.value) }} /></Field>
        {problem && <Alert>{problem}</Alert>}
        {busy === 'discover' ? <p className="campus-note" role="status">正在读取微信里的公众号…</p> : <div className="campus-wechat-picker"><ul className="campus-rows">
          {matches.map(account => <li key={account.biz} className="campus-row"><div className="campus-wechat-main"><span className="campus-row-title">{account.name}</span><span className="campus-wechat-meta">本机 {account.articleCount} 篇</span></div>
            <Button size="sm" variant="outline" aria-label={registered.has(account.biz) ? `已添加${account.name}` : `添加${account.name}`} disabled={!!busy || registered.has(account.biz)} onClick={() => { void add({ biz: account.biz, name: account.name }) }}>{registered.has(account.biz) ? '已添加' : '添加'}</Button></li>)}
        </ul>{found && !matches.length && <p className="campus-note">本机列表中没有匹配的公众号。可以先在微信中同步其推送。</p>}</div>}
        <button type="button" className="campus-textlink" aria-expanded={withLink} onClick={() => { setWithLink(value => !value) }}>通过文章链接添加</button>
        {withLink && <form onSubmit={event => { event.preventDefault(); void add({ articleUrl }) }}><Field id="wechat-article-url" label="微信公众号文章链接">
          <input id="wechat-article-url" className="campus-input" type="url" placeholder="https://mp.weixin.qq.com/s/…" value={articleUrl} onChange={event => { setArticleUrl(event.target.value) }} /></Field>
          <Button type="submit" size="sm" variant="outline" disabled={!!busy || !articleUrl.trim()}>添加</Button></form>}
      </div>
    </Modal>
    {notice && <Toast text={notice} onDone={() => { setNotice('') }} />}
  </>
}

export function WechatSettings({ enabled }: { enabled: boolean }) {
  const [provider,setProvider]=useState<'local'|'weread'|null>(null), [error,setError]=useState(''), [saving,setSaving]=useState(false)
  useEffect(()=>{profileApi<{provider:'local'|'weread'}>('weread-state').then(value=>setProvider(value.provider)).catch(reason=>setError(errorText(reason)))},[])
  return <><Field label="采集来源"><Choice label="公众号采集来源" value={provider??''} disabled={!enabled||saving||!provider} options={[{value:'weread',label:'微信读书'},{value:'local',label:'本地微信'}]} onChange={value=>{if(!value)return;setSaving(true);profileApi<{provider:'local'|'weread'}>('weread-provider',{provider:value}).then(next=>{setProvider(next.provider);setError('')}).catch(reason=>setError(errorText(reason))).finally(()=>setSaving(false))}} /></Field>
    {error&&<Alert>{error}</Alert>}{provider==='weread'?<WereadSettings enabled={enabled}/>:provider==='local'?<LocalWechatSettings enabled={enabled}/>:null}</>
}
