/**
 * 定时任务（自动化任务）那几张：日程表的「定时任务」页签、「今日安排」到点执行后的对话、插件页「自动化任务」的详情。
 * 任务是真的：假模型照剧本调用 schedule_create，引擎自己建好、自己到点发 [SCHEDULE REMINDER]。
 * 引擎的计时器只在建任务、改任务和启动时重新算下一次，钟往前拨它不知道；所以要「今日安排」7:30 到点，
 * 是把钟拨到 7:29:48 再把应用重开一次（真实用户早上打开电脑也是这样），启动时算出 12 秒后到点。
 * 时间线和平时的历史对话穿插着走（只往前拨钟），所以这一组单独跑：node run.mjs --only schedules
 */
import { HISTORY, SCHED_MORNING, SCHED_MORE } from './chats.mjs'
import { sleep } from './driver.mjs'
import { askChat, settle } from './shots-chats.mjs'

const TASKS = [
  ['tasks.tab', '.campus-schedule-tabs [role=tab], .campus-schedule-tabs button', { list: true }],
  ['tasks.filter', '[class*=_filterTab]', { list: true }],
  ['tasks.new', '.campus-schedule-tasks button[class*=_primary], .campus-schedule-tasks [class*=_header] button', { list: true }],
  ['tasks.list', '[class*=_listRows]'],
  ['task.row', '[class*=_listRows] > li', { list: true }],
  ['task.title', '[class*=_listRows] [class*=_rowTitle]', { list: true }],
  ['task.when', '[class*=_listRows] [class*=_rowSummary]', { list: true }],
]

const CHAT = [
  ['composer', '[contenteditable=true], textarea'],
  ['trace.pane', '.campus-trace'],
  ['trace.summary', '.campus-trace-summary'],
  ['trace.row', '.campus-trace-row', { list: true }],
  ['trace.site', '.campus-trace-site', { list: true }],
  ['trace.what', '.campus-trace-what', { list: true }],
  ['trace.result', '.campus-trace-result', { list: true }],
  ['chat.table', '[class*=markdown] table', { list: true }],
  ['chat.list', '[class*=markdown] ol, [class*=markdown] ul', { list: true }],
  ['turn.trigger', '[data-chat-flow-kind="turn-trigger"]', { list: true }],
  ['task.detail', 'button[aria-label^="打开任务详情"]', { list: true }],
  ['reminder.entry', '[data-schedule-reminder-entry]'],
  ['trace.node', '.campus-trace-graph circle', { list: true }],
]

/** 7:29:48：重开应用，等 7:30 的「今日安排」到点、助手做完，截这一段对话。 */
async function morning(d) {
  d.finished.delete(SCHED_MORNING.runId)
  await d.relaunch(490.2)
  const until = Date.now() + 120_000
  while (!d.finished.has(SCHED_MORNING.runId)) {
    if (Date.now() > until) throw new Error('「今日安排」没有到点执行')
    await sleep(300)
  }
  await sleep(2500)
  // 打开「今日安排」这一段对话（侧栏里点它的标题）
  await d.clickAt(`[...document.querySelectorAll('*')].filter(el => __tools.visible(el) && el.getBoundingClientRect().left < 340 && __tools.text(el) === ${JSON.stringify(SCHED_MORNING.title)}).pop()`, '今日安排那段对话')
  await sleep(2500)
  // 打开右边栏的「执行过程」：到点那一轮读了哪些网站、在托盘上提醒了一句
  await d.clickAt(`document.querySelector('button[aria-label="打开右侧边栏"]')`, '打开右侧边栏').catch(() => {})
  await sleep(1500)
  if (!await d.eval(`!!document.querySelector('.campus-trace')`)) await d.clickText('执行过程').catch(() => {})
  await d.waitFor(`document.querySelector('.campus-trace')`, 10_000, '执行过程').catch(() => {})
  await sleep(1200)
  // 正文滚到「自动化任务 07:30」那一行在顶上
  await d.eval(`(() => { const box = document.querySelector('[class*=scrollBody]'), mark = document.querySelector('[data-chat-flow-kind="turn-trigger"][data-chat-turn="2"]'); if (!box || !mark) return false; box.scrollTop += mark.getBoundingClientRect().top - box.getBoundingClientRect().top - 12; return true })()`)
  await sleep(800)
  await d.park()
  await d.shot('schedule-reminder', { spec: CHAT, note: '「今日安排」每天 7:30 到点：引擎发来 [SCHEDULE REMINDER]，助手读教务网课表、学在浙大和 PTA 的作业、考试、新通知，排成今天一页，并用 campus_notify 在托盘提醒最要紧的一件' })
  await d.eval(`(() => { const box = document.querySelector('[class*=scrollBody]'); if (box) box.scrollTop = box.scrollHeight; return true })()`)
  await sleep(800)
  await d.park()
  await d.shot('schedule-reminder-2', { spec: CHAT, note: '同一段对话滚到底：今日安排的完整回答' })
}

export async function schedules(d) {
  // 和平时的历史对话穿插：前一晚 21:30 建「今日安排」，今早 7:30 到点，下午 15:37 再建四个
  const timeline = [
    ...HISTORY.map(scenario => ({ ago: scenario.ago, run: () => askChat(d, scenario) })),
    { ago: SCHED_MORNING.ago, run: () => askChat(d, SCHED_MORNING) },
    { ago: 490.2, run: () => morning(d) },
    { ago: SCHED_MORE.ago, run: () => askChat(d, SCHED_MORE) },
  ].sort((a, b) => b.ago - a.ago)
  for (const step of timeline) await step.run()

  await d.clock(0)
  await d.nav('日程表')
  await d.clickText('定时任务')
  await d.waitFor(`document.querySelector('.campus-schedule-tasks') && document.querySelector('.campus-schedule-tasks').innerText.includes('盯教学班余量')`, 20_000, '定时任务列表')
  await sleep(1500)
  await d.park()
  await d.shot('schedule-tasks', { spec: TASKS, note: '日程表 →「定时任务」页签：今日安排（每天 7:30）、作业快截止（每天 21:00）、成绩出了（每 2 小时）、盯教学班余量（每 10 分钟，概率论 王老师）、下周一览（每周日 20:00）' })
  await d.clickText('日程')
  await sleep(500)

  await d.nav('插件')
  await d.waitFor(`document.querySelectorAll('.campus-plugin-row').length >= 5`)
  await d.clickAt(`[...document.querySelectorAll('.campus-plugin-row')].find(el => el.innerText.includes('自动化任务'))?.querySelector('.campus-plugin-open, button') ?? [...document.querySelectorAll('.campus-plugin-row')].find(el => el.innerText.includes('自动化任务'))`, '自动化任务')
  await d.waitFor(`document.querySelectorAll('[data-automation-example]').length >= 5`, 15_000, '自动化任务详情')
  await sleep(800)
  await d.park()
  await d.shot('plugins-automation', { spec: [['automation.example', '[data-automation-example]', { list: true }], ['automation.hand', '[data-automation-example] button', { list: true }], ['detail.title', '.campus-detail .campus-page-title'], ['linkrow', '.campus-linkrow', { list: true }]], note: '插件 → 自动化任务：可以让它定时做的几件事，每行「交给助手」把那段话放进新对话的输入框' })
}
