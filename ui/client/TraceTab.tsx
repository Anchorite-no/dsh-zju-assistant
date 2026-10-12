/**
 * 右边栏的「执行过程」页签：这次对话里助手查了哪些网站、每一步拿到了什么。
 * 排法像一张线路图：一根细线从「你的问题」画到「回答」，这根主线是助手自己，本地操作的小点在主线上。
 * 每去一个网站，从主线弯出一条支线，圆圈在支线上；线的左边是网站名，右边是在那里做了什么。
 * 接着在同一个网站上做的，竖着接在圆圈下面；同一步里发出的几次调用，共用一条从主线弯出来的竖线，各自横着挂在上面，谁也不挂在谁下面。
 * 一次调用一行，不合并：做了几次就是几行。只用黑白灰，失败的才是红的。点一行，详情接在它下面。
 * 图是长出来的：一行接一行往下长，线沿着走向画过去，画到了圆点才出来，字跟在后面（见「长出来」一段和 style.css 里同名的那段）。
 * 数据见 trace/model.ts，怎么拼成路线见 trace/route.ts。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, IconCodeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TraceCall, TraceSnapshot } from './trace/model.ts'
import { buildRoutes, formatDuration, type Stop, type TurnRoute } from './trace/route.ts'

export const TRACE_ID = 'campus-ui/trace'
export const TRACE_KIND = 'campus-trace'

/** 登记页签正文时一并交给它的：这次会话的调用快照。 */
export interface TraceInjected {
  hooks: { trace: HostObservable<TraceSnapshot | undefined> }
}

type TraceTabProps = PropsRuntime<'sidebar.right.pane.tab'> & InjectFace<TraceInjected>

/**
 * 图的尺寸：一行多高、主线离图的左边多远、支线离主线多远、几条支线共用的那条竖线离主线多远。
 * 行高和 style.css 里的 --campus-trace-row 对着。
 */
const ROW = 30, LEFT = 12, BRANCH = 28, SPLIT = 11
/** 圆圈的半径，和本地操作那种小圆点的半径。 */
const RING = 3.5, SPECK = 2
/** 主线、共用的竖线、支线各在哪。线画在半个像素上，1px 的线才不发虚。 */
const TRUNK = LEFT + 0.5, RAIL = TRUNK + SPLIT, SIDE = TRUNK + BRANCH
const WIDTH = LEFT * 2 + BRANCH + 1
/** 拐进圆圈的那段圆弧的半径。 */
const TURN = ROW / 4
/** 共用的竖线从主线弯出来的那一段，往上一行里探进去多少：这样到第一个圆圈的高度之前有一小段直的，看得出是先分出一条线、再挂上去。 */
const LEAD = 6

/**
 * 长出来：两行之间隔多久（毫秒），和 style.css 里的 --campus-trace-step 对着。线是按同一个速度画的，
 * 一行正好画这么久，所以上一行的线画到底，下一行的线正好接着开始。
 */
const STEP = 80
/** 一下子多出来很多行（刚打开页签、点开更早的一轮）时一次长几行，整张图大约在这么多步里长完。 */
const GROWTH_STEPS = 12

const still = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * 哪些行已经长出来了。ids 是现在该有的行，按从上到下的顺序；每隔 STEP 放出下一行，
 * 认的是行的身份而不是个数：中间插进来一行时，下面已经在的行不会被收回去重长一遍。
 */
function useGrowth(ids: readonly string[]): ReadonlySet<string> {
  const [grown, setGrown] = useState<ReadonlySet<string>>(() => new Set(still() ? ids : ids.slice(0, 1)))
  const waiting = ids.filter(id => !grown.has(id))
  const next = waiting.slice(0, Math.max(1, Math.ceil(waiting.length / GROWTH_STEPS))).join('\n')
  useEffect(() => {
    if (next === '') return
    const grow = () => { setGrown(current => new Set([...current, ...next.split('\n')])) }
    if (still()) { grow(); return }
    const timer = setTimeout(grow, STEP)
    return () => { clearTimeout(timer) }
  }, [next])
  return grown
}

/** 这一行是不是早就在了（不是这一次才画上去的）：后来才多出来的线不用排队等这一行的其它线。 */
function useSettled(): boolean {
  const settled = useRef(false)
  useEffect(() => { settled.current = true }, [])
  return settled.current
}

/** 一段线是哪一种，决定它什么时候开始画、画多久（style.css「长出来」一段）。 */
type Segment = 'up' | 'down' | 'rail' | 'railend' | 'hook' | 'alone' | 'stop' | 'more'

/**
 * 一段线，挂上去的时候沿着走向画出来（长度归成 1，虚线的偏移从 1 走到 0）。
 * 和这一行一起出现的线按先后排队；这一行早就在了、后来才多出来的线（比如下面又接了一站）马上画。
 * 排不排队在它挂上去的那一刻定下来，之后不变：画到一半被改了延时会跳一下。
 */
