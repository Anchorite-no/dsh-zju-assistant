/**
 * 日程表：侧栏上引擎「自动化任务」的那一项换成这一页，位置不变（插槽里同一个 id，priority 低一级，引擎那一项就不画了）。
 * 顶上两个页签：「日程」是一周的课表格子，课、考试、备忘录里写了时间的事、作业的截止都按时间放进格子；
 * 「定时任务」原样放引擎自己的任务页。
 * 格子是固定的：一天 13 节，每节一样高，事情多了也不会把页面撑长，和手机上的课表一个样子；
 * 每节多高按窗口的高度算，默认大小的窗口不用上下滚就能看到第 13 节。
 * 课怎么排进具体日期（校历、周次、单双周、放假和调休）在 ui/profile/calendar.mjs，校历和放假安排在 ui/profile/holidays.mjs，
 * 课表和考试的缓存在 ui/profile/schedule.mjs。
 */
import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { PropsRenderSlots, StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
import {
  Button, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular, IconPlusOutlineRegular, IconRefreshOutlineRegular,
  IconTrashOutlineRegular, Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  TERM_NAMES, TERM_WEEKS, WEEKDAY_NAMES, ZJU_PERIODS, addDays, beijing, mondayOf, planDays, weekdayOf,
  type Calendar, type CalendarDay, type DaySource, type PlanData, type PlanDay, type PlanItem,
} from '../profile/calendar.mjs'
import { errorText, profileApi } from './api.ts'
import { Alert, Crumb } from './controls.tsx'
import { handToAssistant } from './handoff.tsx'
import { openPlugin } from './PluginsPage.tsx'
import { agoText, useNow } from './when.ts'
import { place, rowAt, type Period, type Pinned, type Placed } from './grid.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** 日程表「定时任务」页签里放的引擎任务页。 */
    'campus.schedule.tasks': { kind: 'single', scope: 'root' }
  }
}

/** 引擎任务页登记的侧栏和主区域的 id，这一页用同一个，盖住它。 */
const PANEL_ID = 'schedules' as MainPanelId
const TASKS_SLOT = 'campus.schedule.tasks'

interface Source { id: 'timetable' | 'exams', name: string, state: 'ready' | 'account' | 'off', plugin: string, fetchedAt: string | null, error: string | null }
/** 引擎侧 schedule.mjs 的 snapshot。 */
interface Snapshot extends PlanData {
  today: string
  calendar: Calendar & { problem?: string }
  /** 用户自己填的那一层，和应用自己知道的那两层（浙大的校历、国家的放假安排）。 */
  custom: Calendar & { problem?: string }
  builtin: Calendar
  /** 还没有国家放假安排的年份。 */
  unpublished: number[]
  failed: Record<string, string>
  sources: Source[]
}
interface State { snapshot: Snapshot | null, busy: readonly string[], error: string }
type Mode = 'plan' | 'tasks'

// ── 页面外面的状态：离开这一页再回来，照上一次的画，正在进行的读取也不会断 ──

let state: State = { snapshot: null, busy: [], error: '' }
/** 现在看的是哪个页签、哪一周（那一周的周一）；引擎的任务页在不在（定时任务插件关着时没有）。 */
let mode: Mode = 'plan'
let shown: string | null = null
let tasksReady = false
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const emit = () => { for (const listener of [...listeners]) listener() }
const update = (patch: Partial<State>) => { state = { ...state, ...patch }; emit() }
const setMode = (next: Mode) => { mode = next; emit() }
const setShown = (next: string) => { shown = next; emit() }
/** 这一次进页面已经去要过的学期课表，同一个不再要（读失败时后台自己隔一阵才重试）。 */
const asked = new Set<string>()

/** 读一样东西：同一样同时只读一次，读完换上新的内容。 */
async function load(key: string, input: object): Promise<void> {
  if (state.busy.includes(key)) return
  update({ busy: [...state.busy, key] })
  try { update({ snapshot: await profileApi<Snapshot>('schedule-refresh', input) }) }
  catch (error) { update({ error: errorText(error) }) }
  finally { update({ busy: state.busy.filter(item => item !== key) }) }
}

/**
 * 进页面、回到窗口、点刷新时调用。先拿缓存，再让后台去教务网读课表和考试，缺哪年的国家放假安排也去取；
 * 刚读过的后台自己会跳过，force 时照读。
 */
