/**
 * 学习页（智云课次、学在浙大课件、学习通的大物实验）、课后总结、讲解，和个人档案里的记忆。
 */
import { at, COURSES, course, dayOf } from './data.mjs'

/** 智云上有录播的课，和本学期已经上过的课次（从新到旧）。 */
const ZHIYUN = ['fds', 'phys', 'prob', 'co', 'dm', 'psy']

/** 一门课已经上过的课次：照课表从开学（9月14日）排到今天下午 15:40 以前。 */
export function lessonsOf(id) {
  const item = course(id), list = []
  const start = Date.UTC(2026, 8, 14)
  for (let day = 0; day < 45; day++) {
    const date = new Date(start + day * 86400000), iso = date.toISOString().slice(0, 10)
    const weekday = (date.getUTCDay() + 6) % 7 + 1, week = Math.floor(day / 7) + 1
    if (iso > '2026-10-21') break
    // 10月1日到7日国庆放假，10月17日补10月2日的课不另算。
    if (iso >= '2026-10-01' && iso <= '2026-10-07') continue
    for (const meeting of item.meetings) {
      if (meeting.weekday !== weekday) continue
      if (meeting.weekPattern === '单周' && week % 2 === 0) continue
      if (meeting.weekPattern === '双周' && week % 2 === 1) continue
      if (meeting.location.includes('机房')) continue
      const time = ['08:00', '08:50', '10:00', '10:50', '11:40', '13:25', '14:15', '15:05', '16:15', '17:05', '18:50', '19:40', '20:30'][meeting.periods[0] - 1]
      if (iso === '2026-10-21' && time > '15:00') continue
      list.push({ date: iso, time })
    }
  }
  return list.map((entry, index) => ({ lesson: index + 1, ...entry })).reverse()
}

/** 做过的总结和讲解：课程 id、第几次、讲解的标题。 */
export const SUMMARIES = [{ course: 'fds', lesson: null }, { course: 'phys', lesson: null }, { course: 'prob', lesson: null }, { course: 'psy', lesson: null }, { course: 'dm', lesson: null }]
export const FILMS = [
  { course: 'fds', title: 'AVL 树的四种旋转', state: 'done' },
  { course: 'phys', title: '动生电动势与感生电动势', state: 'done' },
  { course: 'prob', title: '期望与方差的性质', state: 'done' },
  { course: 'co', title: '', state: 'making' },
]
/** 做好的时间：今天的课是下午做的，以前的课是当天晚上。 */
const madeAt = (date, time) => at(date, date === '2026-10-21' ? (time === '22:30' ? '12:50' : '14:35') : time)
const latest = id => lessonsOf(id)[0]
const second = id => lessonsOf(id)[1]
export const filmId = film => `${course(film.course).name}-${film.title}.html`

/** 课后总结的正文，带时间点的分节（数据结构基础最近一次课）。 */
export const FDS_SUMMARY = `# 数据结构基础 第 ${'{n}'} 次课：AVL 树与伸展树

> {when} · 陈老师 · 紫金港东1A-301 · 根据智云回放字幕和课件整理

## 00:02:10 复习：二叉搜索树的退化
- 按有序序列插入时，BST 退化成链表，查找变成 O(n)
- 引出「平衡」：让任意结点左右子树的高度差受控

## 00:11:35 AVL 树的定义
- 平衡因子 BF = 左子树高度 − 右子树高度，AVL 要求每个结点 |BF| ≤ 1
- 高度为 h 的 AVL 树最少结点数满足 n(h) = n(h−1) + n(h−2) + 1，所以 h = O(log n)

## 00:28:50 四种旋转
| 失衡类型 | 插入位置 | 调整方法 |
|---|---|---|
| LL | 左孩子的左子树 | 右旋一次 |
| RR | 右孩子的右子树 | 左旋一次 |
| LR | 左孩子的右子树 | 先左旋再右旋 |
| RL | 右孩子的左子树 | 先右旋再左旋 |
- 只需调整离插入点最近的那个失衡结点（the trouble finder）

## 00:57:20 伸展树（Splay Tree）
- 每次访问后把该结点旋到根：zig、zig-zig、zig-zag 三种情形
- 单次操作可能 O(n)，但 **摊还** 代价 O(log n)

## 01:31:05 摊还分析入门
- 聚合法、记账法、势能法；伸展树用势能函数 Φ = Σ log(子树大小)
- 课上留的思考题：为什么 zig-zig 要先转祖父结点？

## 课后要做的
- HW4 书面作业（学在浙大，**周三 23:59** 截止）
- PTA HW5 树与二叉树（周日 23:00 截止）
`

