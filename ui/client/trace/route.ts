/**
 * 把一轮里的工具调用拼成一条路线：从你的问题到回答。
 * 主线是助手自己，读写文件、跑脚本这些本地操作在主线上；每去一个网站，从主线分出一条支线。
 * 引擎只记了「轮 → 步 → 同一步里并行的调用」，没有谁依赖谁，所以路线只按这个画：
 *   同一步里做的不同的事，从主线上同一个岔口分出去，各是一条支线；
 *   换了一个网站，另起一条支线；
 *   接着在同一个网站上做别的，接在那条支线的下面；
 *   同一个网站上的同一种动作，同一步的几次和连着几步的，合成一站；
 *   本地操作合成主线上的一站，夹在中间时把前后的支线隔开。
 */
import type { ActionKind } from './parse.ts'
import type { TraceCall, TraceSnapshot } from './model.ts'

/** running 还没结果；stopped 是这一轮已经结束却没等到结果（被打断）。 */
export type StopStatus = 'running' | 'done' | 'failed' | 'stopped'

/** 路线上的一站：一次调用，或者合在一起的几次。 */
export interface Stop {
  readonly id: string
  readonly kind: ActionKind
  readonly key: string
  readonly site?: string
  readonly label: string
  readonly calls: readonly TraceCall[]
  readonly status: StopStatus
  /** 其中没成功的次数。 */
  readonly failed: number
  /** 从第一次开始到最后一次有结果，毫秒；还在跑就没有。 */
  readonly ms?: number
}

/** 一条支线：在同一个网站上接着做的几站，按先后。 */
export type Branch = readonly Stop[]

/** 主线上的一站（本地操作），或者从主线上同一个岔口分出去的几条支线；只去了一个网站就只有一条。 */
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
  /** 查网站的次数，不含本地操作。 */
  readonly queries: number
  /** 这一轮用了多久；还没结束就没有。 */
  readonly ms?: number
}

/** 同一步里同一种动作的几次。 */
type Group = readonly [key: string, calls: readonly TraceCall[]]

function makeStop(key: string, calls: readonly TraceCall[], open: boolean): Stop {
  const first = calls[0]!
  const running = calls.some(call => call.done === undefined)
  const failed = calls.filter(call => call.done?.outcome.ok === false).length
  const status: StopStatus = running ? (open ? 'running' : 'stopped') : failed === calls.length ? 'failed' : 'done'
  const end = running ? undefined : Math.max(...calls.map(call => call.done!.at))
  return {
    id: first.callId,
    kind: first.action.kind,
    key,
    ...(first.action.site ? { site: first.action.site } : {}),
    label: first.action.label,
    calls,
    status,
    failed,
    ...(end === undefined ? {} : { ms: end - first.at }),
  }
}

/**
 * 这一步的几件事各接在上一个岔口的哪条支线上：先找最后一站是同一种动作的，再找同一个网站的，一条支线只接一件。
 * 同一步里的事是并排做的，两件接到同一条支线上就成了一先一后；所以有一件接不上就都不接。
 */
function continueOn(branches: readonly Branch[], groups: readonly Group[]): number[] | undefined {
  const taken = new Set<number>()
  const find = (fits: (tail: Stop) => boolean) => {
    const index = branches.findIndex((branch, at) => !taken.has(at) && fits(branch[branch.length - 1]!))
    if (index >= 0) taken.add(index)
    return index
  }
  const targets = groups.map(([key]) => find(tail => tail.key === key))
  groups.forEach(([, calls], at) => {
    if (targets[at]! < 0) targets[at] = find(tail => tail.site === calls[0]!.action.site)
  })
  return targets.every(index => index >= 0) ? targets : undefined
}

function segmentsOf(calls: readonly TraceCall[], open: boolean): Segment[] {
  const steps = new Map<number, TraceCall[]>()
  for (const call of calls) steps.set(call.step, [...steps.get(call.step) ?? [], call])
  const segments: Segment[] = []
  for (const step of [...steps.keys()].sort((a, b) => a - b)) {
    const buckets = new Map<string, TraceCall[]>()
    for (const call of steps.get(step)!) buckets.set(call.action.key, [...buckets.get(call.action.key) ?? [], call])
    const local = buckets.get('other')
    if (local) {
      const last = segments[segments.length - 1]
      if (last?.type === 'local') segments[segments.length - 1] = { type: 'local', stop: makeStop('other', [...last.stop.calls, ...local], open) }
      else segments.push({ type: 'local', stop: makeStop('other', local, open) })
    }
    const rest: Group[] = [...buckets].filter(([key]) => key !== 'other')
    if (rest.length === 0) continue
    const last = segments[segments.length - 1]
    const targets = last?.type === 'fork' ? continueOn(last.branches, rest) : undefined
    if (last?.type !== 'fork' || targets === undefined) {
      segments.push({ type: 'fork', branches: rest.map(([key, group]) => [makeStop(key, group, open)]) })
      continue
    }
    const branches = last.branches.map(branch => [...branch])
    rest.forEach(([key, group], at) => {
      const branch = branches[targets[at]!]!
      const tail = branch[branch.length - 1]!
      if (tail.key === key) branch[branch.length - 1] = makeStop(key, [...tail.calls, ...group], open)
      else branch.push(makeStop(key, group, open))
    })
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
    const segments = segmentsOf(calls, turn.open)
    const visited = segments.flatMap(segment => segment.type === 'fork' ? segment.branches.flat() : []).filter(stop => stop.site !== undefined)
    routes.push({
      turn: turn.turn,
      ...(ask ? { question: ask.text } : {}),
      open: turn.open,
      aborted: turn.aborted,
      segments,
      sites: [...new Set(visited.map(stop => stop.site!))],
      queries: visited.reduce((sum, stop) => sum + stop.calls.length, 0),
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
