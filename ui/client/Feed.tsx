/**
 * 校园事务页右边的通知：学校各部门和本人学院新发的通知，加上跟踪的公众号的新文章，按时间从新到旧，默认只看一周内的。
 * 公众号的文章是公众号插件半小时检查一遍攒下的，谁发的那一格前面有一枚「公众号」的小标签，和学校的通知分得开。
 * 和这位学生关系不大的（标题里有屏蔽词，或者模型照个人档案判断的）默认收起，列表下面一行说有几条，点开还在。
 * 列表放在一个定高的框里自己滚动，条数再多页面也不会被拉长。
 * 和左边的作业一样，打开时先照上一次读到的画，后台再去读新的；上次来过之后新出现的，标题前带一个点。
 * 点一条打开原文，右边的图标把它交给助手。数据和缓存在引擎侧的 ui/profile/feed.mjs。
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { errorText, profileApi } from './api.ts'
import { Choice } from './controls.tsx'
import { Flow } from './Flow.tsx'
import { HandIconButton, handToAssistant } from './handoff.tsx'
import { APP_PLUGINS } from './pluginCatalog.ts'
import { openPlugin } from './PluginsPage.tsx'
import { DAY, agoText, clock, dateText, midnight, mixed } from './when.ts'

/** dated 为假的只有日期（学校通知），at 是那天零点。foundAt 是应用第一次读到它的时间。 */
interface Item {
  id: string, kind: 'school' | 'wechat', title: string, from: string, at: string, dated: boolean, url: string, foundAt: string | null
  /** 该不该收起：blocked 标题里有屏蔽词，irrelevant 模型判断关系不大，null 不收起。 */
  hidden: 'blocked' | 'irrelevant' | null
}
/** state：ready 能读，account 账号还没填，off 插件关着。plugin 是去插件页的哪一项处理。 */
interface Source { id: 'school' | 'wechat', name: string, state: 'ready' | 'account' | 'off', plugin: string, fetchedAt: string | null, error: string | null }
interface Snapshot { items: Item[], sources: Source[] }
interface State { snapshot: Snapshot | null, busy: boolean, error: string }

/** 状态放在组件外面：离开这一页再回来直接照上一次的画，正在进行的读取也不会断。 */
let state: State = { snapshot: null, busy: false, error: '' }
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const update = (patch: Partial<State>) => { state = { ...state, ...patch }; for (const listener of [...listeners]) listener() }

/** 进页面、回到窗口、点刷新时调用。先拿缓存，再让后台去读新的；刚读过的后台自己会跳过，force 时照读。 */
export async function visitFeed(force = false): Promise<void> {
  let snapshot: Snapshot
  try { snapshot = await profileApi<Snapshot>('feed-read') } catch (error) { update({ error: errorText(error) }); return }
  update({ snapshot, error: '' })
  // 后台这一趟：学校的通知到点了就读新的，点刷新时连公众号一起催，再把没筛过的筛一遍。两个来源都读不了就不用去。
  if (state.busy || !snapshot.sources.some(source => source.state === 'ready')) return
  update({ busy: true })
  try { update({ snapshot: await profileApi<Snapshot>('feed-refresh', { force }) }) }
  catch (error) { update({ error: errorText(error) }) }
  finally { update({ busy: false }) }
}

/** 通知那一栏现在是不是在读，给页面右上角的刷新按钮用。 */
export function useFeedBusy(): boolean {
  return useSyncExternalStore(subscribe, () => state.busy)
}

/** 默认只看这么久以内发的。 */
const RECENT_MS = 7 * DAY
const RANGES = [{ value: 'recent', label: '一周内' }, { value: 'all', label: '全部' }] as const
type Range = typeof RANGES[number]['value']
/** 上一次看这一栏是什么时候，记在本机；比它晚出现的算新的。 */
const SEEN_KEY = 'campus.feedSeenAt'

const itemKey = (item: Item) => item.id
const pluginTitle = (id: string) => APP_PLUGINS.find(plugin => plugin.id === id)?.title ?? '插件'

/** 哪天发的：今天、昨天，再早写日期；公众号文章当天的带上几点。 */
function whenText(item: Item, now: number): string {
  const at = Date.parse(item.at), days = Math.round((midnight(now) - midnight(at)) / DAY)
  if (days === 0) return item.dated ? `今天 ${clock(new Date(at))}` : '今天'
  return days === 1 ? '昨天' : dateText(at, now)
}

/** 交给助手时替用户写好的那段话。标题和链接照原样写，助手要拿它们去读原文；日期写具体的，过几天再看也不会错。 */
function handoffText(item: Item, now: number): string {
  const what = item.kind === 'wechat' ? `「${item.from}」公众号的这篇文章` : '这条通知'
  const origin = item.kind === 'wechat' ? '' : `${item.from}，`
  const ask = item.kind === 'wechat' ? '讲了什么、有没有要报名或者有截止时间的事' : '和我有没有关系、要我做什么、什么时候截止'
  return `帮我看看${what}：《${item.title}》（${origin}${dateText(Date.parse(item.at), now)}）。原文：${item.url} 。先读全文，告诉我${ask}，再等我说下一步。`
}

