/**
 * 校园日程 -> 手机日历的导出清单。
 *
 * 只负责把 campus_schedule 已经排好的七天变成 mcp__calendar__upsert 能直接吃的参数；
 * 不调用模型、不写 Android 日历。稳定 key 让同一条课/考试/截止反复导出时更新原事件。
 */
import { createHash } from 'node:crypto'

const MAX_EVENTS = 80
const KIND = { 课: 'class', 考试: 'exam', 截止: 'due', 日程: 'event' }
const REMINDERS = { class: [15], exam: [1440, 120], due: [1440, 120], event: [15] }
const LABEL = { class: '课程', exam: '考试', due: '截止', event: '日程' }

const pad = value => String(value).padStart(2, '0')
const text = value => typeof value === 'string' ? value.trim() : ''

function clock(value) {
  const match = /^(\d{1,2}):(\d{2})(?:-(\d{1,2}):(\d{2}))?$/.exec(text(value))
  if (!match) return null
  const start = `${pad(+match[1])}:${match[2]}`
  const end = match[3] ? `${pad(+match[3])}:${match[4]}` : ''
  return { start, end }
}

function addMinutes(date, time, minutes) {
  const at = new Date(Date.parse(`${date}T${time}:00+08:00`) + minutes * 60_000 + 8 * 3_600_000)
  const iso = at.toISOString()
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) }
}

function keyOf(kind, date, start, title) {
  const digest = createHash('sha1').update([kind, date, start, title].join('\0')).digest('hex').slice(0, 12)
  return `dsh-zju:${kind}:${date}:${start ? start.replace(':', '') : 'allday'}:${digest}`
}

/** days 是 schedule.days() 里的 days，项目已经过校历、调休和单双周处理。 */
export function phoneCalendarExport(days) {
  const events = []
  for (const day of Array.isArray(days) ? days : []) {
    const date = text(day?.date)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    for (const item of Array.isArray(day?.items) ? day.items : []) {
      const kind = KIND[text(item?.kind)]
      const name = text(item?.title)
      if (!kind || !name || item?.done) continue
      const time = clock(item?.time)
      const allDay = kind === 'due' || !time
      const title = kind === 'due' ? `${name}（截止）` : kind === 'exam' ? `${name}（考试）` : name
      const where = text(item?.where)
      const note = kind === 'due' && time ? `截止时间 ${time.start}。` : ''
      events.push({
        key: keyOf(kind, date, time?.start ?? '', name),
        title,
        begin: allDay ? date : `${date}T${time.start}:00+08:00`,
        ...(!allDay ? { end: time.end ? `${date}T${time.end}:00+08:00` : (() => {
          const end = addMinutes(date, time.start, kind === 'exam' ? 120 : 60)
          return `${end.date}T${end.time}:00+08:00`
        })() } : {}),
        all_day: allDay,
        ...(where ? { location: where } : {}),
        description: `来源：浙大校园助手。${LABEL[kind]}。${note}`,
        reminder_minutes: REMINDERS[kind],
      })
    }
  }
  return { events: events.slice(0, MAX_EVENTS), ...(events.length > MAX_EVENTS ? { omittedEvents: events.length - MAX_EVENTS } : {}) }
}
