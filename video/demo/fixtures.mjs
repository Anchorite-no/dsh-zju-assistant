/**
 * 页面向引擎侧档案服务（/api/campus/profile）要的东西，换成编好的一学期。inject.js 在页面里拦下这些请求，照这里给的回。
 * 形状照 ui/client 下各页面的 interface（AffairsPage、Feed、Memos、SchedulePage、LearningPage、ProfileSettings、PluginsPage）。
 * 日程表的校历和备忘里的时间用应用自己的 calendar.mjs、holidays.mjs 算，和真的一样。
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { AI_MEMO, at, COURSES, course, EXAMS, MEMOS, STUDENT, TASKS } from './data.mjs'
import { feedItems, noticeContent } from './notices.mjs'
import { chaoxingPage, chaoxingSnapshot, coursePage, learningSnapshot, lessonPage, MEMORY, xuezaiFiles } from './learning.mjs'

const FETCHED = at('2026-10-21', '15:31')
const SOURCE_NAMES = { xuezai: '学在浙大', pta: 'PTA' }

const note = (item, index) => ({
  title: item.title, body: item.body, tags: item.tags, properties: item.properties, archived: false,
  updatedAt: item.updatedAt ?? at('2026-10-21', '15:00'), revision: `demo-${index}`,
})

function taskOut(task) {
  const item = course(task.course)
  return { id: task.id, source: task.source, title: task.title, course: item.name, kind: task.kind, deadline: task.deadline, ...(task.note ? { note: task.note } : {}) }
}

function taskDetail(task) {
  const item = course(task.course)
  const pta = task.source === 'pta'
  const bodies = {
    'xuezai:hw-phys-3': '完成教材第 9 章习题 9-3、9-7、9-12、9-15、9-21。\n\n**截止时间已延后到 10 月 23 日 23:59。** 第 5 题（9-15）题图以课程群补发的为准。\n\n手写拍照合成一个 PDF 上传，一题一页，写清楚题号。',
    'xuezai:co-lab3': '按模板完成单周期 CPU 的设计与仿真报告：数据通路图、控制信号表、至少 3 条指令的仿真波形与分析。\n\n提交 PDF，文件名「学号-姓名-Lab3.pdf」。',
  }
  return {
    item: taskOut(task),
    detail: {
      body: bodies[task.id] ?? (pta ? '' : `${item.name}：${task.title}。按课上讲的要求完成，提交 PDF。`), format: 'markdown',
      facts: pta ? [{ label: '进度', value: task.note ?? '' }, { label: '满分', value: '100' }] : [{ label: '老师', value: item.teacher }, { label: '提交', value: '还没交' }],
      files: pta ? [] : task.id === 'xuezai:co-lab3' ? ['Lab3 实验报告模板.docx', 'Lab3 指令测试集.zip'] : ['题目.pdf'],
      ...(pta ? { table: { columns: ['题号', '题型', '分值', '状态'], rows: Array.from({ length: 10 }, (_, i) => [`7-${i + 1}`, i < 4 ? '判断' : i < 7 ? '选择' : '编程', i < 7 ? '2' : '20', i < 6 ? '答对' : '未作答']) } } : {}),
    },
    partial: false, more: false, fetchedAt: FETCHED, error: null, downloadable: !pta, saved: {},
  }
}

/** 日程表的快照（SchedulePage 的 Snapshot），校历是浙大的加国家放假安排，课表是 COURSES。 */
async function scheduleSnapshot(stage) {
  const lib = name => import(pathToFileURL(path.join(stage, 'ui', 'profile', name)).href)
  const { ZJU_PERIODS, layerCalendars, memoEvents } = await lib('calendar.mjs')
  const { ZJU_CALENDARS, Holidays } = await lib('holidays.mjs')
  const holidays = new Holidays({ file: path.join(stage, 'core', 'demo-data', 'holidays.json'), fetch: async () => { throw new Error('offline') } })
  const years = [2025, 2026, 2027]
  const school = { terms: ZJU_CALENDARS.flatMap(item => item.terms), days: ZJU_CALENDARS.flatMap(item => item.days.map(day => ({ ...day, source: 'school' }))) }
  const builtin = layerCalendars(school, { terms: [], days: holidays.days(years) })
  const timetable = term => ({
    year: '2026-2027', term, periodTimes: ZJU_PERIODS,
    courses: COURSES.map(item => ({
      name: item.name, teacher: item.teacher, term: '秋冬',
      meetings: item.meetings.map(meeting => ({ ...meeting, startTime: ZJU_PERIODS[meeting.periods[0] - 1].startTime, endTime: ZJU_PERIODS[meeting.periods.at(-1) - 1].endTime })),
    })),
    fetchedAt: FETCHED, error: null,
  })
  const exams = EXAMS.filter(exam => !exam.location.includes('没出')).map(exam => ({
    kind: 'exam', from: 'zdbk', date: exam.date, time: exam.start, end: exam.end,
    title: `${course(exam.course).name} ${exam.kind === 'midterm' ? '期中考试' : '期末考试'}`, sub: `${exam.location} · 座位 ${exam.seat}`,
  }))
  const dues = TASKS.map((task) => {
    const date = task.deadline.slice(0, 10), time = task.deadline.slice(11, 16)
    return { kind: 'due', from: task.source, ref: task.id, date, time, title: task.title, sub: course(task.course).name, ...(task.done ? { done: true } : {}) }
  })
  const memos = memoEvents(MEMOS.map(note))
  return {
    today: '2026-10-21', calendar: builtin, custom: { terms: [], days: [] }, builtin, unpublished: [],
    current: '2026-2027|秋', timetables: { '2026-2027|秋': timetable('秋'), '2026-2027|冬': timetable('冬') }, failed: {},
    events: [...exams, ...dues, ...memos],
    sources: [
      { id: 'timetable', name: '课表', state: 'ready', plugin: 'campus.courses', fetchedAt: FETCHED, error: null },
      { id: 'exams', name: '考试安排', state: 'ready', plugin: 'campus.courses', fetchedAt: FETCHED, error: null },
    ],
  }
}

