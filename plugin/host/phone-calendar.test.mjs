import assert from 'node:assert/strict'
import { test } from 'node:test'
import { phoneCalendarExport } from './phone-calendar.mjs'

const days = [
  {
    date: '2026-11-02', weekday: '周一', items: [
      { kind: '课', time: '08:00-09:35', title: '高等数学', where: '东1A-101' },
      { kind: '截止', time: '23:59', title: '作业一', where: '学在浙大' },
    ],
  },
  {
    date: '2026-11-03', weekday: '周二', items: [
      { kind: '考试', time: '10:00', title: '期中考试', where: '西2-101' },
      { kind: '日程', title: '组会', where: '曹光彪 301' },
      { kind: '截止', title: '已交作业', done: '已交' },
    ],
  },
]

test('课程按北京时间写成定时事件，截止写成全天事件', () => {
  const { events } = phoneCalendarExport(days)
  assert.equal(events.length, 4)
  const math = events.find(event => event.title === '高等数学')
  assert.equal(math.begin, '2026-11-02T08:00:00+08:00')
  assert.equal(math.end, '2026-11-02T09:35:00+08:00')
  assert.equal(math.all_day, false)
  assert.equal(math.location, '东1A-101')
  assert.deepEqual(math.reminder_minutes, [15])
  const due = events.find(event => event.title === '作业一（截止）')
  assert.equal(due.begin, '2026-11-02')
  assert.equal(due.end, undefined)
  assert.equal(due.all_day, true)
  assert.match(due.description, /截止时间 23:59/)
  assert.deepEqual(due.reminder_minutes, [1440, 120])
})

test('同一个校园事项的 key 稳定，交过的截止跳过', () => {
  const first = phoneCalendarExport(days).events
  const second = phoneCalendarExport(days).events
  assert.deepEqual(first.map(event => event.key), second.map(event => event.key))
  assert.match(first[0].key, /^dsh-zju:class:2026-11-02:0800:[0-9a-f]{12}$/)
  assert.ok(!first.some(event => event.title.includes('已交作业')))
  const renamed = structuredClone(days)
  renamed[0].items[0].title = '高等数学（习题课）'
  assert.notEqual(phoneCalendarExport(renamed).events[0].key, first[0].key)
})

test('没有时间的考试和日程写成全天事件', () => {
  const { events } = phoneCalendarExport(days)
  const exam = events.find(event => event.title === '期中考试（考试）')
  assert.equal(exam.begin, '2026-11-03T10:00:00+08:00')
  assert.equal(exam.end, '2026-11-03T12:00:00+08:00')
  const meeting = events.find(event => event.title === '组会')
  assert.equal(meeting.begin, '2026-11-03')
  assert.equal(meeting.all_day, true)
})
