import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ProfileStore } from './store.mjs'
import { FlowNotes } from './flow-notes.mjs'
import { digest } from './review-digest.mjs'
import { parseProposal, systemPrompt, userPrompt } from './review-prompt.mjs'
import { Review, addUnder, vet } from './review.mjs'

// 会话事件的样子照引擎的日志。
const said = (seq, text, kind = 'user') => ({ type: 'user/message', seq, data: { content: [{ type: 'text', text }], source: { kind } } })
const answered = (seq, text) => ({ type: 'assistant/message', seq, data: { message: { content: [{ type: 'text', text }] } } })
const called = (seq, id, name, args) => ({ type: 'tool/call', seq, data: { callId: id, name, arguments: JSON.stringify(args) } })
const returned = (seq, id, text, isError = false) => ({ type: 'tool/result', seq, data: { message: { toolCallId: id, content: [{ type: 'text', text }], isError } } })
const ZJU = 'node D:\\app\\core\\zju\\scripts\\zju.ts'
const FLOW = '# 本科选课工作流\n\n在自主选课里找课：`zdbk selection sections` 找教学班，`zdbk selection select` 提交志愿，`zdbk selection selected` 回查。\n'
const KEPT = '有一行没有删（只删「还不熟」里挪到「学过」的原样一行）'

function fixture(t, { ask = async () => '{"memory":[],"flow":[]}', courses = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-review-'))
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }) })
  const flowsDir = path.join(root, 'flows')
  fs.mkdirSync(path.join(flowsDir, 'course-selection'), { recursive: true })
  fs.writeFileSync(path.join(flowsDir, 'course-selection', 'SKILL.md'), FLOW)
  const store = new ProfileStore(path.join(root, 'profile'))
  const flowNotes = new FlowNotes({ file: store.file('flow-notes.json'), flowsDir })
  const timers = [], asked = [], sessions = new Map()
  const review = new Review({
    store, flowNotes, ask: async (input) => { asked.push(input); return ask(input) }, sessionOf: id => sessions.get(id), courses: () => courses,
    settingsFile: store.file('review.json'), logFile: store.file('review-log.json'), stateFile: path.join(root, 'cache', 'review.json'), idleMs: 600_000,
    setTimer: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer }, clearTimer: (timer) => { timers.splice(timers.indexOf(timer), 1) },
    now: () => new Date('2026-10-12T12:00:00Z'),
  })
  /** 到点：把等着的计时器都触发，等排着的复盘跑完。 */
  const elapse = async () => { for (const timer of timers.splice(0)) timer.fn(); await review.queue }
  return { root, store, flowNotes, review, timers, asked, sessions, elapse }
}

