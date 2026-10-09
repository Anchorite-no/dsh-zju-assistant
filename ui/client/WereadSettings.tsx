import { useEffect, useState } from 'react'
import { Button, Modal, Switch, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import { profileApi, errorText } from './api.ts'
import { Alert, Field } from './controls.tsx'

interface Account { bookId: string, name: string, enabled: boolean, articleCount: number, status: string }
interface Article { id: string, bookId: string, title: string, url: string, publishedAt: string | null, content?: string, truncated?: boolean }
interface State { accounts: Account[], articles: Article[], connection: { status?: string, connected?: boolean, message?: string } | null, pending: { taskId: string, message: string } | null, error?: string | null }
interface Result { ok: boolean, status: string, state?: string, message?: string, taskId?: string, accounts?: { bookId: string, name: string }[], article?: Article, result?: Result, snapshot?: State }
const date = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

export function WereadSettings({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<State | null>(null), [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [finding, setFinding] = useState(false), [query, setQuery] = useState(''), [found, setFound] = useState<{ bookId: string, name: string }[]>([])
  const [opened, setOpened] = useState<Article | null>(null)
  const [configOpen, setConfigOpen] = useState(false), [endpoint, setEndpoint] = useState(''), [model, setModel] = useState(''), [keyRef, setKeyRef] = useState('WEREAD_VISION_API_KEY')
  const [solveConfirm, setSolveConfirm] = useState(false)
  const load = async () => { const next = await profileApi<State>('weread-state'); setState(next) }
  const consume = (result: Result) => {
    if (result.snapshot) setState(result.snapshot)
    if (result.accounts) setFound(result.accounts)
    if (result.result?.accounts) setFound(result.result.accounts)
    if (result.article) setOpened(result.article)
    if (result.result?.article) setOpened(result.result.article)
    if (!result.ok && result.status !== 'verification_required') setError(result.message ?? '任务尚未完成。')
  }
  async function run(name: string, action: () => Promise<Result>) {
    if (busy) return
    setBusy(name); setError('')
    try { const result = await action(); consume(result); await load() }
    catch (reason) { setError(errorText(reason)) }
    finally { setBusy('') }
  }
  useEffect(() => {
    let active = true
    const refresh = () => profileApi<State>('weread-state').then(next => { if (active) setState(next) }).catch(reason => { if (active) setError(errorText(reason)) })
    void refresh(); const timer = setInterval(() => { void refresh() }, 15000)
    return () => { active = false; clearInterval(timer) }
  }, [])
  useEffect(() => {
    if (!enabled || !state?.pending || busy) return
    const timer = setInterval(() => {
      profileApi<Result>('weread-verification', { action: 'status', task: state.pending!.taskId }).then(result => {
        if (result.ok) { consume(result); void load(); setNotice('验证完成，任务已继续') }
        else if (result.state === 'failed' || result.state === 'cancelled' || result.status === 'verification_expired') { consume(result); void load() }
      }).catch(() => {})
    }, 2500)
    return () => { clearInterval(timer) }
  }, [enabled, state?.pending?.taskId, busy])
  const discover = () => run('discover', async () => {
    const result = await profileApi<Result>('weread-discover', { query })
    if (result.ok) setFound(result.accounts ?? [])
    return result
  })
  const blocked = !enabled || !!busy
  const currentError = error || state?.error
  const registered = new Set(state?.accounts.map(a => a.bookId) ?? [])
  return <>
    <section className="campus-section">
      <div className="campus-section-head campus-wechat-heading"><h2 className="campus-section-title">微信读书连接</h2><div className="campus-wechat-actions">
        <Button variant="outline" size="sm" disabled={blocked} onClick={() => { void run('connect', () => profileApi('weread-connect')) }}>连接微信读书</Button>
        <Button variant="outline" size="sm" disabled={blocked} onClick={() => { void run('check', () => profileApi('weread-check')) }}>检查连接</Button>
      </div></div>
      <p className="campus-note">{state?.connection?.message ?? (state?.connection?.status === 'connected' ? '已连接，无需电脑版微信常驻。' : '在官方微信读书窗口登录后，点击检查连接。')}</p>
      {currentError && <Alert>{currentError}</Alert>}
      {state?.pending && <div className="campus-section" role="status">
        <p className="campus-note">微信读书需要验证，完成后会继续原任务。</p>
        <div className="campus-wechat-actions"><Button size="sm" variant="outline" disabled={blocked} onClick={() => { void run('verify-open', () => profileApi('weread-verification', { action: 'open', task: state.pending!.taskId })) }}>打开验证</Button>
          <Button size="sm" variant="outline" disabled={blocked} onClick={() => { setSolveConfirm(true) }}>识别当前验证码</Button></div>
      </div>}
    </section>
    <section className="campus-section">
      <div className="campus-section-head campus-wechat-heading"><h2 className="campus-section-title">已添加的公众号</h2><div className="campus-wechat-actions">
        <Button size="sm" variant="outline" disabled={blocked || !state?.accounts.some(a => a.enabled)} onClick={() => { void run('refresh', () => profileApi('weread-refresh')) }}>{busy === 'refresh' ? '更新中…' : '立即更新'}</Button>
        <Button size="sm" variant="outline" disabled={blocked} onClick={() => { setFinding(true); setQuery(''); void run('discover', async () => { const result = await profileApi<Result>('weread-discover'); if (result.ok) setFound(result.accounts ?? []); return result }) }}>添加公众号</Button>
      </div></div>
      {!state?.accounts.length ? <div className="campus-empty"><p>从微信读书书架选择公众号，或按名称搜索。</p></div> : <ul className="campus-rows">{state.accounts.map(account => <li key={account.bookId} className="campus-row"><div className="campus-wechat-main"><span className="campus-row-title">{account.name}</span><span className="campus-wechat-meta">{account.articleCount} 篇 · {account.enabled ? account.status === 'ready' ? '已更新' : '等待更新' : '已暂停'}</span></div><Switch label={`同步${account.name}`} checked={account.enabled} disabled={blocked} onChange={value => { void run('set', async () => ({ ok: true, status: 'ready', snapshot: await profileApi<State>('weread-set', { bookId: account.bookId, enabled: value }) })) }} /></li>)}</ul>}
      <p className="campus-note">定时更新采用独立的低频策略；需要验证时暂停，不重复请求。</p>
    </section>
    {!!state?.articles.length && <section className="campus-section"><h2 className="campus-section-title">最近文章</h2><ul className="campus-rows">{state.articles.slice(0,50).map(article => <li key={article.id} className="campus-row campus-wechat-article"><div className="campus-wechat-main"><button type="button" className="campus-wechat-name" disabled={blocked} onClick={() => { void run('read', () => profileApi('weread-read', { account: article.bookId, title: article.title, url: article.url })) }}>{article.title}</button><span className="campus-wechat-meta">{state.accounts.find(a => a.bookId === article.bookId)?.name}</span></div><time>{date(article.publishedAt)}</time></li>)}</ul></section>}
    <section className="campus-section"><div className="campus-section-head"><h2 className="campus-section-title">验证码识别器</h2><Button size="sm" variant="outline" disabled={blocked} onClick={() => { setConfigOpen(true); void profileApi<{endpoint?:string,model?:string,keyRef?:string}>('weread-recognizer', { action: 'status' }).then(config=>{setEndpoint(config.endpoint??'');setModel(config.model??'');setKeyRef(config.keyRef??'WEREAD_VISION_API_KEY')}).catch(reason=>setError(errorText(reason))) }}>配置</Button></div><p className="campus-note">可接支持图像输入的模型；仅发送题目和六张图片，不发送登录凭据。</p></section>
    <Modal open={finding} title="添加公众号" closeLabel="关闭" onClose={() => { setFinding(false) }} footer={<Button variant="outline" onClick={() => { setFinding(false) }}>完成</Button>}>
      <form onSubmit={event => { event.preventDefault(); void discover() }}><Field id="weread-query" label="公众号名称"><input id="weread-query" className="campus-input" value={query} onChange={event=>setQuery(event.target.value)} placeholder="留空列出微信读书书架" /></Field><Button variant="outline" size="sm" type="submit" disabled={blocked}>搜索</Button></form>
      {error && <Alert>{error}</Alert>}<div className="campus-wechat-picker"><ul className="campus-rows">{found.map(account=><li key={account.bookId} className="campus-row"><span className="campus-wechat-main campus-row-title">{account.name}</span><Button size="sm" variant="outline" disabled={blocked||registered.has(account.bookId)} onClick={()=>{void run('add',()=>profileApi('weread-add',{account:account.bookId}))}}>{registered.has(account.bookId)?'已添加':'添加并同步'}</Button></li>)}</ul></div>
      {state?.pending && <p className="campus-note">添加需要验证，请关闭此窗口后点击“打开验证”。</p>}
    </Modal>
    <Modal className="campus-weread-reader" open={!!opened} title={opened?.title??'公众号文章'} closeLabel="关闭" onClose={()=>setOpened(null)} footer={<><a className="campus-textlink" href={opened?.url} target="_blank" rel="noreferrer">打开原文</a><Button variant="outline" onClick={()=>setOpened(null)}>关闭</Button></>}><div className="campus-weread-body">{opened?.content}</div>{opened?.truncated&&<p className="campus-note">正文过长，当前显示部分内容。</p>}</Modal>
    <Modal open={configOpen} title="验证码识别器" closeLabel="关闭" onClose={()=>setConfigOpen(false)} footer={<Button variant="primary" disabled={blocked||!endpoint||!model} onClick={()=>{void run('config',async()=>{const result=await profileApi<Result>('weread-recognizer',{action:'configure',endpoint,model,keyRef});if(result.ok){setConfigOpen(false);setNotice('识别器已保存')}return result})}}>保存</Button>}>
      <Field id="weread-vision-url" label="图像识别接口"><input id="weread-vision-url" className="campus-input" value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="https://…/chat/completions" /></Field>
      <Field id="weread-vision-model" label="模型名称"><input id="weread-vision-model" className="campus-input" value={model} onChange={e=>setModel(e.target.value)} /></Field>
      <Field id="weread-vision-key" label="应用 API Key 引用"><input id="weread-vision-key" className="campus-input" value={keyRef} onChange={e=>setKeyRef(e.target.value)} /></Field>
      <p className="campus-note">密钥使用应用统一的 api-keys.local.yaml；这里仅填写引用名称。</p>
    </Modal>
    <Modal open={solveConfirm} title="识别并处理当前这题？" description="将当前问题和六张图片交给已配置的识别模型。图片变化或结果不确定时停止。" closeLabel="关闭" onClose={()=>setSolveConfirm(false)} footer={<><Button variant="outline" onClick={()=>setSolveConfirm(false)}>取消</Button><Button variant="primary" onClick={()=>{setSolveConfirm(false);void run('solve',()=>profileApi('weread-verification',{action:'solve',confirm:true,task:state?.pending?.taskId}))}}>处理本题</Button></>} />
    {notice&&<Toast text={notice} onDone={()=>setNotice('')} />}
  </>
}