/** 一条通知。整行点开原文，右边「交给助手」的图标保留自己的点击；fresh 的标题前带一个点。 */
function NoticeRow({ item, now, fresh, onHand }: { item: Item, now: number, fresh: boolean, onHand: () => void }) {
  return (
    <article className="campus-notice" data-new={fresh ? '' : undefined} data-folded={item.hidden ? '' : undefined}>
      <div className="campus-notice-main">
        <a className="campus-notice-open" href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
        <span className="campus-notice-meta">
          {item.kind === 'wechat'
            ? <span className="campus-notice-account"><span>公众号</span>{item.from}</span>
            : <span>{item.from}</span>}
          <time dateTime={item.at}>{whenText(item, now)}</time>
        </span>
      </div>
      <HandIconButton onClick={onHand} />
    </article>
  )
}

export function FeedColumn({ now }: { now: number }) {
  const { snapshot, busy, error } = useSyncExternalStore(subscribe, () => state)
  const [range, setRange] = useState<Range>('recent')
  // 进这一栏之前上一次是什么时候看的；这一次看完（离开页面）再记成现在。第一次来没有记录，都不算新的。
  const [seenAt] = useState(() => Date.parse(localStorage.getItem(SEEN_KEY) ?? ''))
  useEffect(() => () => { localStorage.setItem(SEEN_KEY, new Date().toISOString()) }, [])

  // 和这位学生关系不大的默认收起，点列表下面那一行展开。
  const [unfolded, setUnfolded] = useState(false)
  const items = snapshot?.items
  const inRange = useMemo(() => (items ?? []).filter(item => range === 'all' || now - Date.parse(item.at) <= RECENT_MS), [items, range, now])
  const folded = inRange.filter(item => item.hidden).length
  const visible = unfolded ? inRange : inRange.filter(item => !item.hidden)
  const fresh = (item: Item) => Number.isFinite(seenAt) && Date.parse(item.foundAt ?? item.at) > seenAt
  const hand = (item: Item) => { handToAssistant(handoffText(item, now)).catch((reason: unknown) => { update({ error: errorText(reason) }) }) }

  const school = snapshot?.sources.find(source => source.id === 'school')
  const wechat = snapshot?.sources.find(source => source.id === 'wechat')
  const readable = snapshot?.sources.some(source => source.state === 'ready') ?? false
  // 列表空着的时候说清楚是哪一种空：真的没有、还在第一次读、还是根本没法读（下面另有说明）。
  let empty = ''
  if (snapshot && visible.length === 0 && readable) {
    const earlier = (items ?? []).filter(item => unfolded || !item.hidden).length - visible.length
    if (school?.state === 'ready' && !school.fetchedAt && !school.error) empty = busy ? '第一次读取，要等一会儿。' : ''
    else empty = range === 'all' ? '没有通知。' : earlier > 0 ? `一周内没有新通知，更早的还有 ${earlier} 条。` : '一周内没有新通知。'
  }

  return (
    <section className="campus-section" aria-label="通知">
      <div className="campus-section-head">
        <div className="campus-titleline">
          <h2 className="campus-section-title">通知</h2>
          {snapshot && readable && <span className="campus-count">{visible.length}</span>}
        </div>
        <Choice label="看哪些通知" value={range} options={RANGES} onChange={(next) => { if (next) setRange(next) }} />
      </div>
      {error && <p className="campus-note campus-task-note"><span>{error}</span></p>}
      {snapshot && (
        // 条数多了在这个框里滚动。换范围是换了一份列表，整个重画（回到顶上），不放进出的动画。
        <div className="campus-notice-scroll" key={range}>
          <Flow items={visible} keyOf={itemKey} label="通知">
            {item => <NoticeRow item={item} now={now} fresh={fresh(item)} onHand={() => { hand(item) }} />}
          </Flow>
        </div>
      )}
      {empty && <p className="campus-task-empty">{empty}</p>}
      {folded > 0 && (
        <p className="campus-note campus-task-note">
          <span>{unfolded ? `其中 ${folded} 条和你关系不大。` : `另有 ${folded} 条和你关系不大，已收起。`}</span>
          <button type="button" className="campus-textlink" aria-expanded={unfolded} onClick={() => { setUnfolded(old => !old) }}>{unfolded ? '收起' : '展开'}</button>
        </p>
      )}
      {school?.state === 'off' && (
        <p className="campus-note campus-task-note">
          <span>「{pluginTitle(school.plugin)}」在插件页关着，这里不读学校的通知。</span>
          <button type="button" className="campus-textlink" onClick={() => { openPlugin(school.plugin) }}>去打开</button>
        </p>
      )}
      {school?.state === 'account' && (
        <p className="campus-note campus-task-note">
          <span>「{pluginTitle(school.plugin)}」还没填好，读不到学校的通知。</span>
          <button type="button" className="campus-textlink" onClick={() => { openPlugin(school.plugin) }}>去填写</button>
        </p>
      )}
      {school?.state === 'ready' && school.error && !busy && (
        <p className="campus-note campus-task-note">
          {/* 冒号后面的原因是系统给的原话，不动它。 */}
          <span>
            {mixed(school.fetchedAt ? `学校的通知这次没读到，上面的还是${agoText(Date.parse(school.fetchedAt), now)}读到的：` : '学校的通知没读到：')}
            {school.error.replace(/[。.]$/, '')}。
          </span>
          <button type="button" className="campus-textlink" onClick={() => { void visitFeed(true) }}>再试一次</button>
        </p>
      )}
      {wechat?.state === 'ready' && wechat.error && (
        <p className="campus-note campus-task-note">
          <span>{wechat.error}。</span>
          <button type="button" className="campus-textlink" onClick={() => { openPlugin(wechat.plugin) }}>去处理</button>
        </p>
      )}
    </section>
  )
}
