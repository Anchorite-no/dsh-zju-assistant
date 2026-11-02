/**
 * dsh-go 原生「今日校园」界面。
 *
 * 网页半侧照旧在 plugin/client；这里只给 dsh-go 桥接提供面板、状态条和数据。
 * 数据仍走现有的 schedule.days()，所以校历、单双周、调休、作业截止、考试和
 * 自有日程都沿用原来的规则。没有桥接的主机不会进入 ctx.inject(['dshGo'])。
 */

const MAX_TODAY = 12
const MAX_DEADLINES = 10
const MAX_NOTE = 600
const STRIP_REFRESH_MS = 5 * 60_000

const WORDS = {
  zh: {
    title: '今日校园',
    today: '今天',
    due: '截止',
    exams: '考试',
    lessons: '节课',
    inSevenDays: '7 天内',
    todayList: '今天的安排',
    deadlineList: '接下来的截止',
    refresh: '刷新',
    calendar: '写入日历',
    refreshed: '已刷新',
    refreshFailed: '刷新失败',
    loading: '正在读取…',
    refreshing: '正在刷新…',
    updated: (time) => `更新于 ${time}`,
    noMore: '今天没有课了',
    next: '下一节：',
    untitled: '未命名',
    done: '已交',
    week: (number) => `第 ${number} 周`,
    stripDue: (due, exam) => `${due} 个截止${exam ? ` · ${exam} 场考试` : ''}`,
    stripEmpty: '今日校园',
  },
  en: {
    title: 'Campus today',
    today: 'Today',
    due: 'Due',
    exams: 'Exams',
    lessons: 'classes',
    inSevenDays: 'in 7 days',
    todayList: "Today's schedule",
    deadlineList: 'Upcoming deadlines',
    refresh: 'Refresh',
    calendar: 'Calendar',
    refreshed: 'Refreshed',
    refreshFailed: 'Refresh failed',
    loading: 'Loading…',
    refreshing: 'Refreshing…',
    updated: (time) => `Updated ${time}`,
    noMore: 'No more classes today',
    next: 'Next: ',
    untitled: 'Untitled',
    done: 'Submitted',
    week: (number) => `Week ${number}`,
    stripDue: (due, exam) => `${due} due${exam ? ` · ${exam} exam` : ''}`,
    stripEmpty: 'Campus today',
  },
}

export function words(locale) {
  return typeof locale === 'string' && locale.toLowerCase().startsWith('en') ? WORDS.en : WORDS.zh
}

const text = (value) => (typeof value === 'string' ? value.trim() : '')
const clean = (value) => text(value).replace(/\s+/g, ' ')
const timeOf = (value) => /^\d{2}:\d{2}/.exec(text(value))?.[0] ?? ''

function beijing(now) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type) => parts.find((part) => part.type === type)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

function addDays(date, count) {
  const at = new Date(`${date}T00:00:00+08:00`)
  at.setUTCDate(at.getUTCDate() + count)
  return beijing(at).date
}

