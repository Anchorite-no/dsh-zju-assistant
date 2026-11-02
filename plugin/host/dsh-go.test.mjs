import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calendarPrompt, campusData, campusView, createCampusSource, installDshGo, stripText } from './dsh-go.mjs'

const sample = {
  today: '2026-11-02',
  days: [
    {
      date: '2026-11-02',
      weekday: '周一',
      week: '2026-2027 秋冬学期第 9 周',
      items: [
        { kind: '课', time: '08:00-09:35', title: '高等数学', where: '东1A-101' },
        { kind: '截止', time: '23:59', title: '作业一', where: '学在浙大' },
      ],
    },
    {
      date: '2026-11-03',
      weekday: '周二',
      items: [
        { kind: '考试', time: '10:00', title: '期中考试', where: '西2-101' },
        { kind: '截止', title: '实验报告', where: 'PTA' },
      ],
    },
  ],
  notes: ['课表来自缓存。'],
}

const at = new Date('2026-11-02T07:00:00+08:00')

test('campusData 统计今天和未来七天', () => {
  const data = campusData(sample, { now: at, locale: 'zh-CN' })
  assert.equal(data.classes, 1)
  assert.equal(data.deadlines, 2)
  assert.equal(data.exams, 1)
  assert.match(data.today, /11月2日 周一 · 第 9 周/)
  assert.match(data.next, /高等数学 08:00-09:35 · 东1A-101/)
  assert.equal(data.todayItems.length, 2)
  assert.equal(data.deadlineItems[0].trailing, '23:59')
  assert.equal(data.deadlineItems[1].trailing, '11-03')
  assert.equal(data.note, '课表来自缓存。')
})

test('campusView 用绑定且不超过面板预算', () => {
  const view = campusView({ locale: 'zh-CN' })
  assert.equal(view.type, 'stack')
  assert.equal(view.title, '今日校园')
  assert.ok(Buffer.byteLength(JSON.stringify(view), 'utf8') < 32 * 1024)
  assert.deepEqual(view.children[1].children[0].value, { $: 'data.classes' })
  assert.equal(view.children[9].items[0].action, 'refresh')
  assert.equal(view.children[9].items[1].action, 'calendar')
})

test('stripText 给出截止和考试数量，没有时回到今日校园', () => {
  const summary = {
    today: '2026-11-02',
    events: [
      { kind: 'due', date: '2026-11-03', title: '作业' },
      { kind: 'due', date: '2026-11-10', title: '下周的作业' },
      { kind: 'exam', date: '2026-11-05', title: '期中' },
    ],
  }
  assert.deepEqual(stripText(summary, 'zh-CN'), { text: '1 个截止 · 1 场考试', icon: 'school' })
  assert.deepEqual(stripText({ today: '2026-11-02', events: [] }, 'zh-CN'), { text: '今日校园', icon: 'school' })
})

test('source 只读一次，刷新时重读并发布数据', async () => {
  let reads = 0
  let refreshes = 0
  const schedule = {
    days: async () => {
      reads += 1
      return sample
    },
    refresh: async () => {
      refreshes += 1
    },
  }
  const affairs = {
    refreshAll: async () => {
      refreshes += 1
    },
  }
  const source = createCampusSource({ schedule, affairs, now: () => at, clock: () => undefined })
  const seen = []
  const off = source.subscribe((value) => seen.push(value), { locale: 'zh-CN' })
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(reads, 1)
  assert.ok(seen.some((value) => value.classes === 1))

  const pending = source.refresh('zh-CN')
  assert.equal(pending.pending.timeoutMs, 60_000)
  assert.deepEqual(await pending.result(new AbortController().signal), { toast: '已刷新' })
  assert.equal(reads, 2)
  assert.equal(refreshes, 3)
  off()
})

test('calendarPrompt 明确调用日历 MCP，并保留手机 intent 回退', () => {
  const zh = calendarPrompt({ now: at, locale: 'zh-CN' })
  assert.match(zh, /campus_schedule/)
  assert.match(zh, /action=phone_calendar/)
  assert.match(zh, /from=2026-11-02/)
  assert.match(zh, /to=2026-11-08/)
  assert.match(zh, /mcp__calendar__upsert/)
  assert.match(zh, /mcp__phone__intent/)
  assert.ok(zh.length < 2000)
  assert.match(calendarPrompt({ now: at, locale: 'en-US' }), /phone calendar/)
})

test('installDshGo 注册 campus 面板、状态条和写入日历胶囊', () => {
  const seen = []
  const ctx = {
    inject: ([name], callback) => {
      assert.equal(name, 'dshGo')
      return callback({
        dshGo: {
          on: (id, handler) => {
            seen.push(['on', id, handler])
            return () => {}
          },
          panel: (id, definition) => {
            seen.push(['panel', id, definition])
            return () => {}
          },
          strip: (id, definition) => {
            seen.push(['strip', id, definition])
            return () => {}
          },
        },
      })
    },
  }
  const dispose = installDshGo(ctx, {
    schedule: { days: async () => sample, refresh: async () => {}, snapshot: () => ({ today: '2026-11-02', events: [] }) },
    affairs: { refreshAll: async () => {} },
    now: () => at,
    clock: () => undefined,
  })
  assert.equal(typeof dispose, 'function')
  assert.deepEqual(seen.map(([kind, id]) => [kind, id]), [['on', 'campus-calendar'], ['panel', 'campus'], ['strip', 'campus-strip']])
  assert.equal(typeof seen[1][2].view, 'function')
  assert.equal(typeof seen[1][2].data, 'function')
  assert.equal(typeof seen[1][2].actions.refresh, 'function')
  assert.equal(typeof seen[1][2].actions.calendar, 'function')
  assert.match(seen[0][2]({}, { locale: 'zh-CN' }).insert, /mcp__calendar__upsert/)
})
