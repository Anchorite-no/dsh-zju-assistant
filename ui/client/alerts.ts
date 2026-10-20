/**
 * 托盘上点了一条消息（desktop/tray.cjs）：壳把主窗口叫回来以后喊一声，这里取来它说的地方并打开。
 * 去处只有两种：一个对话（助手用 campus_notify 提醒的事，回到叫它的那个对话），
 * 或者侧栏上的一页（公众号的新文章在「校园事务」）。一页后面可以跟冒号和页签：
 * 邮箱、CC98 的新消息是 campus.affairs:personal，打开「校园事务」并切到「个人消息」。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { showFeedTab } from './Feed.tsx'

interface UiWorkspace { openSession: (sessionId: string) => void }

export function installAlerts(ctx: Context): void {
  const shell = window.campusShell
  // 界面比壳新（改了代码没重开应用）时壳还没有这一项。
  if (typeof shell?.takeOpen !== 'function') return
  const ui = (ctx as unknown as { get: (name: string) => unknown }).get('uiWorkspace') as UiWorkspace | undefined
  ctx.effect(() => {
    const open = () => {
      void shell.takeOpen().then((target) => {
        // 对话可能已经被删了，打不开就算了，主窗口已经叫回来了。
        try {
          if (target?.sessionId) ui?.openSession(target.sessionId)
          else if (target?.panel) {
            const [panel, tab] = target.panel.split(':')
            if (panel === 'campus.affairs' && (tab === 'personal' || tab === 'campus')) showFeedTab(tab)
            ctx.layout.selectPanel(panel as MainPanelId)
          }
        } catch { /* 留在原来的页面 */ }
      }, () => {})
    }
    window.addEventListener('campus:open', open)
    return () => { window.removeEventListener('campus:open', open) }
  }, 'campus-ui: open what a tray message points at')
}