function dateLabel(date, weekday, locale) {
  const at = new Date(`${date}T00:00:00+08:00`)
  if (Number.isNaN(at.getTime())) return date
  if (typeof locale === 'string' && locale.toLowerCase().startsWith('en')) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    }).format(at)
  }
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日 ${weekday || '周?'}`
}

function weekLabel(value, w) {
  const number = /第\s*(\d+)\s*周/.exec(text(value))?.[1]
  return number ? w.week(number) : ''
}

function row(item, day, w, { deadline = false } = {}) {
  const kind = clean(item?.kind)
  const where = clean(item?.where)
  const done = item?.done ? w.done : ''
  const usedTime = clean(item?.time)
  const trailing = usedTime || (deadline ? text(day?.date).slice(5) : '')
  return {
    title: clean(item?.title) || w.untitled,
    subtitle: [kind, where, done].filter(Boolean).join(' · '),
    ...(trailing ? { trailing } : {}),
    icon: kind === '课' ? 'school' : kind === '考试' ? 'alarm' : kind === '截止' ? 'todo' : 'note',
    ...(item?.done ? { tone: 'muted' } : {}),
  }
}

function noteText(value) {
  const notes = (Array.isArray(value) ? value : [value]).map(clean).filter(Boolean)
  if (!notes.length) return ''
  const joined = notes.join('；')
  return joined.length > MAX_NOTE ? `${joined.slice(0, MAX_NOTE - 1)}…` : joined
}

/** 把 schedule.days() 的结果变成面板的数据模型。 */
export function campusData(result, { now = new Date(), locale = 'zh-CN' } = {}) {
  const w = words(locale)
  const clock = beijing(now)
  const source = result && typeof result === 'object' ? result : {}
  const today = /^\d{4}-\d{2}-\d{2}$/.test(text(source.today)) ? text(source.today) : clock.date
  const days = Array.isArray(source.days) ? source.days : []
  const todayDay = days.find((day) => day?.date === today) ?? { date: today, items: [] }
  const todayItems = Array.isArray(todayDay.items) ? todayDay.items : []
  const all = days.flatMap((day) => (Array.isArray(day?.items) ? day.items.map((item) => ({ item, day })) : []))
  const deadlines = all.filter(({ item }) => item?.kind === '截止' && !item.done)
  const exams = all.filter(({ item }) => item?.kind === '考试')
  const next = todayItems
    .filter((item) => item?.kind === '课' && !item.done && timeOf(item.time) && timeOf(item.time) > clock.time)
    .sort((a, b) => timeOf(a.time).localeCompare(timeOf(b.time)))[0]
  const todayText = dateLabel(today, clean(todayDay.weekday), locale)
  const week = weekLabel(todayDay.week, w)

  return {
    today: week ? `${todayText} · ${week}` : todayText,
    classes: todayItems.filter((item) => item?.kind === '课').length,
    deadlines: deadlines.length,
    exams: exams.length,
    next: next
      ? `${w.next}${clean(next.title) || w.untitled}${clean(next.time) ? ` ${clean(next.time)}` : ''}${clean(next.where) ? ` · ${clean(next.where)}` : ''}`
      : w.noMore,
    todayItems: todayItems.slice(0, MAX_TODAY).map((item) => row(item, todayDay, w)),
    deadlineItems: deadlines.slice(0, MAX_DEADLINES).map(({ item, day }) => row(item, day, w, { deadline: true })),
    note: noteText(source.notes),
    updated: w.updated(clock.time),
  }
}

/** 点「写入日历」后放进输入框的指令；真正写日历仍要用户点发送，由模型调用工具。 */
export function calendarPrompt({ now = new Date(), locale = 'zh-CN' } = {}) {
  const today = beijing(now).date
  const end = addDays(today, 6)
  if (typeof locale === 'string' && locale.toLowerCase().startsWith('en')) {
    return [
      'Put my campus schedule into the phone calendar.',
      `1. Call campus_schedule with action=phone_calendar, from=${today}, to=${end}.`,
      '2. If mcp__calendar__upsert is available, pass every returned key, title, begin, end, all_day, location, description and reminder_minutes unchanged. The same key updates the existing event instead of creating a duplicate.',
      '3. Only if that tool is missing but mcp__phone__intent exists, open kind=calendar for each event and let me save it; reminders cannot be written that way.',
      '4. If neither tool exists, say so; do not claim anything was written.',
      '5. Before writing, show counts by class, exam, deadline and event and wait for my confirmation; afterwards report only the counts.',
    ].join('\n')
  }
  return [
    '把校园日程写进手机日历。',
    `1. 调用 campus_schedule，action=phone_calendar，from=${today}，to=${end}。`,
    '2. 如果工具列表里有 mcp__calendar__upsert，就逐条原样使用返回的 key、title、begin、end、all_day、location、description、reminder_minutes；同一个 key 再写只更新，不会重复建。',
    '3. 没有 mcp__calendar__upsert、但有 mcp__phone__intent 时，才逐条用 kind=calendar 打开系统新建页；每条都要我点保存，提醒时间无法自动写。',
    '4. 两种工具都没有就直说，不要假装已经写入。',
    '5. 动手前先按课程、考试、截止、日程报条数让我确认；写完后只报数量。',
  ].join('\n')
}

function loadingData(locale) {
  const w = words(locale)
  return {
    today: '',
    classes: 0,
    deadlines: 0,
    exams: 0,
    next: w.loading,
    todayItems: [],
    deadlineItems: [],
    note: '',
    updated: w.loading,
  }
}

function errorData(message, locale) {
  const w = words(locale)
  return {
    today: '',
    classes: 0,
    deadlines: 0,
    exams: 0,
    next: w.refreshFailed,
    todayItems: [],
    deadlineItems: [],
    note: clean(message).slice(0, MAX_NOTE),
    updated: w.refreshFailed,
  }
}

/** 面板结构；所有会变的内容都从 data 绑定。 */
export function campusView(caps = {}) {
  const w = words(caps.locale)
  return {
    type: 'stack',
    title: w.title,
    children: [
      { type: 'text', text: { $: 'data.today' }, tone: 'muted' },
      {
        type: 'row',
        children: [
          { type: 'metric', label: w.today, value: { $: 'data.classes' }, caption: w.lessons },
          { type: 'metric', label: w.due, value: { $: 'data.deadlines' }, caption: w.inSevenDays },
          { type: 'metric', label: w.exams, value: { $: 'data.exams' }, caption: w.inSevenDays },
        ],
      },
      { type: 'callout', text: { $: 'data.next' }, tone: 'info' },
      { type: 'text', text: w.todayList, tone: 'muted' },
      { type: 'list', items: { $: 'data.todayItems' } },
      { type: 'text', text: w.deadlineList, tone: 'muted' },
      { type: 'list', items: { $: 'data.deadlineItems' } },
      { type: 'text', text: { $: 'data.note' }, tone: 'muted' },
      { type: 'text', text: { $: 'data.updated' }, tone: 'muted' },
      { type: 'actions', items: [{ label: w.refresh, action: 'refresh', icon: 'refresh' }, { label: w.calendar, action: 'calendar', icon: 'calendar' }] },
    ],
  }
}

/** 输入框上方那一行：7 天内还有几个截止、几场考试。 */
export function stripText(snapshot, locale) {
  const w = words(locale)
  const today = text(snapshot?.today) || beijing(new Date()).date
  const end = addDays(today, 6)
  const events = Array.isArray(snapshot?.events) ? snapshot.events : []
  const inRange = (item) => text(item?.date) >= today && text(item?.date) <= end
  const due = events.filter((item) => item?.kind === 'due' && !item.done && inRange(item)).length
  const exam = events.filter((item) => item?.kind === 'exam' && inRange(item)).length
  return { text: due || exam ? w.stripDue(due, exam) : w.stripEmpty, icon: 'school' }
}

const messageOf = (reason) => (reason instanceof Error ? reason.message : String(reason))

/** 给面板供数；同一时间只读一次，刷新时等这一次读完。 */
export function createCampusSource({ schedule, affairs, now = () => new Date(), clock = setInterval, cancel = clearInterval }) {
  let raw = null
  let error = ''
  let busy = false
  let running = null
  const listeners = new Set()

  const render = (listener) => {
    if (error) return errorData(error, listener.locale)
    if (!raw) return loadingData(listener.locale)
    const data = campusData(raw, { now: now(), locale: listener.locale })
    if (busy) data.updated = words(listener.locale).refreshing
    return data
  }

  const publish = () => {
    for (const listener of [...listeners]) listener.emit(render(listener))
  }

  const load = ({ force = false, signal } = {}) => {
    if (running) return running
    error = ''
    busy = true
    publish()
    running = (async () => {
      try {
        if (force) {
          const jobs = []
          if (schedule?.refresh) jobs.push(schedule.refresh({ source: 'timetable', force: true }))
          if (schedule?.refresh) jobs.push(schedule.refresh({ source: 'exams', force: true }))
          if (affairs?.refreshAll) jobs.push(affairs.refreshAll({ force: true }))
          await Promise.allSettled(jobs)
        }
        if (signal?.aborted) return { ok: false, aborted: true }
        const at = beijing(now())
        raw = await schedule.days({ from: at.date, to: addDays(at.date, 6) })
        return { ok: true }
      } catch (reason) {
        error = messageOf(reason)
        return { ok: false, error }
      } finally {
        busy = false
        running = null
        publish()
      }
    })()
    return running
  }

  return {
    subscribe(emit, caps) {
      const listener = { emit, locale: caps?.locale }
      listeners.add(listener)
      emit(render(listener))
      if (!raw && !running && !error) void load()
      return () => listeners.delete(listener)
    },
    refresh(locale) {
      const w = words(locale)
      return {
        pending: { label: w.refreshing, timeoutMs: 60_000 },
        result: async (signal) => {
          const result = await load({ force: true, signal })
          if (signal?.aborted) return undefined
          return { toast: result.ok ? w.refreshed : w.refreshFailed }
        },
      }
    },
    strip(emit, caps) {
      let stopped = false
      const push = () => {
        if (stopped) return
        try {
          emit(stripText(schedule.snapshot(), caps?.locale))
        } catch {
          emit({ text: words(caps?.locale).stripEmpty, icon: 'school' })
        }
      }
      push()
      const timer = clock(push, STRIP_REFRESH_MS)
      timer?.unref?.()
      return () => {
        stopped = true
        cancel(timer)
      }
    },
    load,
  }
}

/** 只有装了 dsh-go 桥接的主机才会注册原生面板和状态条。 */
export function installDshGo(ctx, options) {
  if (typeof ctx?.inject !== 'function') return undefined
  return ctx.inject(['dshGo'], (scoped) => {
    const source = createCampusSource(options)
    const insertCalendar = (event) => ({ insert: calendarPrompt({ now: options.now?.() ?? new Date(), locale: event?.locale }) })
    const disposers = [
      scoped.dshGo.on('campus-calendar', (_scope, event) => insertCalendar(event)),
      scoped.dshGo.panel('campus', {
        view: (_scope, caps) => campusView(caps),
        data: (_scope, emit, caps) => source.subscribe(emit, caps),
        actions: {
          refresh: (_scope, event) => source.refresh(event?.locale),
          calendar: (_scope, event) => insertCalendar(event),
        },
      }),
      scoped.dshGo.strip('campus-strip', (_scope, emit, caps) => source.strip(emit, caps)),
    ]
    return () => {
      for (const dispose of disposers) dispose?.()
    }
  })
}
