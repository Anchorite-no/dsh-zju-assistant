/**
 * 设置 → 模型页最下面的「ChatGPT」一块：用 ChatGPT 账号登录，登录后模型选择器里多出 GPT。
 * 登录本身在引擎侧（ui/profile/chatgpt.mjs），这里画状态、打开登录页、把人贴回来的地址交回去。
 * 登录页是 OpenAI 的，壳把它交给系统浏览器打开（desktop/main.cjs），登完浏览器跳回本机，引擎接到后这里自己变成已登录。
 */
import { useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { errorText, profileApi } from './api.ts'

interface Snapshot {
  available: boolean
  status: 'signed-out' | 'signing-in' | 'signed-in'
  method?: 'browser' | 'device'
  /** 要人去的页面：浏览器登录时是登录页，设备码登录时是输入代码的页面。 */
  page?: string
  /** 设备码登录时要在那一页输入的代码。 */
  code?: string
  /** 引擎正等人把跳转后的地址贴回来，这是那一问的 id。 */
  asking?: string
  /** 上一次登录没走完的原因，整句话。 */
  error?: string
}

const open = (url: string) => { window.open(url, '_blank', 'noopener') }

export function ChatGptCard() {
  const [state, setState] = useState<Snapshot>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pasted, setPasted] = useState('')
  // 这次登录是不是从这里点开始的：是的话登录页的地址一到就打开一次。重新进设置页看到的进行中的登录不再自动打开。
  const started = useRef(false)

  const run = async (action: string, input: unknown = {}) => {
    setBusy(true)
    setError('')
    try { setState(await profileApi<Snapshot>(action, input)) } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  useEffect(() => { void run('chatgpt-read') }, [])

  // 登录中每秒问一次：浏览器那边登完了、流程撤回了「贴地址」那一问，都是这样知道的。
  const signingIn = state?.status === 'signing-in'
  useEffect(() => {
    if (!signingIn) return
    const timer = setInterval(() => { profileApi<Snapshot>('chatgpt-read').then(setState, () => {}) }, 1000)
    return () => { clearInterval(timer) }
  }, [signingIn])

  const page = signingIn && state.method === 'browser' ? state.page : undefined
  useEffect(() => {
    if (!page || !started.current) return
    started.current = false
    open(page)
  }, [page])

  if (!state?.available) return null
  const login = (method: 'browser' | 'device') => { started.current = method === 'browser'; setPasted(''); void run('chatgpt-login', { method }) }
  const problem = error || state.error || ''

  return (
    <div className="campus-chatgpt">
      <div className="campus-chatgpt-head">
        <span className="campus-chatgpt-name">ChatGPT</span>
        <span className="campus-chatgpt-state">{state.status === 'signed-in' ? '已登录' : signingIn ? '正在登录' : '用 ChatGPT 账号登录后可选用 GPT 模型'}</span>
        <div className="campus-chatgpt-actions">
          {state.status === 'signed-out' && <>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { login('device') }}>用代码登录</Button>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => { login('browser') }}>登录</Button>
          </>}
          {signingIn && state.page && <Button size="sm" variant="outline" onClick={() => { open(state.page!) }}>{state.method === 'device' ? '打开验证页' : '重新打开登录页'}</Button>}
          {signingIn && <Button size="sm" variant="outline" disabled={busy} onClick={() => { void run('chatgpt-cancel') }}>取消</Button>}
          {state.status === 'signed-in' && <Button size="sm" variant="outline" disabled={busy} onClick={() => { void run('chatgpt-logout') }}>退出登录</Button>}
        </div>
      </div>
      {signingIn && state.method === 'device' && state.code && (
        <div className="campus-chatgpt-step">
          <span className="campus-note">在验证页输入</span>
          <code className="campus-chatgpt-code">{state.code}</code>
        </div>
      )}
      {signingIn && state.method === 'browser' && state.asking && (
        <form className="campus-chatgpt-step" onSubmit={(event) => { event.preventDefault(); void run('chatgpt-answer', { id: state.asking, value: pasted }) }}>
          <input
            className="campus-input"
            aria-label="浏览器跳转后的地址"
            placeholder="浏览器登录后没有回到这里时，把它地址栏里的地址贴进来"
            value={pasted}
            onChange={(event) => { setPasted(event.target.value) }}
          />
          <Button type="submit" size="sm" variant="outline" disabled={busy || !pasted.trim()}>提交</Button>
        </form>
      )}
      {problem && <p className="campus-form-error" role="alert">{problem}</p>}
    </div>
  )
}