async function visit(force = false): Promise<void> {
  let snapshot: Snapshot
  try { snapshot = await profileApi<Snapshot>('schedule-read') } catch (error) { update({ error: errorText(error) }); return }
  asked.clear()
  update({ snapshot, error: '' })
  // 作业交没交，让校园事务页去学在浙大和 PTA 读一次，交过的这里标成已完成。
  const reads = [load('tasks', { source: 'tasks', force }), ...(snapshot.unpublished.length ? [load('holidays', { source: 'holidays' })] : [])]
  if (snapshot.sources[0]?.state === 'ready') reads.push(load('timetable', { source: 'timetable', force }), load('exams', { source: 'exams', force }))
  await Promise.all(reads)
}

/** 别的地方要打开日程表的某个页签时用（比如插件页「自动化任务」里的「打开任务页」）。 */
let select: () => void = () => {}
export function openSchedule(next: Mode = 'plan'): void { setMode(next); select() }

// ── 课表格子 ──────────────────────────────────────────

const monthDay = (date: string) => `${+date.slice(5, 7)}月${+date.slice(8, 10)}日`
const shortDate = (date: string) => `${+date.slice(5, 7)}/${+date.slice(8, 10)}`
const termName = (key: string) => `${key.slice(0, 9)} ${key.slice(10)}学期`

const KIND_LABEL: Record<PlanItem['kind'], string> = { class: '', exam: '考试', due: '截止', event: '' }
const FROM_NAME: Record<string, string> = { memo: '备忘录', xuezai: '学在浙大', pta: 'PTA', zdbk: '教务网' }

/** 鼠标放上去看到的：时间、老师、节次、周次、地点，或者是哪门课、从哪来的。 */
function hint(item: PlanItem): string {
  const time = item.time ? (item.end && item.kind !== 'due' ? `${item.time}–${item.end}` : item.time) : ''
  if (item.kind === 'class') {
    const weeks = [item.weeks, item.weekPattern === '每周' ? '' : item.weekPattern].filter(Boolean).join(' ')
    return [item.title, [time, item.periods?.length ? `第 ${item.periods.join('、')} 节` : ''].filter(Boolean).join(' · '), item.teacher, weeks, item.sub].filter(Boolean).join('\n')
  }
  const when = item.kind === 'due' ? `${item.date ? `${monthDay(item.date)} ` : ''}${item.time ?? ''} 截止${item.done ? '，已交' : ''}` : time
  return [`${KIND_LABEL[item.kind] ? `${KIND_LABEL[item.kind]}：` : ''}${item.title}`, when, item.sub, item.from && FROM_NAME[item.from] && `来自${FROM_NAME[item.from]}`].filter(Boolean).join('\n')
}

/** 格子里的一块。课只写名字和地点（时间看左边的节次）；考试和备忘写上时间。正在上的那一节加一道外框。 */
function Block({ placed, live, loose }: { placed: Placed, live: boolean, loose: boolean }) {
  const { item, top, bottom, lane, lanes } = placed
  const style = {
    '--campus-block-top': top, '--campus-block-span': bottom - top, '--campus-block-lane': lane, '--campus-block-lanes': lanes,
  } as CSSProperties
  const odd = loose && item.kind === 'class' && item.weekPattern && item.weekPattern !== '每周' ? item.weekPattern : ''
  return (
    <div className="campus-block" data-kind={item.kind} data-live={live ? '' : undefined} style={style} title={hint(item)}>
      {item.kind !== 'class' && <span className="campus-block-time">{item.time}{KIND_LABEL[item.kind] && ` ${KIND_LABEL[item.kind]}`}</span>}
      <span className="campus-block-title">{item.title}</span>
      {item.sub && <span className="campus-block-sub">{item.sub}</span>}
      {odd && <span className="campus-block-sub">{odd}</span>}
    </div>
  )
}

/**
 * 钉在格子里的一张卡片：上面一行是「23:59 截止」或者「全天」，下面是名字（最多两行）。是哪门课，鼠标放上去看。
 * 交过的作业还在原来的位置，卡片变淡，上面一行换成绿色的「已完成」。
 */
