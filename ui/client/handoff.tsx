/**
 * 把一件事交给助手：开一个新的对话，把写好的一段话放进输入框，用户看过、想补就补，再自己发出去。
 * 「让助手讲这次课」是另一种：话是我们定好的，点了就直接发出去，用户落在已经开始的对话里（send）。
 * 输入框里的草稿只有对话里的组件改得了，所以在输入框里登记一个不显示东西的组件：
 * 轮到它所在的对话是我们刚开的那一个时，把话写进去。登记在 conversation.input.overlay，
 * 是因为这个位置在还没发过消息的新对话里也会画出来（输入框下面的 composer.dock 不会）。
 */
import { useEffect, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { Button, IconNewChatOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { CHATS_ID } from './chats.ts'

interface Pending { sessionId: string, text: string, send: boolean }
interface UiWorkspace { connectWorkspace: (workspaceId: string) => Promise<string>, openSession: (sessionId: string) => void }

/** 等着写进输入框的那段话，和它要去的对话。 */
let pending: Pending | null = null
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const setPending = (next: Pending | null) => { pending = next; for (const listener of [...listeners]) listener() }

const NOT_READY = async () => { throw new Error('对话还没准备好，稍等一下再试。') }
/** 写进草稿以后隔多久替用户发出去。 */
const SEND_AFTER_MS = 120
let open: (text: string, send: boolean) => Promise<void> = NOT_READY

/** 开一个新的对话并把 text 放进它的输入框；send 为真时接着替用户发出去。开不了时抛出原因。 */
export function handToAssistant(text: string, { send = false }: { send?: boolean } = {}): Promise<void> { return open(text, send) }

/**
 * 列表里每一行右边的「交给助手」：只画一个图标，鼠标放上去或键盘聚焦时显示这四个字。
 * 行里地方窄，带字的按钮会把卡片撑高；详情页右上角的那个仍然带字。
 */
export function HandIconButton({ onClick, disabled = false }: { onClick: () => void, disabled?: boolean }) {
  return (
    <Tooltip label="交给助手" side="top" portal>
      <Button className="campus-hand" size="sm" variant="outline" aria-label="交给助手" disabled={disabled} icon={<IconNewChatOutlineRegular size={14} />} onClick={onClick} />
    </Tooltip>
  )
}

/** 输入框里的那个组件：每个对话里各有一份，只有等的正是这个对话时才动手。 */
function Seed({ sessionId, inputActions }: { sessionId: string, inputActions: { setDraft: (text: string) => void, submit: () => void } }) {
  const waiting = useSyncExternalStore(subscribe, () => pending)
  useEffect(() => {
    if (waiting?.sessionId !== sessionId) return
    inputActions.setDraft(waiting.text)
    setPending(null)
    // 草稿要等输入框收下以后才发得出去，所以让一拍。这个定时不在清理时取消：上一行清掉等着的那段话，这个组件马上会重画一次，一取消就永远发不出去。
    if (waiting.send) window.setTimeout(() => { inputActions.submit() }, SEND_AFTER_MS)
  }, [waiting, sessionId, inputActions])
  return null
}

export function installHandoff(ctx: Context): void {
  const ui = (ctx as unknown as { get: (name: string) => unknown }).get('uiWorkspace') as UiWorkspace | undefined
  if (!ui) return
  ctx.effect(() => {
    open = async (text, send) => {
      // 「对话」里的一个空白对话：有没用过的就接着用，没有才新建（见 chats.ts）。
      const sessionId = await ui.connectWorkspace(CHATS_ID)
      setPending({ sessionId, text, send })
      ui.openSession(sessionId)
    }
    return () => { open = NOT_READY; setPending(null) }
  }, 'campus-ui: hand a task to the assistant')
  ctx.slots.inject('conversation.input.overlay', () =>
    ctx.slots.register({ name: 'conversation.input.overlay', id: 'campus-handoff', order: 9 }, Seed))
}