const FEED_SOURCES = [
  { id: 'school', kind: 'school', name: '学校通知', state: 'ready', plugin: 'campus.notices', fetchedAt: FETCHED, error: null, views: ['campus'] },
  { id: 'wechat', kind: 'wechat', name: '公众号', state: 'ready', plugin: 'campus.wechat', fetchedAt: FETCHED, error: null, views: ['campus'] },
  { id: 'sztz', kind: 'sztz', name: '二课', state: 'ready', plugin: 'campus.activities', fetchedAt: FETCHED, error: null, views: ['campus'] },
  { id: 'wechat-chat', kind: 'chat', name: '微信聊天', state: 'ready', plugin: 'campus.wechat-chat', fetchedAt: FETCHED, error: null, views: ['campus', 'personal'] },
  { id: 'dingtalk-chat', kind: 'chat', name: '钉钉聊天', state: 'ready', plugin: 'campus.dingtalk', fetchedAt: FETCHED, error: null, views: ['campus', 'personal'] },
  { id: 'mail', kind: 'mail', name: '浙大邮箱', state: 'ready', plugin: 'campus.mail', fetchedAt: FETCHED, error: null, views: ['personal'] },
  { id: 'cc98', kind: 'cc98', name: 'CC98', state: 'ready', plugin: 'campus.community', fetchedAt: FETCHED, error: null, views: ['personal'] },
]

/** 插件页上的账号：都填好了，账号用明显假的，密码是占位。 */
const ACCOUNT = {
  zju_username: '3250000000', zju_password: 'demo-password', webvpn_username: '3250000000', webvpn_password: 'demo-password', transport: 'webvpn',
  pta_username: 'lin.demo@example.com', pta_password: 'demo-password', lab_username: '', lab_password: 'demo-password',
  chaoxing_username: '13800000000', chaoxing_password: 'demo-password', cc98_username: '计算机系的小透明', cc98_password: 'demo-password', tyys_card_password: '000000',
}

/** 自己学到的技能（插件页「技能」里，排在自带的后面）。 */
const LEARNED_SKILLS = [
  { name: 'midterm-review', title: '期中复习计划', description: '照考试范围、作业和课后总结排一份到考试那天的复习计划', updatedAt: at('2026-10-20', '22:15') },
  { name: 'course-compare', title: '比较选课老师', description: '教务网教学班 + 查老师评分 + CC98 讨论，列表比较给建议', updatedAt: at('2026-10-12', '20:40') },
  { name: 'weekly-brief', title: '每周一早上的本周提要', description: '课表、截止、考试和群里的重要消息合成一页', updatedAt: at('2026-10-06', '08:10') },
]

export async function buildFixtures(stage) {
  const items = feedItems()
  const contents = Object.fromEntries(items.map(item => [item.id, noticeContent(item)]))
  const lessonPages = {}, coursePages = {}, xuezai = {}
  for (const item of COURSES.filter(entry => entry.zhiyun)) {
    const page = coursePage(item.zhiyun)
    coursePages[item.zhiyun] = page
    xuezai[item.zhiyun] = xuezaiFiles(item.zhiyun)
    for (const lesson of page.lessons) lessonPages[`${item.zhiyun}:${lesson.lesson}`] = lessonPage(item.zhiyun, lesson.lesson)
  }
  return {
    now: '2026-10-21T15:40:00+08:00',
    affairs: { items: TASKS.filter(task => !task.done).map(taskOut), sources: Object.entries(SOURCE_NAMES).map(([id, name]) => ({ id, name, state: 'ready', plugin: id === 'pta' ? 'campus.courses' : 'campus.courses', fetchedAt: FETCHED, error: null })) },
    details: Object.fromEntries(TASKS.map(task => [task.id, taskDetail(task)])),
    feed: { items, sources: FEED_SOURCES },
    contents,
    memos: MEMOS.map(note),
    aiMemo: { source: AI_MEMO.source, note: note({ ...AI_MEMO, updatedAt: at('2026-10-21', '15:41') }, 99) },
    schedule: await scheduleSnapshot(stage),
    learning: learningSnapshot(),
    coursePages, lessonPages, xuezai,
    chaoxing: chaoxingSnapshot(),
    chaoxingPages: { 'cx-2307': chaoxingPage('cx-2307'), 'cx-1188': chaoxingPage('cx-1188') },
    profile: { identity: { values: STUDENT, revision: 'demo-identity' }, memory: MEMORY.map(note), warnings: [] },
    account: { values: ACCOUNT, revision: 'demo-account' },
    mail: { enabled: true, connected: true, address: 'lin.demo@zju.edu.cn', connectedAt: at('2026-10-10', '20:00'), busy: false },
    learnedSkills: LEARNED_SKILLS,
  }
}