test('摘要：只认人说的话，校园命令看信封，上次看过的只留用户的话', () => {
  const events = [
    { type: 'session/title', seq: 1, data: { title: '查课表' } },
    said(2, '<运行环境>', 'runtime-context'),
    said(3, '我明天第一节是什么课'),
    called(4, 'a', 'pwsh', { command: `${ZJU} zdbk timetable --week 6` }),
    returned(5, 'a', '{ "ok": true, "data": {} } [stderr] [zju] 登录成功 [exit code: 1]'),
    answered(6, '明天第一节是线性代数。'),
    said(7, '把这份文件放到 D 盘'),
    called(8, 'b', 'pwsh', { command: 'Copy-Item a.txt D:\\a.txt' }),
    returned(9, 'b', 'Access is denied [sandbox: file access denied under workspace-write mode] [exit code: 1]'),
    called(10, 'c', 'pwsh', { command: `${ZJU} doc text --file a.pdf` }),
    returned(11, 'c', '{ "ok": false, "error": { "code": "DEPENDENCY_MISSING" } } [exit code: 1]'),
    answered(12, '放不过去，那里不在能写的范围里。'),
  ]
  const whole = digest(events)
  assert.deepEqual(whole.said, ['我明天第一节是什么课', '把这份文件放到 D 盘'])
  assert.equal(whole.fresh, 2)
  // 校园命令往 stderr 写过东西以后退出码是 1，有信封时照信封算成功；被权限拦住的、信封说不行的是失败。
  assert.deepEqual(whole.ran, ['zdbk timetable --week 6'])
  assert.equal(whole.lastSeq, 12)
  assert.match(whole.text, /^# 对话：查课表\n用户这次说了 2 次，工具调用 3 次/)
  assert.match(whole.text, /\[调用 pwsh\] node D:\\app\\core\\zju\\scripts\\zju\.ts zdbk timetable --week 6\n {2}→ 成功：/)
  assert.match(whole.text, /Copy-Item a\.txt D:\\a\.txt\n {2}→ 失败：/)
  assert.doesNotMatch(whole.text, /运行环境/)
  // 上次看到第 6 条：前一轮只留用户的话，后一轮完整给。
  const later = digest(events, { since: 6 })
  assert.equal(later.fresh, 1)
  assert.deepEqual(later.ran, [])
  assert.match(later.text, /前面还有 1 轮，上次已经看过，该记的那时已经记了，不要再从里面取东西。那时用户说的是：）\n\[用户\] 我明天第一节是什么课\n\n（下面是这次要看的：）\n\[用户\] 把这份文件放到 D 盘/)
  assert.doesNotMatch(later.text, /线性代数/)
  assert.equal(digest(events, { since: 12 }).fresh, 0)
  // 太长时从最后一轮往前留，略去的几轮里用户的话还在。
  const long = [said(1, '我想大三去交换'), answered(2, '好。'.repeat(3000)), said(3, '算了，不去了'), answered(4, '行。'.repeat(3000)), said(5, '查一下校历'), answered(6, '校历在这。')]
  const tight = digest(long, { budget: 500 })
  assert.match(tight.text, /\[用户\] 我想大三去交换\n\[用户\] 算了，不去了\n（以上 2 轮只留了用户的话）\n\n\[用户\] 查一下校历\n\[助手\] 校历在这。/)
})

test('提示：规矩和工作流在系统提示里，记忆和对话在用户消息里；回答不是 JSON 就抛错', () => {
  const system = systemPrompt({ flows: [{ name: 'course-selection', title: '本科选课工作流', text: '# 本科选课工作流\n正文' }], notes: [{ flow: 'course-selection', text: '实验课在单独的页面里选。' }] })
  assert.match(system, /^你是「校园智能体」的复盘员[\s\S]*## 已有的工作流\n\n### 工作流 course-selection\n\n# 本科选课工作流\n正文\n\n已有的补充：\n- 实验课在单独的页面里选。$/)
  assert.match(userPrompt({ memories: [{ title: '讲解偏好', raw: '---\ntags: [偏好]\n---\n- 他希望先看例子\n' }], digest: '# 对话：x\n' }), /^## 已有的记忆\n\n### 讲解偏好\n---\ntags: \[偏好\]\n---\n- 他希望先看例子\n\n## 这次对话\n\n# 对话：x\n$/)
  assert.match(userPrompt({ memories: [], digest: 'x' }), /## 已有的记忆\n\n（还没有）/)
  assert.deepEqual(parseProposal('好的：\n```json\n{"memory":[{"type":"讲解偏好"}],"reason":"r"}\n```'), { memory: [{ type: '讲解偏好' }], flow: [], reason: 'r' })
  assert.throws(() => parseProposal('这次没有要写的。'), /不是要的格式/)
})

test('核对记忆：依据和每一行都要对得上用户的话，删除只认「还不熟」里挪到「学过」的一行', t => {
  const { store } = fixture(t)
  const shelf = store.memory
  shelf.saveByAssistant({ title: '线性代数', tags: ['课程'], body: '## 学过\n- 行列式的计算\n\n## 还不熟\n- 特征值的计算\n- 二次型\n\n第三章的讲解还在做。' })
  shelf.saveByAssistant({ title: '讲解方式偏好', tags: ['偏好'], body: '- 他希望先看例子' })
  shelf.saveByAssistant({ title: '大学化学', tags: ['课程'], body: '## 学过\n- 化学平衡', archived: true })
  const summary = digest([said(1, '特征值的计算我现在会了，\n但二次型的标准形还是不会。以后讲的时候多画图。'), answered(2, '好，特征值就是让 Av = λv 的那个 λ，求它要解特征方程。'), said(3, '我室友在学复变函数，大学化学他也没学过')])
  const check = (proposal, extra = {}) => vet({ memory: [], flow: [], ...proposal }, { notes: shelf.list().notes, owned: note => shelf.owned(note), summary, ...extra })
  const why = (proposal, extra) => check(proposal, extra).dropped.map(item => item.why)
  const signal = ['特征值的计算我现在会了， 但二次型的标准形还是不会']

  const good = check({ memory: [
    { type: '课程', title: '线性代数', signal, add: [{ under: '学过', line: '特征值的计算：他说现在会了' }, { under: '还不熟', line: '二次型的标准形还是不会' }], remove: ['- 特征值的计算', '第三章的讲解还在做。', '行列式的计算'] },
    { type: '讲解偏好', title: '', signal: ['以后讲的时候多画图'], add: [{ line: '他希望讲的时候多画图' }] },
  ] })
  assert.deepEqual(good.memory.map(item => [item.title, item.add.map(entry => `${entry.under}|${entry.line}`), item.remove]), [
    ['线性代数', ['学过|特征值的计算：他说现在会了', '还不熟|二次型的标准形还是不会'], ['- 特征值的计算']],
    // 已有一条说同一类事、标题不一样的，往它里面加。
    ['讲解方式偏好', ['|他希望讲的时候多画图'], []],
  ])
  // 不在「还不熟」下面的两行没有删。
  assert.deepEqual(good.dropped.map(item => item.why), [KEPT, KEPT])
  // 「学过」要加的那一行和「还不熟」里要删的那一行一字不差：照样挪过去，不会因为「已经有了」把它丢掉。
  const moved = check({ memory: [{ type: '课程', title: '线性代数', signal, add: [{ under: '学过', line: '特征值的计算' }], remove: ['特征值的计算'] }] })
  assert.deepEqual([moved.memory[0].add, moved.memory[0].remove, moved.dropped], [[{ under: '学过', line: '特征值的计算' }], ['特征值的计算'], []])
  // 没有对应的「学过」就不删；只删不加的整条不做。
  assert.deepEqual(check({ memory: [{ type: '课程', title: '线性代数', signal, add: [{ under: '还不熟', line: '二次型的标准形还是不会' }], remove: ['特征值的计算'] }] }).memory[0].remove, [])
  assert.deepEqual(why({ memory: [{ type: '课程', title: '线性代数', signal, add: [], remove: ['特征值的计算'] }] }), [KEPT, '没有要加的内容'])

  // 依据是助手说的话，或者对话里根本没有。
  assert.deepEqual(why({ memory: [{ type: '课程', title: '线性代数', signal: ['特征值就是让 Av = λv 的那个 λ'], add: [{ under: '学过', line: '特征值的计算' }] }] }), ['依据不是用户说过的话'])
  assert.deepEqual(why({ memory: [{ type: '目标与打算', signal: ['我打算考研'], add: [{ line: '他打算考研' }] }] }), ['依据不是用户说过的话'])
  assert.deepEqual(why({ memory: [{ type: '兴趣', signal, add: [{ line: '他喜欢数学' }] }] }), ['不是那四类里的'])
  // 依据是用户的话，写下的一行却是助手讲的内容，或者凭空来的。
  assert.deepEqual(why({ memory: [{ type: '课程', title: '线性代数', signal, add: [{ under: '学过', line: '求特征值要解特征方程' }] }] }), ['有一行和用户说过的话对不上', '没有要加的内容'])
  assert.deepEqual(why({ memory: [{ type: '个人背景', signal, add: [{ line: '他是转专业过来的学生' }] }] }), ['有一行和用户说过的话对不上', '没有要加的内容'])
  // 放宽确认的话不记，哪怕用户真说过。
  assert.deepEqual(why({ memory: [{ type: '讲解偏好', signal, add: [{ line: '他说以后选课都不用再向他确认' }, { line: '他希望作业做完直接提交' }, { line: '他说以后不要再问他，默认他已经同意' }] }] }), ['放宽确认的话不记', '放宽确认的话不记', '放宽确认的话不记', '没有要加的内容'])
  // 正常的偏好里带着「确认」「直接」「问他」的不算放宽：这几句被拦是因为用户没说过，不是因为那道拦截。
  assert.deepEqual(why({ memory: [{ type: '讲解偏好', signal, add: [{ line: '他希望讲题时先确认他的思路' }, { line: '他希望代码直接发完整的' }, { line: '他希望删文件之前别忘了先问他' }] }] }), ['有一行和用户说过的话对不上', '有一行和用户说过的话对不上', '有一行和用户说过的话对不上', '没有要加的内容'])
  // 归档了的不动；课程的行要说放在哪个小标题下面；太长的不要。
  assert.deepEqual(why({ memory: [{ type: '课程', title: '大学化学', signal, add: [{ under: '学过', line: '大学化学他也没学过' }] }] }), ['这一条已经归档了'])
  assert.deepEqual(why({ memory: [{ type: '课程', title: '线性代数', signal, add: [{ under: '看过的讲解', line: '特征值的计算现在会了' }] }] }), ['没说加在「学过」还是「还不熟」下面', '没有要加的内容'])
  assert.deepEqual(why({ memory: [{ type: '个人背景', signal, add: [{ line: '长'.repeat(161) }] }] }), ['有一行太短或太长', '没有要加的内容'])
  // 已经记过的不再加一遍；之前被用户撤销过的不写回来；一次最多两条记忆。
  const noted = shelf.list().notes.map(note => note.title === '讲解方式偏好' ? { ...note, body: `${note.body}- 他希望讲的时候多画图\n` } : note)
  assert.deepEqual(why({ memory: [{ type: '讲解偏好', signal, add: [{ line: '他希望讲的时候多画图' }] }] }, { notes: noted }), ['没有要加的内容'])
  assert.deepEqual(why({ memory: [{ type: '讲解偏好', signal, add: [{ line: '他希望讲的时候多画图' }] }] }, { undone: new Map([['讲解方式偏好', new Set(['他希望讲的时候多画图'])]]) }), ['这一行之前被撤销过', '没有要加的内容'])
  assert.deepEqual(why({ memory: [1, 2, 3].map(() => ({ type: '个人背景', signal, add: [{ line: '他说二次型的标准形还是不会' }] })) }), ['一次对话最多两条'])
  // 同一条记忆拆成两条建议的，合成一条。
  assert.equal(check({ memory: [{ type: '个人背景', signal, add: [{ line: '他说二次型的标准形还是不会' }] }, { type: '个人背景', signal, add: [{ line: '他希望讲的时候多画图' }] }] }).memory[0].add.length, 2)
})

test('核对课程名：简称对上已有的那一门，新建只认他上过的课，知识点和别的条目不能当课', t => {
  const { store } = fixture(t)
  const shelf = store.memory
  shelf.saveByAssistant({ title: '微积分（甲）Ⅰ', tags: ['课程'], body: '## 学过\n- 极限' })
  shelf.saveByAssistant({ title: '个人背景', tags: ['背景'], body: '- 他是转专业来的' })
  const summary = digest([said(1, '微积分的洛必达法则我总用错，信号与系统的卷积我会算了，个人背景那条不用改')])
  const signal = ['微积分的洛必达法则我总用错']
  const course = (title, extra = {}) => vet({ flow: [], memory: [{ type: '课程', title, signal, add: [{ under: '还不熟', line: '洛必达法则总用错' }] }] }, { notes: shelf.list().notes, owned: note => shelf.owned(note), summary, ...extra })
  // 简称只对上一门时就是它；对上几门就不写。
  assert.deepEqual(course('微积分').memory.map(item => [item.title, Boolean(item.note)]), [['微积分（甲）Ⅰ', true]])
  const two = [...shelf.list().notes, { title: '微积分（甲）Ⅱ', tags: ['课程'], body: '', properties: [] }]
  assert.deepEqual(course('微积分', { notes: two }).dropped.map(item => item.why), ['有几门课的名字都像它，不知道是哪一门'])
  // 还没有条目的课：只在他上过的课里才新建，标题用正式的课名；不在里面的、对话里没提到的都不建。
  assert.deepEqual(course('信号与系统', { courses: ['信号与系统', '信号与系统实验'] }).memory.map(item => [item.title, item.note]), [['信号与系统', null]])
  assert.deepEqual(course('信号', { courses: ['信号与系统'] }).memory.map(item => item.title), ['信号与系统'])
  assert.deepEqual(course('信号与系统').dropped.map(item => item.why), ['不是他上过的课，没有新建'])
  assert.deepEqual(course('卷积', { courses: ['信号与系统'] }).dropped.map(item => item.why), ['不是他上过的课，没有新建'])
  assert.deepEqual(course('数字逻辑', { courses: ['数字逻辑设计'] }).dropped.map(item => item.why), ['对话里没有提到这门课'])
  // 标题是别的记忆的，不能当课程往里加「学过」「还不熟」。
  assert.deepEqual(course('个人背景').dropped.map(item => item.why), ['这个标题已经是别的记忆了，不是课程'])
})

test('核对工作流的补充：要照这个工作流办成了事，要有用户纠正的原话，放宽确认的不收', () => {
  const flows = [{ name: 'course-selection', title: '本科选课工作流', text: FLOW }]
  const ran = (...commands) => commands.flatMap((command, index) => [called(10 + index * 2, `c${index}`, 'pwsh', { command: `${ZJU} ${command}` }), returned(11 + index * 2, `c${index}`, '{ "ok": true }')])
  const talk = (text, ...commands) => digest([said(1, text), ...ran(...commands)])
  const flow = { target: 'course-selection', signal: ['体育课不在自主选课里'], line: '体育课不在自主选课里，在单独的体育课页面里选。', source: '用户说' }
  const check = (summary, item = flow) => vet({ memory: [], flow: [item] }, { notes: [], owned: () => true, summary, flows })
  const fixed = talk('体育课不在自主选课里，在体育课那一页。低定的时候直接提交就行，不用再问我', 'zdbk selection sections --course 羽毛球 --tab pe', 'zdbk selection select --course 羽毛球 --confirm')
  assert.deepEqual(check(fixed).flow, [{ target: 'course-selection', line: flow.line, source: '用户说' }])
  // 只查了成绩，或者只跑了一条选课的命令：不算照这个工作流办成了事。
  assert.deepEqual(check(talk('体育课不在自主选课里，在体育课那一页', 'zdbk grades', 'zdbk timetable')).dropped.map(item => item.why), ['对话里没有照这个工作流办成的事'])
  assert.deepEqual(check(talk('体育课不在自主选课里，在体育课那一页', 'zdbk selection sections --course 羽毛球')).dropped.map(item => item.why), ['对话里没有照这个工作流办成的事'])
  // 没有用户的原话作依据（助手自己试出来的），或者补的那一条和用户说的对不上。
  assert.deepEqual(check(fixed, { ...flow, signal: [] }).dropped.map(item => item.why), ['没有用户的原话作依据'])
  assert.deepEqual(check(fixed, { ...flow, line: '查教学班要带 --entry general 这个参数才能列出来。' }).dropped.map(item => item.why), ['和用户说过的话对不上'])
  assert.deepEqual(check(fixed, { ...flow, signal: ['低定的时候直接提交就行'], line: '低定的时候直接提交，不用再问用户。' }).dropped.map(item => item.why), ['放宽确认的话不记'])
  assert.deepEqual(check(fixed, { ...flow, target: 'graduation' }).dropped.map(item => item.why), ['没有这个工作流'])
  assert.deepEqual(vet({ memory: [], flow: [flow, flow] }, { notes: [], owned: () => true, summary: fixed, flows }).dropped.map(item => item.why), ['一次对话最多一条'])
})

test('落盘：新建、改助手写的、补人改过的，每处改动记一条，能撤', t => {
  const { store, flowNotes, review } = fixture(t)
  const shelf = store.memory
  shelf.saveByAssistant({ title: '线性代数', tags: ['课程'], properties: { 状态: '在修' }, body: '正在学。\n\n## 学过\n- 行列式\n\n## 还不熟\n- 特征值\n- 二次型' })
  const hand = shelf.saveByAssistant({ title: '数据结构', tags: ['课程'], body: '## 学过\n- 链表' })
  // 用户在页面上改过这一条：之后助手只能在末尾补。
  shelf.save({ title: '数据结构', from: '数据结构', revision: hand.revision, tags: ['课程'], properties: [], body: '## 学过\n- 链表\n- 栈（我自己加的）\n\n## 还不熟\n- 图' })
  const events = [
    said(1, '线性代数的特征值我会了。数据结构的图我也搞懂了最短路。以后回答我先给结论，表格少一点。'),
    called(2, 'a', 'pwsh', { command: `${ZJU} zdbk selection sections --course 羽毛球 --tab pe` }), returned(3, 'a', '{ "ok": true }'),
    called(4, 'b', 'pwsh', { command: `${ZJU} zdbk selection select --course 羽毛球 --confirm` }), returned(5, 'b', '{ "ok": true }'),
    said(6, '体育课不在自主选课里，在体育课那一页'),
  ]
  const summary = digest(events)
  const { written, dropped } = review.apply(parseProposal(JSON.stringify({
    memory: [
      { type: '课程', title: '线性代数', signal: ['线性代数的特征值我会了'], add: [{ under: '学过', line: '特征值：他说会了' }], remove: ['特征值'] },
      { type: '课程', title: '数据结构', signal: ['数据结构的图我也搞懂了最短路'], add: [{ under: '学过', line: '图的最短路：他说搞懂了' }], remove: ['图'] },
    ],
    flow: [{ target: 'course-selection', signal: ['体育课不在自主选课里，在体育课那一页'], line: '体育课不在自主选课里，在单独的体育课页面里选（用户说）。', source: '用户说' }],
  })), { summary, session: 's1' })
  assert.deepEqual(written.map(entry => [entry.kind, entry.title, entry.created, entry.added, entry.removed]), [
    ['memory', '线性代数', false, ['学过：特征值：他说会了'], ['特征值']],
    ['memory', '数据结构', false, ['学过：图的最短路：他说搞懂了'], []],
    ['flow', '本科选课工作流', undefined, ['体育课不在自主选课里，在单独的体育课页面里选（用户说）。'], []],
  ])
  // 人改过的那条不删行。
  assert.deepEqual(dropped.map(item => item.why), [KEPT])
  assert.equal(shelf.note('线性代数').body, '正在学。\n\n## 学过\n- 行列式\n- 特征值：他说会了\n\n## 还不熟\n- 二次型\n')
  assert.deepEqual(shelf.note('线性代数').properties, [{ key: '状态', value: '在修' }])
  assert.equal(shelf.owned(shelf.note('线性代数')), true)
  assert.equal(shelf.note('数据结构').body, '## 学过\n- 链表\n- 栈（我自己加的）\n\n## 还不熟\n- 图\n\n## 助手补充\n- 学过：图的最短路：他说搞懂了\n')
  // 补充里已经写了「用户说」，后面不再跟一遍。
  assert.match(flowNotes.section(), /- 体育课不在自主选课里，在单独的体育课页面里选（用户说）。\n$/)
  // 依据（用户的原话）不进日志；改之前的全文不给页面。
  assert.doesNotMatch(fs.readFileSync(store.file('review-log.json'), 'utf8'), /signal|线性代数的特征值我会了/)
  const shown = review.snapshot()
  assert.equal(shown.enabled, true)
  assert.deepEqual(shown.entries.map(entry => [entry.title, entry.session, 'before' in entry]), [['本科选课工作流', 's1', false], ['数据结构', 's1', false], ['线性代数', 's1', false]])

  // 新建：别的三类各一条，标题就是类别。
  const pref = line => ({ flow: [], memory: [{ type: '讲解偏好', signal: ['以后回答我先给结论，表格少一点'], add: [{ line }] }] })
  const more = review.apply(pref('他希望回答先给结论'), { summary, session: 's1' })
  assert.deepEqual(more.written.map(entry => [entry.title, entry.created]), [['讲解偏好', true]])
  assert.equal(shelf.note('讲解偏好').raw, '---\ntags: [偏好]\n来源: 本人说的\n---\n- 他希望回答先给结论\n')
  const again = review.apply(pref('他希望表格少一点'), { summary, session: 's2' })
  assert.equal(shelf.note('讲解偏好').body, '- 他希望回答先给结论\n- 他希望表格少一点\n')

  // 撤销：同一条整理过两次的，从最近一次往回撤；换回原样以后「助手写的」这个身份照旧；新建的整条拿掉；补充拿掉。
  const id = title => review.entries().find(entry => entry.title === title).id
  assert.throws(() => review.undo({ id: id('讲解偏好') }), /后来又改过/)
  review.undo({ id: again.written[0].id })
  assert.equal(shelf.note('讲解偏好').body, '- 他希望回答先给结论\n')
  // 撤销过的那一行，同样的建议再来也不写回去。
  assert.deepEqual(review.apply(pref('他希望表格少一点'), { summary, session: 's2' }).dropped.map(item => item.why), ['这一行之前被撤销过', '没有要加的内容'])
  review.undo({ id: id('讲解偏好') })
  assert.equal(shelf.find('讲解偏好'), null)
  review.undo({ id: id('线性代数') })
  assert.equal(shelf.note('线性代数').body, '正在学。\n\n## 学过\n- 行列式\n\n## 还不熟\n- 特征值\n- 二次型\n')
  assert.equal(shelf.owned(shelf.note('线性代数')), true)
  review.undo({ id: id('本科选课工作流') })
  assert.equal(flowNotes.section(), '')
  assert.throws(() => review.undo({ id: id('线性代数') }), /已经撤销过了/)
  assert.throws(() => review.undo({ id: 'nope' }), /没有这条整理记录/)

  // 整理以后用户自己又改了这一条：撤不回去了，日志里也不再留着改之前的全文。
  const edited = shelf.note('数据结构')
  shelf.save({ title: '数据结构', from: '数据结构', revision: edited.revision, tags: ['课程'], properties: [], body: '## 学过\n- 链表、栈、图的最短路' })
  assert.equal(review.apply(pref('他希望回答先给结论，表格也少一点'), { summary, session: 's3' }).written.length, 1)
  const stale = review.entries().find(entry => entry.title === '数据结构')
  assert.deepEqual([stale.fixed, 'before' in stale], [true, false])
  assert.equal(review.snapshot().entries.find(entry => entry.title === '数据结构').fixed, true)
  assert.throws(() => review.undo({ id: stale.id }), /后来又改过/)
  assert.doesNotMatch(fs.readFileSync(store.file('review-log.json'), 'utf8'), /栈（我自己加的）/)
})

test('小标题下面加一行：代码块里以 # 开头的行不算标题', () => {
  assert.equal(addUnder('## 学过\n- 递归\n```c\n# include <stdio.h>\n```\n\n## 还不熟\n- 指针', '学过', ['循环']), '## 学过\n- 递归\n```c\n# include <stdio.h>\n```\n- 循环\n\n## 还不熟\n- 指针\n')
  assert.equal(addUnder('开头一句。', '还不熟', ['指针']), '开头一句。\n\n## 还不熟\n- 指针\n')
})

test('什么时候跑：一轮结束后到点没有新的一轮才跑，只看新的几轮；关掉就不跑', async t => {
  const proposal = { memory: [{ type: '目标与打算', signal: ['我打算大三去交换一学期'], add: [{ line: '他打算大三去交换一学期' }] }], flow: [], reason: '自述了长期打算' }
  const { store, review, timers, asked, sessions, elapse } = fixture(t, { ask: async () => JSON.stringify(proposal) })
  const events = [said(1, '我打算大三去交换一学期，现在要准备什么'), answered(2, '先看国际交流处的通知。')]
  const session = { id: 's1', header: { id: 's1' }, snapshotEvents: () => events }
  sessions.set('s1', session)
  const listeners = {}
  const stop = review.watch({ on: (name, listener) => { listeners[name] = listener; return () => { delete listeners[name] } }, get: name => name === 'sessions' ? { get: id => sessions.get(id) } : undefined })
  const emit = (target, type) => { listeners['session/event'](target, { type }) }

  // 一轮结束开始等；又开始新的一轮就不等了。
  emit(session, 'turn/end')
  assert.deepEqual(timers.map(timer => timer.ms), [600_000])
  emit(session, 'turn/start')
  assert.equal(timers.length, 0)
  // 子智能体的会话不看。
  emit({ id: 'child', header: { parentSession: 's1' } }, 'turn/end')
  emit({ id: 'deep', header: { delegationDepth: 1 } }, 'turn/end')
  assert.equal(timers.length, 0)

  emit(session, 'turn/end')
  await elapse()
  assert.equal(asked.length, 1)
  assert.match(asked[0].system, /^你是「校园智能体」的复盘员[\s\S]*### 工作流 course-selection/)
  assert.match(asked[0].text, /## 已有的记忆\n\n（还没有）\n\n## 这次对话\n\n# 对话：[\s\S]*\[用户\] 我打算大三去交换一学期/)
  assert.equal(store.memory.note('目标与打算').body, '- 他打算大三去交换一学期\n')
  assert.deepEqual(review.state().runs.map(run => [run.session, run.wrote, run.dropped]), [['s1', 1, []]])

  // 没有新的一轮：到点也不问模型。
  emit(session, 'turn/end')
  await elapse()
  assert.equal(asked.length, 1)
  // 接着聊了一轮：只把新的一轮完整给，前面的只留用户的话；已有的记忆也带上。
  events.push(said(3, '交换的学分怎么认定'), answered(4, '回来以后找学院教务做学分转换。'))
  emit(session, 'turn/end')
  await elapse()
  assert.equal(asked.length, 2)
  assert.match(asked[1].text, /### 目标与打算\n[\s\S]*前面还有 1 轮，上次已经看过[\s\S]*\[用户\] 交换的学分怎么认定/)
  assert.doesNotMatch(asked[1].text, /国际交流处/)
  // 同样的建议再来一遍，不会记第二次。
  assert.equal(store.memory.note('目标与打算').body, '- 他打算大三去交换一学期\n')
  assert.equal(review.entries().length, 1)

  // 关掉：等着的取消，之后的一轮结束也不再等。
  events.push(said(5, '那我再想想'))
  emit(session, 'turn/end')
  assert.equal(timers.length, 1)
  assert.equal(review.set({ enabled: false }).enabled, false)
  assert.equal(timers.length, 0)
  emit(session, 'turn/end')
  assert.equal(timers.length, 0)
  assert.throws(() => review.set({ enabled: 'yes' }), /无效的设置/)
  review.set({ enabled: true })
  emit(session, 'turn/end')
  stop()
  assert.equal(timers.length, 0)
  assert.equal(listeners['session/event'], undefined)
})

test('模型问不成：记下原因，不算看过，过一阵再试一次', async t => {
  let fail = true
  const { review, timers, asked, sessions, elapse } = fixture(t, { ask: async () => { if (fail) throw new Error('网络断了'); return '这次没有要写的' } })
  const events = [said(1, '帮我看看明天的课')]
  sessions.set('s1', { id: 's1', header: {}, snapshotEvents: () => events })
  review.schedule('s1', {})
  await elapse()
  assert.deepEqual(review.state().runs.map(run => run.error), ['网络断了'])
  assert.deepEqual(review.state().sessions, {})
  // 自己又排了一次；这一次还不成就不再排，等对话下次有动静。
  assert.equal(timers.length, 1)
  await elapse()
  assert.equal(asked.length, 2)
  assert.equal(timers.length, 0)
  // 回答不是要的格式也算没问成。
  fail = false
  review.schedule('s1', {})
  await elapse()
  assert.deepEqual(review.state().runs.map(run => run.error), ['网络断了', '网络断了', '模型的回答不是要的格式'])
  assert.deepEqual(review.state().sessions, {})
})