export const PHYS_SUMMARY = `# 大学物理（乙）Ⅱ 第 ${'{n}'} 次课：法拉第电磁感应定律

> {when} · 张老师 · 根据智云回放整理

## 00:03:40 电磁感应现象
- 磁通量变化 → 感应电动势；楞次定律判断方向

## 00:24:15 动生电动势
- ε = ∫(v × B)·dl，导体棒在匀强磁场中平动 ε = BLv

## 00:52:30 感生电动势与涡旋电场
- 变化的磁场产生涡旋电场，∮E·dl = −dΦ/dt

## 01:20:10 课堂例题
- 旋转线圈的电动势、电磁阻尼

## 课后
- 第三次作业延后到 **周五 23:59**（张老师在课程群里说的）
- 期中考试 10月24日（周六）10:30
`

/** 学习页的总览（learning-read）。 */
export function learningSnapshot() {
  const courses = ZHIYUN.map((id) => {
    const lessons = lessonsOf(id), item = course(id)
    return { id: item.zhiyun, title: item.name, teacher: item.teacher, term: '2026-2027 秋冬', count: lessons.length, last: { lesson: lessons[0].lesson, date: lessons[0].date } }
  }).sort((a, b) => b.last.date.localeCompare(a.last.date) || b.count - a.count)
  const products = [
    ...[['fds', 0], ['phys', 0], ['prob', 1], ['psy', 0], ['dm', 1], ['fds', 2]].map(([id, back]) => {
      const lesson = lessonsOf(id)[back]
      return { kind: 'summary', state: 'done', id: `${course(id).zhiyun}:${lesson.lesson}`, title: `${course(id).name} 第 ${lesson.lesson} 次`, courseId: course(id).zhiyun, lesson: lesson.lesson, course: course(id).name, at: madeAt(lesson.date, '22:30') }
    }),
    ...FILMS.map((film) => {
      const lesson = film.course === 'prob' ? second(film.course) : latest(film.course)
      return film.state === 'done'
        ? { kind: 'film', state: 'done', id: filmId(film), title: film.title, courseId: course(film.course).zhiyun, lesson: lesson.lesson, course: course(film.course).name, at: madeAt(lesson.date, '23:10') }
        : { kind: 'film', state: 'making', id: '', title: '', courseId: course(film.course).zhiyun, lesson: lesson.lesson, course: course(film.course).name, at: at('2026-10-21', '15:20') }
    }),
  ].sort((a, b) => b.at.localeCompare(a.at))
  return { state: 'ready', plugin: 'campus.materials', courses, products, fetchedAt: at('2026-10-21', '15:31'), error: null }
}

/** 一门课的课次（learning-course）。 */
export function coursePage(zhiyunId) {
  const item = COURSES.find(entry => entry.zhiyun === zhiyunId)
  const lessons = lessonsOf(item.id)
  const madeSummary = new Set([0, 2, 4].map(index => lessons[index]?.lesson))
  if (item.id === 'prob' || item.id === 'dm') { madeSummary.clear(); madeSummary.add(lessons[1].lesson) }
  const film = FILMS.find(entry => entry.course === item.id)
  const filmLesson = film ? (item.id === 'prob' ? lessons[1] : lessons[0]).lesson : null
  return {
    course: { id: zhiyunId, title: item.name, teacher: item.teacher, term: '2026-2027 秋冬' },
    lessons: lessons.map((lesson, index) => ({
      lesson: lesson.lesson, date: lesson.date, time: lesson.time,
      saved: index < 3 ? ['video', 'ppt'] : index < 6 ? ['ppt'] : [],
      summary: madeSummary.has(lesson.lesson),
      film: lesson.lesson === filmLesson ? film.state : null,
      ...(lesson.lesson === filmLesson && film.state === 'done' ? { filmId: filmId(film) } : {}),
    })),
    upcoming: 1, fetchedAt: at('2026-10-21', '15:31'), error: null,
  }
}