function Pin({ pinned }: { pinned: Pinned }) {
  const { item, top } = pinned
  const when = item.done ? '✓ 已完成' : item.kind === 'due' ? `${item.time ?? ''} 截止`.trim() : item.time ? `${item.time}${KIND_LABEL[item.kind] && ` ${KIND_LABEL[item.kind]}`}` : '全天'
  return (
    <div className="campus-pin" data-kind={item.kind} data-done={item.done ? '' : undefined} style={{ '--campus-block-top': top } as CSSProperties} title={hint(item)}>
      <span className="campus-pin-when">{when}</span>
      <span className="campus-pin-title">{item.title}</span>
    </div>
  )
}

/** 表头里这一天的标记：放假、调休、补课。 */
function DayMark({ day }: { day: PlanDay }) {
  if (day.off) {
    const why = day.off.note || '放假'
    return <span className="campus-mark" data-kind="off" title={day.off.moved ? `${why}，这天的课挪到 ${monthDay(day.off.moved)} 上` : `${why}，停课`}>{why}</span>
  }
  if (day.swap) {
    const text = `上${WEEKDAY_NAMES[day.swap.weekday - 1]}的课`
    return <span className="campus-mark" data-kind="swap" title={`${day.swap.note || '调休'}：这天上 ${monthDay(day.swap.as)}（${WEEKDAY_NAMES[day.swap.weekday - 1]}）的课`}>{text}</span>
  }
  return null
}

function WeekGrid({ days, periods, today, clock }: { days: PlanDay[], periods: readonly Period[], today: string, clock: string }) {
  const placedDays = days.map(day => ({ day, ...place(day.items, periods) }))
  const nowRow = rowAt(clock, periods)
  const showNow = clock >= periods[0]!.startTime && clock <= periods.at(-1)!.endTime
  return (
    <div className="campus-grid" style={{ '--campus-periods': periods.length } as CSSProperties}>
      <div className="campus-grid-corner" />
      {days.map(day => (
        <div key={day.date} className="campus-grid-head" data-today={day.date === today ? '' : undefined} data-past={day.date < today ? '' : undefined}>
          <span className="campus-grid-dayline">
            <span className="campus-grid-weekday">{WEEKDAY_NAMES[day.weekday - 1]!.slice(1)}</span>
            <span className="campus-grid-date">{day.date === today ? '今天' : shortDate(day.date)}</span>
          </span>
          <DayMark day={day} />
        </div>
      ))}
      <div className="campus-grid-axis">
        {periods.map(period => (
          <div key={period.period} className="campus-grid-period">
            <span>{period.startTime}</span>
            <b>{period.period}</b>
          </div>
        ))}
      </div>
      {placedDays.map(({ day, grid, pins }) => {
        const isToday = day.date === today
        return (
          <div key={day.date} className="campus-grid-day" data-today={isToday ? '' : undefined} data-off={day.off ? '' : undefined} aria-label={`${monthDay(day.date)} ${WEEKDAY_NAMES[day.weekday - 1]}`}>
            {day.off && (
              <span className="campus-grid-offnote">
                {day.off.note || '放假'}<br />{day.off.moved ? `课挪到 ${shortDate(day.off.moved)}` : '停课'}
              </span>
            )}
            {grid.map((placed, index) => (
              <Block key={`${placed.item.kind}:${placed.item.title}:${placed.item.time ?? ''}:${index}`} placed={placed} loose={!!day.loose}
                live={isToday && !!placed.item.time && !!placed.item.end && placed.item.time <= clock && clock < placed.item.end} />
            ))}
            {pins.map((pinned, index) => <Pin key={`${pinned.item.kind}:${pinned.item.title}:${index}`} pinned={pinned} />)}
            {isToday && showNow && <span className="campus-grid-now" style={{ '--campus-block-top': nowRow } as CSSProperties} />}
            {day.missing && grid.every(placed => placed.item.kind !== 'class') && <span className="campus-grid-missing">课表还没读到</span>}
          </div>
        )
      })}
    </div>
  )
}

/** 这一周在校历里是哪个学期第几周：看周一到周日里第一个在学期里的那天。 */
function weekLabel(days: PlanDay[]): string {
  const at = days.find(day => day.term)?.term
  return at ? `${at.term}学期第 ${at.week} 周` : ''
}