function Line({ segment, d, settled }: { segment: Segment, d: string, settled: boolean }) {
  const [late] = useState(settled)
  return <path d={d} pathLength={1} data-segment={segment} data-late={late ? '' : undefined} />
}

/** 圆点的画法：实心（问题、回答）、空心圈（查了一个网站）、小圆点（本地操作）。 */
type Mark = 'solid' | 'ring' | 'speck'
type RowState = 'done' | 'running' | 'failed' | 'stopped' | 'pending'

/** 支线上的圆圈从哪接过来：'stop' 是这条支线的上一站，竖着接下来；'alone' 是单独从主线拐出来；'rail' 是从几条支线共用的竖线上横着接过来。 */
type Entry = 'stop' | 'alone' | 'rail'

/** 共用的竖线在这一行里的样子：'start' 从主线弯过来、接着往下；'through' 直着穿过；'end' 到这一行拐进圆圈，到此为止。 */
type Rail = 'start' | 'through' | 'end'

/** 一行里的图怎么画。 */
interface Cell {
  /** 圆点上面、下面有没有主线。 */
  up: boolean
  down: boolean
  /** 圆圈在支线上才有。 */
  entry?: Entry
  /** 同一步里去了几个地方才有。 */
  rail?: Rail
  /** 这条支线下面还有站。 */
  more?: boolean
}

type RowModel =
  | { type: 'ask', cell: Cell }
  | { type: 'stop', stop: Stop, cell: Cell, site?: string }
  | { type: 'answer', cell: Cell }

/**
 * 把路线排成一行行：你的问题、每一站、回答。一条支线的几站挨着排；同一步里去的几个地方一条支线接一条支线排，
 * 它们共用一条竖线：竖线在第一条的上面从主线弯出来，一路往下，每条支线的第一站都横着挂在它上面，到最后一条拐进去。
 * 网站名写在每条支线的第一站，接着的几站不重复；同一个岔口里挨着的两条支线是同一个网站，后一条也不重复。
 */
function layout(route: TurnRoute): RowModel[] {
  const rows: RowModel[] = [{ type: 'ask', cell: { up: false, down: true } }]
  for (const segment of route.segments) {
    if (segment.type === 'local') {
      rows.push({ type: 'stop', stop: segment.stop, cell: { up: true, down: true } })
      continue
    }
    const { branches } = segment
    const shared = branches.length > 1
    branches.forEach((branch, at) => {
      const last = at === branches.length - 1
      const sameAsAbove = at > 0 && branches[at - 1]![0]!.site === branch[0]!.site
      branch.forEach((stop, index) => {
        const entry: Entry = index > 0 ? 'stop' : shared ? 'rail' : 'alone'
        // 竖线要一直通到最后一条支线的第一站，中间经过前面几条支线接着做的那些行。
        const rail: Rail | undefined = !shared ? undefined
          : index > 0 ? (last ? undefined : 'through')
          : at === 0 ? 'start' : last ? 'end' : 'through'
        rows.push({
          type: 'stop',
          stop,
          cell: { up: true, down: true, entry, ...(rail ? { rail } : {}), more: index < branch.length - 1 },
          ...(index === 0 && !sameAsAbove && stop.site !== undefined ? { site: stop.site } : {}),
        })
      })
    })
  }
  rows.push({ type: 'answer', cell: { up: true, down: false } })
  return rows
}

/**
 * 一行的图：主线、共用的竖线、接到圆圈上的线、圆点。线到空心圈的边上就停，不穿过去；支线那一行主线直着过。
 * 线都往下走：从主线分出去的地方是弯的，挂到圆圈上的是横线，只有最后拐进圆圈的那一下是圆弧。
 * 共用的竖线弯出来的那一段有一点画在上一行里（svg 不裁掉）。
 */