const WEEK = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
function whenText(lesson) {
  const date = new Date(lesson.date + 'T00:00:00Z'), weekday = (date.getUTCDay() + 6) % 7 + 1
  return `${+lesson.date.slice(5, 7)}月${+lesson.date.slice(8, 10)}日（${WEEK[weekday]}）${lesson.time}`
}

/** 一次课（learning-lesson）。 */
export function lessonPage(zhiyunId, number) {
  const item = COURSES.find(entry => entry.zhiyun === zhiyunId)
  const page = coursePage(zhiyunId), lesson = page.lessons.find(entry => entry.lesson === number) ?? page.lessons[0]
  const film = lesson.film ? FILMS.find(entry => entry.course === item.id) : null
  const summaryText = item.id === 'fds' ? FDS_SUMMARY : item.id === 'phys' ? PHYS_SUMMARY : `# ${item.name} 第 ${'{n}'} 次课\n\n## 00:05:00 本次内容\n- 课堂要点整理见课件\n`
  return {
    course: page.course, lesson: { lesson: lesson.lesson, date: lesson.date, time: lesson.time },
    resources: [
      { kind: 'video', label: '回放', text: `${item.name}-第${lesson.lesson}次-回放.mp4 · 1.2 GB`, saved: lesson.saved.includes('video'), busy: false },
      { kind: 'ppt', label: '课件', text: `第${lesson.lesson}讲.pdf · 38 页`, saved: lesson.saved.includes('ppt'), busy: false },
      { kind: 'screenshot', label: '课堂截图', text: '46 张', saved: false, busy: false },
      { kind: 'subtitle', label: '字幕', text: '智云语音转写 · 2 小时 23 分', saved: lesson.summary, busy: false },
    ],
    partial: false,
    summary: lesson.summary ? { text: summaryText.replace('{n}', String(lesson.lesson)).replace('{when}', whenText(lesson)), at: madeAt(lesson.date, '22:30') } : null,
    film: film ? { state: film.state, id: film.state === 'done' ? filmId(film) : '', title: film.title } : null,
    topic: `${item.name}-第${lesson.lesson}次`, fetchedAt: at('2026-10-21', '15:31'), error: null,
  }
}

/** 学在浙大那一边的课件（xuezai-files）。 */
export function xuezaiFiles(zhiyunId) {
  const item = COURSES.find(entry => entry.zhiyun === zhiyunId)
  const names = item.id === 'fds'
    ? ['第1讲 算法分析.pdf', '第2讲 表、栈和队列.pdf', '第3讲 树.pdf', '第4讲 二叉搜索树.pdf', '第5讲 AVL树与伸展树.pdf', 'HW4 书面作业.pdf', '课程大纲 2026秋冬.pdf', '第5讲 课堂录像.mp4']
    : ['课程大纲.pdf', '第1章.pdf', '第2章.pdf', '第3章.pdf', '第4章.pdf', '习题课讲义.pdf']
  return { course: { id: zhiyunId, title: item.name }, files: names.map((name, index) => ({ id: `${item.xuezai}-f${index}`, name, video: name.endsWith('.mp4'), saved: index < 3, busy: false })), fetchedAt: at('2026-10-21', '15:31'), error: null }
}

/** 学习通：大物实验的章节（chaoxing-read / chaoxing-files）。 */
export function chaoxingSnapshot() {
  return { state: 'ready', plugin: 'campus.materials', courses: [{ id: 'cx-2307', title: '大学物理实验', teacher: '刘老师', className: '2026秋冬 周五上午班' }, { id: 'cx-1188', title: '心理学及应用（线上部分）', teacher: '吴老师', className: '2026秋冬' }], fetchedAt: at('2026-10-21', '15:31'), error: null }
}
export function chaoxingPage(id) {
  const sections = [
    ['1', '绪论', '误差理论与数据处理', 2, 1], ['2', '力学', '杨氏模量的测量', 2, 2], ['3', '热学', '固体比热容的测量', 1, 1],
    ['4', '电磁学', '霍尔效应测磁场', 3, 2], ['5', '电磁学', '示波器的使用', 2, 1], ['6', '光学', '分光计的调节与使用', 2, 2], ['7', '光学', '迈克耳孙干涉仪', 2, 1],
  ]
  return {
    course: id, sections: sections.map(([location, group, title, materials, videos]) => ({
      location, group, title,
      materials: Array.from({ length: materials }, (_, index) => ({ name: index ? `${title} 数据记录表.docx` : `${title} 实验讲义.pdf`, size: index ? '86 KB' : '2.4 MB', downloadable: true, copies: {} })),
      videos: Array.from({ length: videos }, (_, index) => ({ name: `${title} 操作演示${index ? '（二）' : ''}.mp4`, size: '186 MB', downloadable: true, copies: {} })),
    })),
    fetchedAt: at('2026-10-21', '15:31'), error: null,
  }
}

