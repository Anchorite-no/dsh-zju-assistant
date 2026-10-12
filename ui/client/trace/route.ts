/**
 * 把一轮里的工具调用拼成一条路线：从你的问题到回答。
 * 主线是助手自己，读写文件、跑脚本这些本地操作在主线上；每去一个网站，从主线分出一条支线。
 * 一次调用就是一站，不合并：同一种动作做了几次就是几站（2026-10-11 用户要的，步骤多才看得出它做了多少事）。
 * 引擎只记了「轮 → 步 → 同一步里并行的调用」，没有谁依赖谁，所以路线只按这个画：
 *   同一步里发出的几次调用，从主线上同一个岔口分出去，各是一条支线；
 *   换了一个网站，另起一条支线；
 *   接着在同一个网站上做的，接在那条支线的下面；
 *   本地操作一次一站排在主线上，夹在中间时把前后的支线隔开。
 */
import type { ActionKind } from './parse.ts'
import type { TraceCall, TraceSnapshot } from './model.ts'

/** running 还没结果；stopped 是这一轮已经结束却没等到结果（被打断）。 */
export type StopStatus = 'running' | 'done' | 'failed' | 'stopped'

/** 路线上的一站：一次调用。 */
export interface Stop {
  readonly id: string
  readonly kind: ActionKind
  readonly key: string
  readonly site?: string
  readonly label: string
  readonly call: TraceCall
  readonly status: StopStatus
  /** 从开始到有结果，毫秒；还在跑就没有。 */
  readonly ms?: number
}

/** 一条支线：在同一个网站上接着做的几站，按先后。 */
export type Branch = readonly Stop[]

/** 主线上的一站（本地操作），或者从主线上同一个岔口分出去的几条支线；只发出一次调用就只有一条。 */
export type Segment =
  | { readonly type: 'local', readonly stop: Stop }
  | { readonly type: 'fork', readonly branches: readonly Branch[] }

export interface TurnRoute {
  readonly turn: number
  readonly question?: string
  readonly open: boolean
  readonly aborted: boolean
  readonly segments: readonly Segment[]
  /** 用到的网站，按第一次出现的先后。 */
  readonly sites: readonly string[]
  /** 一共多少步：每次调用算一步，本地操作也算。 */
  readonly steps: number
  /** 这一轮用了多久；还没结束就没有。 */
  readonly ms?: number
}

function makeStop(call: TraceCall, open: boolean): Stop {
  const status: StopStatus = call.done === undefined ? (open ? 'running' : 'stopped') : call.done.outcome.ok ? 'done' : 'failed'
  return {
    id: call.callId,
    kind: call.action.kind,
    key: call.action.key,
    ...(call.action.site ? { site: call.action.site } : {}),
    label: call.action.label,
    call,
    status,
    ...(call.done === undefined ? {} : { ms: call.done.at - call.at }),
  }
}

/**
 * 这一步的几次调用各接在上一个岔口的哪条支线上：先找最后一站是同一种动作的，再找同一个网站的，一条支线只接一次。
 * 同一步里的调用是并排发出的，两次接到同一条支线上就成了一先一后；所以有一次接不上就都不接。
 */
function continueOn(branches: readonly Branch[], calls: readonly TraceCall[]): number[] | undefined {
  const taken = new Set<number>()
  const find = (fits: (tail: Stop) => boolean) => {
    const index = branches.findIndex((branch, at) => !taken.has(at) && fits(branch[branch.length - 1]!))
    if (index >= 0) taken.add(index)
    return index
  }
  const targets = calls.map(call => find(tail => tail.key === call.action.key))
  calls.forEach((call, at) => {
    if (targets[at]! < 0) targets[at] = find(tail => tail.site === call.action.site)
  })
  return targets.every(index => index >= 0) ? targets : undefined
}

function segmentsOf(calls: readonly TraceCall[], open: boolean): Segment[] {
  const steps = new Map<number, TraceCall[]>()
  for (const call of calls) steps.set(call.step, [...steps.get(call.step) ?? [], call])
  const segments: Segment[] = []
  for (const step of [...steps.keys()].sort((a, b) => a - b)) {
    const now = steps.get(step)!
    for (const call of now) if (call.action.kind === 'other') segments.push({ type: 'local', stop: makeStop(call, open) })
    const visits = now.filter(call => call.action.kind !== 'other')
    if (visits.length === 0) continue
    const last = segments[segments.length - 1]
    const targets = last?.type === 'fork' ? continueOn(last.branches, visits) : undefined
    if (last?.type !== 'fork' || targets === undefined) {
      segments.push({ type: 'fork', branches: visits.map(call => [makeStop(call, open)]) })
      continue
    }
    const branches = last.branches.map(branch => [...branch])
    visits.forEach((call, at) => { branches[targets[at]!]!.push(makeStop(call, open)) })
    segments[segments.length - 1] = { type: 'fork', branches }
  }
  return segments
}

/** 每一轮一条路线，按先后。没有提问也没有调用的轮不出现。 */
export function buildRoutes(snapshot: TraceSnapshot): TurnRoute[] {
  const routes: TurnRoute[] = []
  snapshot.turns.forEach((turn, index) => {
    const calls = snapshot.calls.filter(call => call.turn === turn.turn)
    // 这一轮的提问：这一轮开始之后、下一轮开始之前发的第一句。开头没加载到时拿不到，就不显示。
    const nextStart = snapshot.turns[index + 1]?.startSeq ?? Infinity
    const ask = turn.startSeq === undefined
      ? undefined
      : snapshot.asks.find(item => item.seq > turn.startSeq! && item.seq < nextStart)
    if (calls.length === 0 && ask === undefined) return
    const sites = calls.map(call => call.action.site).filter((site): site is string => site !== undefined)
    routes.push({
      turn: turn.turn,
      ...(ask ? { question: ask.text } : {}),
      open: turn.open,
      aborted: turn.aborted,
      segments: segmentsOf(calls, turn.open),
      sites: [...new Set(sites)],
      steps: calls.length,
      ...(turn.startAt !== undefined && turn.endAt !== undefined ? { ms: turn.endAt - turn.startAt } : {}),
    })
  })
  return routes
}

/** 「3 秒」「1 分 20 秒」；不到一秒算一秒。 */
export function formatDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds} 秒`
  const rest = seconds % 60
  return rest === 0 ? `${Math.floor(seconds / 60)} 分` : `${Math.floor(seconds / 60)} 分 ${rest} 秒`
}
