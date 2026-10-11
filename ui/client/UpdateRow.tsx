/**
 * 设置 → 通用设置里的「检查更新」一行。查、下载、安装都在壳里（desktop/update.cjs）：有新版本它自己下，下完弹窗问要不要立刻装。
 * 这里显示走到哪了，给「检查更新」和「安装并重启」两个按钮；读不到私有仓库时让人填一个 GitHub 令牌。
 */
import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'

function describe(state: CampusUpdateState): string {
  switch (state.status) {
    case 'unavailable': return `当前版本 ${state.current}，开发模式不检查更新`
    case 'checking': return '正在检查…'
    case 'current': return `已是最新版本（${state.current}）`
    case 'downloading': return `正在下载 ${state.version ?? '新版本'}：${state.percent ?? 0}%`
    case 'ready': return `${state.version ?? '新版本'} 已下载，安装后生效`
    case 'no-access': return '读不到这个项目的更新：先在本机登录 GitHub CLI（gh auth login），或者在下面填一个能读这个仓库的 GitHub 令牌。'
    case 'error': return `检查更新没有成功：${state.message ?? ''}`
    default: return `当前版本 ${state.current}`
  }
}

export function UpdateRow() {
  const [state, setState] = useState<CampusUpdateState>()
  const [token, setToken] = useState('')
  const accept = (next: CampusUpdateState | undefined) => { if (next) setState(next) }

  // 壳那边状态一变就喊一声（下载的进度也是），听到了来读。
  useEffect(() => {
    const read = () => { void window.campusShell?.update().then(accept, () => {}) }
    read()
    window.addEventListener('campus:update', read)
    return () => { window.removeEventListener('campus:update', read) }
  }, [])

  if (!state) return null
  const busy = state.status === 'checking' || state.status === 'downloading'
  return (
    <div className="campus-setting-row">
      <div className="campus-setting-text">
        <div className="campus-setting-title">检查更新</div>
        <div className="campus-setting-desc">{describe(state)}</div>
        {state.status === 'no-access' && (
          <form className="campus-update-token" onSubmit={(event) => { event.preventDefault(); void window.campusShell?.saveUpdateToken(token).then((next) => { setToken(''); accept(next) }, () => {}) }}>
            <input className="campus-input" type="password" autoComplete="off" aria-label="GitHub 令牌" placeholder="GitHub 令牌" value={token} onChange={(event) => { setToken(event.target.value) }} />
            <Button type="submit" size="sm" variant="outline" disabled={!token.trim()}>保存</Button>
          </form>
        )}
      </div>
      {state.status === 'ready'
        ? <Button size="sm" variant="primary" onClick={() => { void window.campusShell?.installUpdate() }}>安装并重启</Button>
        : state.status !== 'unavailable' && <Button size="sm" variant="outline" disabled={busy} onClick={() => { void window.campusShell?.checkUpdate().then(accept, () => {}) }}>检查更新</Button>}
    </div>
  )
}