function handCalendar(snapshot: Snapshot | null): Promise<void> {
  const year = snapshot?.current?.slice(0, 9) ?? '这'
  return handToAssistant(`帮我把校历填进日程表：用 zju 技能查本科生院公布的 ${year} 学年校历，和这学期的放假、调课通知，找出每个小学期第 1 周的周一、哪几天停课、哪天补课上哪天的课。先把要写的几条和原文链接列给我看，我确认了再用 campus_calendar_write 写进去。`)
}

/** 「日程」页签：顶上一行是两个页签、哪一周、刷新和校历，下面是课表格子。 */
function PlanView({ tabs, onCalendar }: { tabs: ReactNode, onCalendar: () => void }) {
  const { snapshot, busy, error } = useSyncExternalStore(subscribe, () => state)
  const now = useNow()
  const here = beijing(now)
  // 日期一律按北京时间算，和课表、截止时间用的是同一个钟。
  const today = here.date
  const monday = useSyncExternalStore(subscribe, () => shown) ?? mondayOf(today)
  const [handError, setHandError] = useState('')

  useEffect(() => {
    void visit()
    const refresh = () => { void visit() }
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener('focus', refresh) }
  }, [])

  const data: PlanData = snapshot ?? { calendar: { terms: [], days: [] }, timetables: {}, current: null, events: [] }
  const days = planDays(data, monday, addDays(monday, 6))
  // 这一周落在别的学期（比如冬学期）、那个学期的课表还没读过时，去教务网要那一个。
  const missing = [...new Set(days.map(day => day.missing).filter((key): key is string => !!key))]
  useEffect(() => {
    if (snapshot?.sources[0]?.state !== 'ready') return
    for (const key of missing) {
      if (asked.has(key)) continue
      asked.add(key)
      void load(`term:${key}`, { source: 'timetable', term: key })
    }
  }, [missing.join(','), snapshot?.sources[0]?.state])

  const reading = busy.length > 0
  const thisWeek = mondayOf(today)
  const source = snapshot?.sources[0]
  const known = !!snapshot?.current && snapshot.calendar.terms.some(term => `${term.year}|${term.term}` === snapshot.current)
  const label = weekLabel(days)
  const outside = known && !reading && days.every(day => !day.term) && !days.some(day => day.loose)
  const table = snapshot?.current ? snapshot.timetables[snapshot.current] : undefined
  const periods: readonly Period[] = table?.periodTimes?.length ? table.periodTimes : ZJU_PERIODS
  const unpublished = (snapshot?.unpublished ?? []).filter(year => days.some(day => day.date.startsWith(String(year))))

  const notices: ReactNode[] = []
  if (error) notices.push(<Alert key="error">{error}</Alert>)
  if (handError) notices.push(<Alert key="hand">{handError}</Alert>)
  if (source && source.state !== 'ready') {
    notices.push(
      <Alert key="account" tone="warn">
        {source.state === 'off' ? '「课程与作业」插件关着，课表和考试没有读。' : '浙大统一身份认证的账号还没填，课表和考试读不到。'}
        <Button size="sm" variant="outline" onClick={() => { openPlugin(source.plugin) }}>{source.state === 'off' ? '去打开' : '去填账号'}</Button>
      </Alert>,
    )
  }
  for (const item of snapshot?.sources ?? []) {
    if (item.state === 'ready' && item.error) {
      notices.push(<Alert key={`source:${item.id}`} tone="warn">{item.name}这次没从教务网读到（{item.error}）{item.fetchedAt ? `，下面是${agoText(Date.parse(item.fetchedAt), now)}读到的。` : '。'}</Alert>)
    }
  }
  if (snapshot?.calendar.problem) notices.push(<Alert key="problem">{snapshot.calendar.problem}</Alert>)
  if (snapshot?.current && !known) {
    notices.push(
      <div key="calendar" className="campus-plan-notice">
        <p>应用里还没有 {termName(snapshot.current)}的校历，课先照课表每周排上，没算单双周、放假和调休。填上第 1 周是哪天，课就按日期排。</p>
        <div className="campus-actions">
          <Button size="sm" variant="outline" onClick={onCalendar}>填校历</Button>
          <Button size="sm" variant="outline" onClick={() => { setHandError(''); handCalendar(snapshot).catch((reason: unknown) => { setHandError(errorText(reason)) }) }}>让助手查</Button>
        </div>
      </div>,
    )
  }
  for (const key of missing) {
    if (snapshot?.failed[key] && !busy.includes(`term:${key}`)) notices.push(<Alert key={`missing:${key}`} tone="warn">{termName(key)}的课表没读到：{snapshot.failed[key]}</Alert>)
  }

  return (
    <div className="campus-page campus-plan">
      <div className="campus-plan-head">
        {tabs}
        <div className="campus-plan-nav">
          <Button size="sm" variant="ghost" aria-label="上一周" icon={<IconChevronLeftOutlineRegular size={14} />} onClick={() => { setShown(addDays(monday, -7)) }} />
          <Button size="sm" variant="outline" disabled={monday === thisWeek} onClick={() => { setShown(thisWeek) }}>本周</Button>
          <Button size="sm" variant="ghost" aria-label="下一周" icon={<IconChevronRightOutlineRegular size={14} />} onClick={() => { setShown(addDays(monday, 7)) }} />
          <h2 className="campus-plan-range">
            {monthDay(monday)} – {monday.slice(5, 7) === addDays(monday, 6).slice(5, 7) ? `${+addDays(monday, 6).slice(8, 10)}日` : monthDay(addDays(monday, 6))}
            <span className="campus-plan-week">{label || (outside ? '不在教学周' : '')}</span>
          </h2>
        </div>
        <div className="campus-actions">
          <Button size="sm" variant="ghost" aria-label="刷新" className="campus-plan-refresh" data-busy={reading ? '' : undefined} disabled={reading}
            icon={<IconRefreshOutlineRegular size={14} />} onClick={() => { void visit(true) }} />
          <Button size="sm" variant="outline" onClick={onCalendar}>校历</Button>
        </div>
      </div>
      {notices.length > 0 && <div className="campus-plan-notices">{notices}</div>}
      <WeekGrid days={days} periods={periods} today={today} clock={here.time} />
      {unpublished.length > 0 && <p className="campus-note">{unpublished.join('、')} 年的放假安排国务院还没公布，公布以后这里会自己排上放假和调休。</p>}
    </div>
  )
}