function Graph({ cell, mark, settled }: { cell: Cell, mark: Mark, settled: boolean }) {
  const cy = ROW / 2, side = cell.entry !== undefined
  const gap = !side && mark === 'ring' ? RING : 0
  const end = SIDE - RING
  const railBelow = cell.rail === 'start' || cell.rail === 'through'
  return (
    <span className="campus-trace-graph" style={{ width: WIDTH }} aria-hidden="true">
      <svg width={WIDTH} height={ROW}>
        {cell.up && <Line segment="up" settled={settled} d={`M${TRUNK} 0V${cy - gap}`} />}
        {cell.down && <Line segment="down" settled={settled} d={`M${TRUNK} ${cy + gap}V${ROW}`} />}
        {cell.rail === 'start' && <Line segment="rail" settled={settled} d={`M${TRUNK} ${-LEAD}C${TRUNK} ${cy * 0.7 - LEAD} ${RAIL} ${cy * 0.3 - LEAD} ${RAIL} ${cy - LEAD}V${ROW}`} />}
        {cell.rail === 'through' && <Line segment="rail" settled={settled} d={`M${RAIL} 0V${ROW}`} />}
        {cell.rail === 'end' && <Line segment="railend" settled={settled} d={`M${RAIL} 0V${cy - TURN}A${TURN} ${TURN} 0 0 0 ${RAIL + TURN} ${cy}H${end}`} />}
        {cell.entry === 'rail' && cell.rail !== 'end' && <Line segment="hook" settled={settled} d={`M${RAIL} ${cy}H${end}`} />}
        {cell.entry === 'alone' && <Line segment="alone" settled={settled} d={`M${TRUNK} ${cy - TURN}A${TURN} ${TURN} 0 0 0 ${TRUNK + TURN} ${cy}H${end}`} />}
        {cell.entry === 'stop' && <Line segment="stop" settled={settled} d={`M${SIDE} 0V${cy - RING}`} />}
        {cell.more && <Line segment="more" settled={settled} d={`M${SIDE} ${cy + RING}V${ROW}`} />}
        <circle cx={side ? SIDE : TRUNK} cy={cy} r={mark === 'speck' ? SPECK : RING} data-mark={mark} data-side={side ? '' : undefined} />
      </svg>
      {cell.down && <i style={{ left: TRUNK - 0.5 }} />}
      {railBelow && <i style={{ left: RAIL - 0.5 }} />}
      {cell.more && <i style={{ left: SIDE - 0.5 }} />}
    </span>
  )
}

/** 这一次是针对什么：命令里写的关键词、名字；命令里只有编号时，用结果里那一条的标题（比如看的是哪个帖子）。 */
function subjectOf(call: TraceCall): string | undefined {
  const outcome = call.done?.outcome
  return call.action.about ?? (outcome?.count === 1 ? outcome.titles?.[0] : undefined)
}

/** 查网站的一站失败了，结果标红；本地操作偶尔出错是常事，不标。 */
const flagged = (stop: Stop) => stop.kind !== 'other' && stop.status === 'failed'

/** 行尾那一小格：拿到几条、失败。没什么可说的就空着。 */
function stopResult(stop: Stop): string {
  if (stop.status === 'running') return '进行中'
  if (stop.status === 'stopped') return '已中断'
  if (flagged(stop)) return '失败'
  const outcome = stop.call.done?.outcome
  if (stop.kind === 'other' || outcome?.count === undefined) return ''
  // 只拿到一条、这一条的标题已经写在前面了（打开的是哪个帖子），就不再写「1 条」。
  if (outcome.count === 1 && stop.call.action.about === undefined && outcome.titles?.[0] !== undefined) return ''
  return `${outcome.count} 条`
}

/** 点开一行看到的：用时、失败的原因、拿到的前几条；想看原始命令再点「看命令」。 */
function Detail({ stop }: { stop: Stop }) {
  const [showCommand, setShowCommand] = useState(false)
  const { call } = stop, outcome = call.done?.outcome
  return (
    <div className="campus-trace-detail">
      {outcome?.ok === false && <p className="campus-trace-error">{outcome.error ?? '这一步失败了'}</p>}
      {stop.ms !== undefined && <p className="campus-trace-note">用时 {formatDuration(stop.ms)}{outcome?.cached ? '，用的是之前存下的结果，这次没有访问网站' : ''}</p>}
      {outcome?.titles && <ul className="campus-trace-list">{outcome.titles.map((title, index) => <li key={index}>{title}</li>)}</ul>}
      {call.action.link && <p className="campus-trace-note">{call.action.link}</p>}
      <Button size="sm" variant="outline" icon={<IconCodeOutlineRegular size={14} />} onClick={() => { setShowCommand(value => !value) }}>
        {showCommand ? '收起命令' : '看命令'}
      </Button>
      {showCommand && <pre className="campus-trace-command">{call.action.command}</pre>}
    </div>
  )
}

function StopRow({ stop, site, cell, open, onToggle }: {
  stop: Stop
  site?: string
  cell: Cell
  open: boolean
  onToggle: () => void
}) {
  const local = stop.kind === 'other', settled = useSettled()
  const { label } = stop, about = subjectOf(stop.call)
  const state: RowState = stop.status === 'failed' && local ? 'done' : stop.status
  return (
    <li className="campus-trace-row" data-state={state} data-kind={stop.kind} data-failed={flagged(stop) ? '' : undefined}>
      <span className="campus-trace-site">{site}</span>
      <Graph cell={cell} mark={local ? 'speck' : 'ring'} settled={settled} />
      <div className="campus-trace-cell">
        <button type="button" className="campus-trace-line" aria-expanded={open} title={[stop.site, label, about].filter(Boolean).join('，')} onClick={onToggle}>
          <span className="campus-trace-what">
            {label}
            {about && <span className="campus-trace-about">{about}</span>}
          </span>
          <span className="campus-trace-result">{stopResult(stop)}</span>
        </button>
        {open && <Detail stop={stop} />}
      </div>
    </li>
  )
}