/** 个人档案里的记忆：课程、平台入口、偏好；关系没核实的写「待核实」。 */
export const MEMORY = [
  { title: '大学物理（乙）Ⅱ', tags: ['课程'], properties: [{ key: '老师', value: '张老师' }, { key: '作业', value: '学在浙大' }, { key: '课程群', value: '钉钉「大学物理（乙）Ⅱ 课程群」' }, { key: '录播', value: '智云课堂' }],
    body: '- 每周一下午、周三上午上课，东1B-201\n- 作业在学在浙大交手写拍照 PDF；**第三次作业已延后到 10月23日 23:59**（课程群 10月20日）\n- 期中考试 10月24日（周六）10:30，东1B-201，座位 37\n- 配套实验课是 [[大学物理实验]]（学习通 + 实验选课平台）\n\n相关：[[平台入口]]', updatedAt: at('2026-10-20', '20:40') },
  { title: '数据结构基础', tags: ['课程'], properties: [{ key: '老师', value: '陈老师' }, { key: '作业', value: '学在浙大（书面）· PTA（编程）' }, { key: '课程群', value: '微信「数据结构基础 2026秋冬」' }],
    body: '- PTA 题目集每周日 23:00 截止，书面作业在学在浙大\n- 双周周四下午机房上机（曹光彪西-503）\n- 期中考试时间：**待核实**（助教说 11 月中旬，教务网还没出）', updatedAt: at('2026-10-19', '22:35') },
  { title: '计算机组成', tags: ['课程'], properties: [{ key: '老师', value: '李老师' }, { key: '状态', value: '待核实' }],
    body: '- Lab 报告：模板在学在浙大，**提交方式待核实**（课程群说交学在浙大，助教私聊说的是发邮件）\n- PTA 每章练习题\n- 单周周四晚加一次习题课', updatedAt: at('2026-10-20', '10:20') },
  { title: '概率论与数理统计', tags: ['课程'], properties: [{ key: '老师', value: '王老师' }, { key: '答疑', value: '钉钉「概率论与数理统计 答疑群」' }],
    body: '- 期中 10月31日（周六）14:00，第 1–4 章，可以带计算器\n- 习题在学在浙大，每周四 21:00 前', updatedAt: at('2026-10-20', '16:50') },
  { title: '平台入口', tags: ['平台'], properties: [],
    body: '| 事情 | 去哪 |\n|---|---|\n| 课表、考试、选课 | 教务网 |\n| 作业、课件 | 学在浙大 |\n| 编程题 | PTA |\n| 录播、字幕 | 智云课堂 |\n| 大物实验讲义 | 学习通 |\n| 二课记点 | 素质拓展平台 |\n| 课程群 | 钉钉（大物、概率论、计组）、微信（数据结构） |', updatedAt: at('2026-10-12', '21:00') },
  { title: '讲解偏好', tags: ['偏好'], properties: [],
    body: '- 先给一个直观的例子再推公式\n- 一次讲解 10 分钟以内，配图多一点\n- 公式推导写全，不要跳步', updatedAt: at('2026-10-08', '19:30') },
  { title: '选课偏好', tags: ['偏好'], properties: [],
    body: '- 不选早八；给分和讲得清楚比名气重要\n- 周二晚上已经有心理学，别再排晚课', updatedAt: at('2026-10-05', '14:10') },
  { title: '大学物理实验', tags: ['课程'], properties: [{ key: '老师', value: '刘老师' }, { key: '平台', value: '学习通 · 实验选课平台' }],
    body: '- 双周周五上午 1–4 节，东四物理实验中心\n- 预习报告实验前交，实验报告下次实验时交', updatedAt: at('2026-10-16', '21:15') },
]

export { COURSES, dayOf }
