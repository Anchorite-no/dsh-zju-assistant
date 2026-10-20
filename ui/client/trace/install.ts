/** 把「执行过程」接到引擎上：登记页签类型、会话数据的汇总，以及页签的正文；发出问题时把它调出来。 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { TRACE_ID, TRACE_KIND, TraceTab, type TraceInjected } from '../TraceTab.tsx'
import { TRACE_TARGET, traceAskDefinition, traceCallDefinition, traceView } from './model.ts'

/** 窗口比这个窄时引擎会把右边栏铺满整个窗口、盖住对话，这时不自己打开。 */
const NARROW = 768

/**
 * 发出问题、助手开始做事时，把右边的「执行过程」调出来（2026-10-12 用户要的：用的时候默认就开着）。
 * 一个对话只自己打开一次：之后人把它收起来，这个对话里就不再自己打开；换一个对话照样会开。
 * 打开时照引擎原样从对话区里让出一列，按一下收回去；第一次打开的宽度见 ../rightpane.ts。
 */
function installAutoOpen(ctx: Context): () => void {
  const { sidebarRight, uiConversation } = ctx
  const opened = new Set<string>()
  let leave = (): void => {}

  const watch = (tries = 20): void => {
    leave()
    leave = () => {}
    const sessionId = sidebarRight.mounted.getSnapshot()
    if (sessionId === undefined) return
    // 会话刚选中时它的数据可能还没接好，这时取不到：过一会儿再接，接上之前换了会话就算了。
    let turn: ReturnType<typeof uiConversation.binding>['openTurn']
    try { turn = uiConversation.binding(sessionId).openTurn } catch {
      if (tries <= 0) return
      const timer = setTimeout(() => { watch(tries - 1) }, 500)
      leave = () => { clearTimeout(timer) }
      return
    }
    const started = (): void => {
      if (turn.getSnapshot() === undefined || opened.has(sessionId)) return
      opened.add(sessionId)
      // 这一下是引擎处理会话事件时同步喊的，等它处理完再去动右边栏。
      queueMicrotask(() => {
        try {
          if (sidebarRight.mounted.getSnapshot() !== sessionId || sidebarRight.isExpanded() || window.innerWidth < NARROW) return
          sidebarRight.openTab(TRACE_KIND)
        } catch (reason) { console.warn('campus-ui: 没能自动打开「执行过程」', reason) }
      })
    }
    leave = turn.subscribe(started)
    // 切到一个正在做事的对话，也算。
    started()
  }

  const stop = sidebarRight.mounted.subscribe(() => { watch() })
  watch()
  return () => { stop(); leave() }
}

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
  ctx.inject(['uiConversation', 'sidebarRight'], (inner) => {
    inner.effect(() => installAutoOpen(inner), 'campus-ui: open the trace tab when a turn starts')
  })
}