/** 路线两头的一行：你的问题、回答。 */
function EndRow({ ask, state, cell, text, title }: { ask: boolean, state: RowState, cell: Cell, text: string | undefined, title?: string }) {
  const settled = useSettled()
  return (
    <li className="campus-trace-row" data-end="" data-state={state}>
      <span className="campus-trace-site">{ask ? '你的问题' : '回答'}</span>
      <Graph cell={cell} mark={ask || state === 'done' ? 'solid' : 'ring'} settled={settled} />
      <div className="campus-trace-cell">
        <div className="campus-trace-line" title={title}>
          <span className="campus-trace-what">{text}</span>
        </div>
      </div>
    </li>
  )
}

/** 顶上那一句：去了哪几个网站、一共多少步。网站多于三个时只写前三个。 */
function summary(route: TurnRoute): string {
  const sites = route.sites
  const names = sites.length === 0 ? (route.open ? '还没有查网站' : '没有查网站')
    : sites.length > 3 ? `${sites.slice(0, 3).join('、')} 等 ${sites.length} 个网站` : sites.join('、')
  return route.steps === 0 ? names : `${names}，共 ${route.steps} 步`
}

function answerLine(route: TurnRoute): string {
  if (route.open) return '还没有回答'
  if (route.aborted) return '已中断'
  return route.ms === undefined ? '已回答' : `用了 ${formatDuration(route.ms)}`
}

const rowId = (row: RowModel): string => row.type === 'stop' ? row.stop.id : row.type

/** 一轮的整条路线。 */
function Route({ route }: { route: TurnRoute }) {
  const [opened, setOpened] = useState<string | undefined>()
  const all = useMemo(() => layout(route), [route])
  const grown = useGrowth(useMemo(() => all.map(rowId), [all]))
  const rows = all.filter(row => grown.has(rowId(row)))
  const list = useRef<HTMLOListElement>(null)
  // 对话进行时新的一行出现，就把正在做的那一行带进视野（它可能接在前面某条支线下面）；没有正在做的就带最后一行。
  useEffect(() => {
    if (!route.open) return
    const running = list.current?.querySelectorAll(':scope > [data-state="running"]')
    const target = running?.[running.length - 1] ?? list.current?.lastElementChild
    target?.scrollIntoView({ block: 'nearest' })
  }, [route.open, rows.length])
  const answer: RowState = route.open ? 'pending' : route.aborted ? 'stopped' : 'done'
  return (
    <section className="campus-trace-turn">
      <p className="campus-trace-summary">{summary(route)}</p>
      <ol className="campus-trace-route" ref={list}>
        {rows.map((row) => {
          if (row.type === 'stop') {
            const id = row.stop.id
            return <StopRow key={id} stop={row.stop} site={row.site} cell={row.cell} open={opened === id} onToggle={() => { setOpened(current => current === id ? undefined : id) }} />
          }
          const ask = row.type === 'ask'
          return <EndRow key={row.type} ask={ask} state={ask ? 'done' : answer} cell={row.cell} text={ask ? route.question : answerLine(route)} title={ask ? route.question : undefined} />
        })}
      </ol>
    </section>
  )
}

export function TraceTab({ useTrace }: TraceTabProps) {
  const snapshot = useTrace(value => value)
  const routes = useMemo(() => snapshot ? buildRoutes(snapshot) : [], [snapshot])
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set())
  if (routes.length === 0) {
    return <div className="campus-trace"><p className="campus-trace-empty">发出问题后，这里会显示助手查了哪些网站。</p></div>
  }
  const latest = routes[routes.length - 1]!
  const flip = (turn: number) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(turn)) next.add(turn)
      return next
    })
  }
  return (
    <div className="campus-trace">
      {routes.slice(0, -1).map((route) => {
        const open = expanded.has(route.turn)
        return (
          <div key={route.turn} className="campus-trace-earlier">
            <button type="button" className="campus-trace-fold" aria-expanded={open} onClick={() => { flip(route.turn) }}>
              <span className="campus-trace-question">{route.question ?? `第 ${route.turn} 轮`}</span>
              <span className="campus-trace-result">{route.sites.length === 0 ? '' : `${route.sites.length} 个网站`}</span>
            </button>
            {open && <Route route={route} />}
          </div>
        )
      })}
      <Route key={latest.turn} route={latest} />
    </div>
  )
}
