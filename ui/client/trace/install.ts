/** 把「执行过程」接到引擎上：登记页签类型、会话数据的汇总，以及页签的正文。 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { TRACE_ID, TRACE_KIND, TraceTab, type TraceInjected } from '../TraceTab.tsx'
import { TRACE_TARGET, traceAskDefinition, traceCallDefinition, traceView } from './model.ts'

export function installTrace(ctx: Context): void {
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TRACE_ID,
    kind: TRACE_KIND,
    title: () => '执行过程',
    guide: [{ id: 'trace', order: 5, title: () => '执行过程', description: () => '这次对话查了哪些网站、每一步拿到了什么' }],
  }), 'campus-ui: trace tab type')
  // 会话数据由引擎的对话界面汇总，等它在了再登记；正文靠它供数，所以一起放在里面。
  ctx.inject(['uiConversation'], (inner) => {
    inner.uiConversation.events.register(traceCallDefinition)
    inner.uiConversation.events.register(traceAskDefinition)
    inner.uiConversation.views.register(traceView)
    inner.slots.inject('sidebar.right.pane.tab', () =>
      inner.slots.register({
        name: 'sidebar.right.pane.tab',
        key: TRACE_ID,
        inject: (sessionId): TraceInjected => ({
          hooks: { trace: inner.uiConversation.binding(sessionId).target(TRACE_TARGET) },
        }),
      }, TraceTab))
  })
}