// ── 校历 ──────────────────────────────────────────────

interface TermDraft { year: string, term: string, start: string, weeks: string }
interface DayDraft { date: string, kind: 'off' | 'swap', other: string, note: string }

const SOURCE_NAME: Record<DaySource, string> = { custom: '自己填的', school: '学校校历', national: '国家安排' }

function draftOf(calendar: Calendar): { terms: TermDraft[], days: DayDraft[] } {
  return {
    terms: calendar.terms.map(term => ({ year: term.year, term: term.term, start: term.start, weeks: String(term.weeks) })),
    days: calendar.days.map(day => ({ date: day.date, kind: day.as ? 'swap' as const : 'off' as const, other: day.as ?? day.until ?? '', note: day.note ?? '' })),
  }
}

/** 一个特殊的日子说成一句话：哪天、怎么上课。 */
function dayText(day: CalendarDay): string {
  const when = `${monthDay(day.date)}${day.until ? ` 到 ${monthDay(day.until)}` : `（${WEEKDAY_NAMES[weekdayOf(day.date) - 1]}）`}`
  if (day.as) return `${when} ${day.note || '调休'}，上 ${monthDay(day.as)}（${WEEKDAY_NAMES[weekdayOf(day.as) - 1]}）的课`
  return `${when} ${day.note || '放假'}，${day.moved ? `这天的课挪到 ${monthDay(day.moved)} 上` : '停课'}`
}

/**
 * 应用排进去的放假、调休和补课，从一个月前到一年后。同一天有好几条时只列算数的那一条；
 * 连着放假、同一个原因、课都不挪的几天并成一行。
 */
