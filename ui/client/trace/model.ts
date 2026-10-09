/**
 * 「执行过程」的数据从哪来：登记到引擎的对话汇总里（uiConversation），由它把会话事件喂过来。
 * 每次工具调用（tool/call 开始、tool/result 结束）记成一条，用户发的每句话记成一条；
 * 引擎按会话各算一份快照，对话进行时随事件更新，页签订阅这份快照。
 * 写法照引擎自己的 ui-tool/todo-history：两个 Definition 喂同一个 View。
 */
import type {
  ConversationNodeDefinition, ConversationTimelineSnapshot, ConversationViewDefinition, ConversationViewNode,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { describeCall, readOutcome, resultText, type Action, type Outcome } from './parse.ts'

export const TRACE_TARGET = 'campus-trace'

/** 一次工具调用。 */
export interface TraceCall {
  readonly callId: string
  readonly turn: number
  readonly step: number
  readonly seq: number
  /** 开始的时刻，毫秒。 */
  readonly at: number
  readonly action: Action
  /** 有结果之后才有。 */
  readonly done?: { readonly at: number, readonly outcome: Outcome }
}

/** 用户发的一句话。 */
export interface TraceAsk {
  readonly seq: number
  readonly text: string
}

/** 一轮的起止。 */
export interface TraceTurn {
  readonly turn: number
  readonly startSeq?: number
  readonly startAt?: number
  readonly endAt?: number
  readonly open: boolean
  /** 被打断或出错结束的。 */
  readonly aborted: boolean
}

export interface TraceSnapshot {
  /** 按发生的先后。 */
  readonly calls: readonly TraceCall[]
  readonly asks: readonly TraceAsk[]
  readonly turns: readonly TraceTurn[]
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationViewSnapshotMap {
    /** 这次对话里的工具调用、提问和各轮起止。 */
    'campus-trace': TraceSnapshot
  }
}

const CALL_KIND = 'campus-trace-call'
const ASK_KIND = 'campus-trace-ask'

export const traceCallDefinition: ConversationNodeDefinition<TraceCall> = {
  kind: CALL_KIND,
  target: TRACE_TARGET,
  match: (event) => {
    if (event.type === 'tool/call') return { id: String(event.data.callId), role: 'start' }
    if (event.type === 'tool/result') return { id: String(event.data.message.source.callId), role: 'update' }
    return null
  },
  start: (_context, match) => {
    const event = match.event
    if (event.type !== 'tool/call') throw new Error('campus-trace-call 要从 tool/call 开始')
    const { callId, turn, step, name } = event.data
    return { callId: String(callId), turn, step, seq: event.seq, at: event.time, action: describeCall(name, event.data.arguments) }
  },
  update: (context, match) => {
    const event = match.event
    if (event.type !== 'tool/result') return context.state
    const isError = event.data.message.isError === true
    const outcome = context.state.action.kind === 'campus'
      ? readOutcome(resultText(event.data.message.content), isError)
      : { ok: !isError }
    return { ...context.state, done: { at: event.time, outcome } }
  },
  buildViewNode: context => context.state === undefined ? null : {
    key: context.key, kind: context.kind, id: context.id, target: TRACE_TARGET, data: context.state,
  },
}

export const traceAskDefinition: ConversationNodeDefinition<TraceAsk> = {
  kind: ASK_KIND,
  target: TRACE_TARGET,
  // 只要用户自己打的话；助手注入的上下文（文件变动、技能内容）也是 user/message，来源不是 user。
  match: event => event.type === 'user/message' && event.data.source.kind === 'user'
    ? { id: String(event.seq), role: 'start' }
    : null,
  start: (_context, match) => {
    const event = match.event
    if (event.type !== 'user/message') throw new Error('campus-trace-ask 要从 user/message 开始')
    return { seq: event.seq, text: resultText(event.data.content).trim() }
  },
  update: context => context.state,
  buildViewNode: context => context.state === undefined ? null : {
    key: context.key, kind: context.kind, id: context.id, target: TRACE_TARGET, data: context.state,
  },
}

function turnsOf(timeline: ConversationTimelineSnapshot): TraceTurn[] {
  return timeline.turnOrder.flatMap((number) => {
    const turn = timeline.turns.get(number)
    if (turn === undefined) return []
    return [{
      turn: number,
      ...(turn.start ? { startSeq: turn.start.seq, startAt: turn.start.time } : {}),
      ...(turn.end ? { endAt: turn.end.time } : {}),
      open: turn.status === 'open',
      aborted: turn.end !== undefined && turn.end.data.reason.kind !== 'completed',
    }]
  })
}

export const traceView: ConversationViewDefinition<ConversationViewNode, TraceSnapshot> = {
  target: TRACE_TARGET,
  create: () => {
    let nodes = new Map<string, ConversationViewNode>()
    const snapshot = (timeline: ConversationTimelineSnapshot): TraceSnapshot => {
      const calls: TraceCall[] = [], asks: TraceAsk[] = []
      for (const node of nodes.values()) {
        if (node.kind === CALL_KIND) calls.push(node.data as TraceCall)
        else asks.push(node.data as TraceAsk)
      }
      calls.sort((a, b) => a.seq - b.seq)
      asks.sort((a, b) => a.seq - b.seq)
      return { calls, asks, turns: turnsOf(timeline) }
    }
    return {
      empty: { calls: [], asks: [], turns: [] },
      replace: (input) => {
        nodes = new Map(input.nodes.map(node => [node.key, node]))
        return snapshot(input.timeline)
      },
      apply: (input) => {
        for (const node of input.upserts) nodes.set(node.key, node)
        return snapshot(input.timeline)
      },
    }
  },
}