function knownDays(calendar: Calendar, today: string): CalendarDay[] {
  const first = new Map<string, CalendarDay>()
  for (const day of calendar.days) {
    if ((day.until ?? day.date) < addDays(today, -31) || day.date > addDays(today, 366) || first.has(day.date)) continue
    first.set(day.date, day)
  }
  const merged: CalendarDay[] = []
  for (const day of [...first.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    const last = merged.at(-1)
    if (day.off && !day.moved && !day.until && last?.off && !last.moved && last.note === day.note && last.source === day.source && addDays(last.until ?? last.date, 1) === day.date) last.until = day.date
    else merged.push({ ...day })
  }
  return merged
}

function CalendarEditor({ snapshot, today, onBack, onSaved }: { snapshot: Snapshot | null, today: string, onBack: () => void, onSaved: () => void }) {
  const [draft, setDraft] = useState(() => draftOf(snapshot?.custom ?? { terms: [], days: [] }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const setTerm = (index: number, patch: Partial<TermDraft>) => { setDraft(old => ({ ...old, terms: old.terms.map((item, i) => i === index ? { ...item, ...patch } : item) })) }
  const setDay = (index: number, patch: Partial<DayDraft>) => { setDraft(old => ({ ...old, days: old.days.map((item, i) => i === index ? { ...item, ...patch } : item) })) }
  const calendar = snapshot?.calendar ?? { terms: [], days: [] }
  const custom = snapshot?.custom ?? { terms: [], days: [] }
  const mine = (year: string, term: string) => custom.terms.some(item => item.year === year && item.term === term)
  const lastYear = draft.terms.at(-1)?.year ?? snapshot?.current?.slice(0, 9) ?? ''

  async function save() {
    setBusy(true); setError('')
    try {
      // 第 1 周还没填日期的那几行、没填日期的特殊日子不存。
      const terms = draft.terms.filter(item => item.start).map(item => ({ year: item.year.trim(), term: item.term, start: item.start, weeks: Number(item.weeks) || TERM_WEEKS }))
      const days = draft.days.filter(item => item.date).map(item => item.kind === 'swap'
        ? { date: item.date, as: item.other, note: item.note.trim() }
        : { date: item.date, off: true, ...(item.other ? { until: item.other } : {}), note: item.note.trim() })
      update({ snapshot: await profileApi<Snapshot>('calendar-save', { terms, days }) })
      onSaved()
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }

  return (
    <div className="campus-page">
      <div className="campus-detail campus-calendar">
        <Crumb text="日程" onBack={onBack} />
        <div className="campus-detail-main">
          <h1 className="campus-page-title">校历</h1>
          <p className="campus-detail-desc">学期哪天开始、哪天放假和调休，应用照浙大本科生院公布的校历和国务院的放假安排自己排好了，下面列着。学校另外通知了停课、补课，或者有不对的，在「自己补充」里写上，补的优先。</p>
        </div>
        {error && <Alert>{error}</Alert>}
        <section className="campus-section" aria-label="学期">
          <h2 className="campus-section-title">学期</h2>
          <ul className="campus-rows">
            {calendar.terms.map(term => (
              <li key={`${term.year}|${term.term}`} className="campus-row campus-calendar-known">
                <span className="campus-row-title">{term.year} {term.term}学期</span>
                <span>{monthDay(term.start)}（周一）起，{term.weeks} 周</span>
                <span className="campus-calendar-source">{mine(term.year, term.term) ? '自己填的' : '学校校历'}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="campus-section" aria-label="放假和调休">
          <h2 className="campus-section-title">放假、调休和补课</h2>
          <ul className="campus-rows">
            {knownDays(calendar, today).map(day => (
              <li key={`${day.date}:${day.source ?? ''}`} className="campus-row campus-calendar-known" data-past={(day.until ?? day.date) < today ? '' : undefined}>
                <span>{dayText(day)}</span>
                <span className="campus-calendar-source">{SOURCE_NAME[day.source ?? 'custom']}</span>
              </li>
            ))}
          </ul>
          {snapshot && snapshot.unpublished.length > 0 && <p className="campus-note">{snapshot.unpublished.join('、')} 年的放假安排国务院还没公布，公布以后会自己排上。</p>}
        </section>
        <section className="campus-section" aria-label="自己补充">
          <div className="campus-section-head">
            <h2 className="campus-section-title">自己补充</h2>
            <div className="campus-actions">
              <Button size="sm" variant="ghost" icon={<IconPlusOutlineRegular size={14} />} disabled={busy}
                onClick={() => { setDraft(old => ({ ...old, days: [...old.days, { date: '', kind: 'off', other: '', note: '' }] })) }}>加一天</Button>
              <Button size="sm" variant="ghost" icon={<IconPlusOutlineRegular size={14} />} disabled={busy}
                onClick={() => { setDraft(old => ({ ...old, terms: [...old.terms, { year: lastYear, term: '', start: '', weeks: String(TERM_WEEKS) }] })) }}>加学期</Button>
            </div>
          </div>
          {draft.terms.length === 0 && draft.days.length === 0 && <p className="campus-note">没有。比如学校通知某天开运动会停课、哪个周六补哪天的课，加一天写上。</p>}
          {draft.days.length > 0 && (
            <div className="campus-calendar-rows" data-kind="days">
              <span className="campus-calendar-label">日期</span><span className="campus-calendar-label">怎么安排</span>
              <span className="campus-calendar-label">停到哪天 / 上哪天的课</span><span className="campus-calendar-label">说明</span><span />
              {draft.days.map((item, index) => (
                <div key={index} className="campus-calendar-row">
                  <input className="campus-input" type="date" aria-label="日期" value={item.date} disabled={busy} onChange={(event) => { setDay(index, { date: event.target.value }) }} />
                  <select className="campus-input" aria-label="怎么安排" value={item.kind} disabled={busy} onChange={(event) => { setDay(index, { kind: event.target.value as DayDraft['kind'], other: '' }) }}>
                    <option value="off">停课</option>
                    <option value="swap">上另一天的课</option>
                  </select>
                  <input className="campus-input" type="date" aria-label={item.kind === 'swap' ? '上哪天的课' : '停到哪天（只停一天可以不填）'} value={item.other} disabled={busy}
                    onChange={(event) => { setDay(index, { other: event.target.value }) }} />
                  <input className="campus-input" aria-label="说明" placeholder={item.kind === 'swap' ? '如 运动会补课' : '如 校运动会'} maxLength={40} value={item.note} disabled={busy} onChange={(event) => { setDay(index, { note: event.target.value }) }} />
                  <Button size="sm" variant="ghost" aria-label="删除这一天" icon={<IconTrashOutlineRegular size={14} />} disabled={busy}
                    onClick={() => { setDraft(old => ({ ...old, days: old.days.filter((_, i) => i !== index) })) }} />
                </div>
              ))}
            </div>
          )}
          {draft.terms.length > 0 && (
            <div className="campus-calendar-rows" data-kind="terms">
              <span className="campus-calendar-label">学年</span><span className="campus-calendar-label">学期</span>
              <span className="campus-calendar-label">第 1 周的周一</span><span className="campus-calendar-label">周数</span><span />
              {draft.terms.map((item, index) => (
                <div key={index} className="campus-calendar-row">
                  <input className="campus-input" aria-label="学年" placeholder="2027-2028" value={item.year} disabled={busy} onChange={(event) => { setTerm(index, { year: event.target.value }) }} />
                  <select className="campus-input" aria-label="学期" value={item.term} disabled={busy} onChange={(event) => { setTerm(index, { term: event.target.value }) }}>
                    <option value="" disabled>选择</option>
                    {TERM_NAMES.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                  <input className="campus-input" type="date" aria-label="第 1 周的周一" value={item.start} disabled={busy} onChange={(event) => { setTerm(index, { start: event.target.value }) }} />
                  <input className="campus-input" type="number" min={1} max={30} aria-label="周数" value={item.weeks} disabled={busy} onChange={(event) => { setTerm(index, { weeks: event.target.value }) }} />
                  <Button size="sm" variant="ghost" aria-label="删除这个学期" icon={<IconTrashOutlineRegular size={14} />} disabled={busy}
                    onClick={() => { setDraft(old => ({ ...old, terms: old.terms.filter((_, i) => i !== index) })) }} />
                </div>
              ))}
            </div>
          )}
        </section>
        <div className="campus-form-foot">
          <button type="button" className="campus-save" disabled={busy} onClick={() => { void save() }}>保存</button>
          <button type="button" className="campus-cancel" disabled={busy} onClick={onBack}>取消</button>
          <span className="campus-plan-foot-gap" />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => { handCalendar(snapshot).catch((reason: unknown) => { setError(errorText(reason)) }) }}>让助手查学校通知</Button>
        </div>
      </div>
    </div>
  )
}

// ── 整页 ──────────────────────────────────────────────

const TABS: readonly { value: Mode, label: string }[] = [{ value: 'plan', label: '日程' }, { value: 'tasks', label: '定时任务' }]

function SchedulePage(props: PropsRenderSlots<typeof TASKS_SLOT>) {
  const current = useSyncExternalStore(subscribe, () => mode)
  const ready = useSyncExternalStore(subscribe, () => tasksReady)
  const [screen, setScreen] = useState<'week' | 'calendar'>('week')
  const [toast, setToast] = useState<{ text: string, seq: number } | null>(null)
  const snapshot = useSyncExternalStore(subscribe, () => state.snapshot)
  const [handError, setHandError] = useState('')

  if (current === 'plan' && screen === 'calendar') {
    return (
      <div className="campus-schedule">
        <CalendarEditor snapshot={snapshot} today={beijing(Date.now()).date} onBack={() => { setScreen('week') }}
          onSaved={() => { setScreen('week'); setToast(old => ({ text: '校历已保存', seq: (old?.seq ?? 0) + 1 })) }} />
      </div>
    )
  }

  const tabs = (
    <div className="campus-schedule-tabs" role="tablist" aria-label="日程表">
      {TABS.map(tab => (
        <button key={tab.value} type="button" role="tab" aria-selected={current === tab.value} onClick={() => { setMode(tab.value) }}>{tab.label}</button>
      ))}
    </div>
  )
  return (
    <div className="campus-schedule" data-mode={current}>
      {current === 'tasks' && (
        <header className="campus-schedule-bar">
          {tabs}
          {/* 定时任务由助手在对话里建：开一个新对话，话先写进输入框，补上要做什么、什么时候。 */}
          {ready && (
            <Button size="sm" variant="primary" icon={<IconPlusOutlineRegular size={13} />}
              onClick={() => { setHandError(''); handToAssistant('帮我建一个定时任务「」：').catch((reason: unknown) => { setHandError(errorText(reason)) }) }}>新建</Button>
          )}
        </header>
      )}
      {current === 'plan'
        ? <PlanView tabs={tabs} onCalendar={() => { setScreen('calendar') }} />
        : ready
          ? (
            <div className="campus-schedule-tasks">
              {handError && <div className="campus-schedule-tasks-alert"><Alert>{handError}</Alert></div>}
              {props.renderSlot(TASKS_SLOT, {})}
            </div>
          )
          : (
            <div className="campus-page">
              <Alert tone="warn">
                「自动化任务」插件关着，定时任务用不了。
                <Button size="sm" variant="outline" onClick={() => { openPlugin('automation') }}>去打开</Button>
              </Alert>
            </div>
          )}
      {toast && <Toast key={toast.seq} text={toast.text} onDone={() => { setToast(null) }} />}
    </div>
  )
}

function CalendarIcon({ size }: { size: number, active: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M8 3.5v3M16 3.5v3M4 10h16M8 13.5h2M14 13.5h2M8 16.5h2" />
    </svg>
  )
}

/**
 * 登记日程表：侧栏那一项和主区域那一页都用引擎任务页的 id，priority 比它低一级，引擎那一项就不画了。
 * 引擎的任务页（定时任务插件开着时才有）原样挪进「定时任务」页签：同一个组件、同一份 inject 和文案，登记到我们留的位置上。
 */
export function installSchedulePage(ctx: Context): void {
  ctx.effect(() => {
    select = () => { ctx.layout.selectPanel(PANEL_ID) }
    return () => { select = () => {} }
  }, 'campus-ui: open the schedule page')

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 10, priority: -1, label: '日程表' }, CalendarIcon))
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_ID, priority: -1,
    children: { [TASKS_SLOT]: { kind: 'single', scope: 'root' } },
  }, SchedulePage))

  // 盯着主区域的登记：引擎的任务页来了就挪一份进「定时任务」页签，走了（插件关掉）就撤下。
  ctx.slots.inject(TASKS_SLOT, () => {
    let engine: StoredEntry | undefined
    let dispose: (() => void) | undefined
    const sync = () => {
      const found = ctx.slots.entries('main').find(entry => entry.options.key === PANEL_ID && entry.component !== SchedulePage)
      if (found === engine) return
      dispose?.(); dispose = undefined
      engine = found
      if (found) {
        dispose = (ctx.slots.register as (options: object, component: unknown) => () => void)(
          { name: TASKS_SLOT, ...(found.inject ? { inject: found.inject } : {}), ...(found.locale ? { locale: found.locale } : {}) }, found.component)
      }
      tasksReady = !!found
      emit()
    }
    sync()
    const off = ctx.slots.subscribe('main', sync)
    return () => { off(); dispose?.(); tasksReady = false; emit() }
  })
}
