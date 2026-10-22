/**
 * 校园事务页右栏的通知和个人消息。标题照学校各部门、学院官网、公众号的写法编的，链接都是 example.zju.edu.cn 的占位地址。
 * 每条：[来源类别, 来自, 标题, 几天前, 几点（学校通知多数只有日期，写 null）, 额外]。
 * 额外里 hidden 是收起的原因（irrelevant 和这位学生关系不大，blocked 标题里有屏蔽词）。
 */
import { at, dayOf } from './data.mjs'

const S = 'school', W = 'wechat', T = 'sztz'

const SCHOOL = [
  [S, '本科生院', '关于做好2026-2027学年秋冬学期期中教学检查工作的通知', 0, null],
  [S, '综合服务网', '紫金港校区10月24日部分楼宇计划停电的通知', 0, '10:12', { id: 'school:power-1024' }],
  [S, '计算机科学与技术学院', '计算机学院2026年本科生国家奖学金、国家励志奖学金评审结果公示', 1, null],
  [S, '学工部', '关于开展2026年秋季学期学生体质健康测试的通知', 0, '08:40', { id: 'school:tice-2026' }],
  [S, '本科生院', '关于2026-2027学年冬学期第二轮选课安排的通知', 1, null],
  [S, '计算机科学与技术学院', '关于组织2025级本科生参加浙江大学程序设计能力测试的通知', 1, null],
  [S, '综合服务网', '紫金港校区东区部分区域10月22日停水通知', 1, null],
  [S, '图书馆', '图书馆10月25日上午闭馆半天进行系统维护的公告', 1, null],
  [S, '研工部', '关于开展2026年研究生国家奖学金评审工作的通知', 0, '09:50', { hidden: 'irrelevant' }],
  [S, '外国语学院', '外国语学院2027届推荐免试研究生拟录取名单公示', 0, '08:20', { hidden: 'irrelevant' }],
  [S, '综合服务网', '2026年下半年全国大学英语四、六级考试报名通知', 2, null, { id: 'school:cet-2026', memo: true }],
  [S, '学工部', '关于做好2026年度家庭经济困难学生认定工作的通知', 2, null],
  [S, '团委', '关于举办第十九届“挑战杯”全国大学生课外学术科技作品竞赛校内选拔赛的通知', 2, null],
  [S, '计算机科学与技术学院', '2026年浙江大学程序设计竞赛（校赛）报名通知', 2, null],
  [S, '综合服务网', '校园网10月25日凌晨系统升级维护公告', 2, null],
  [S, '丹青学园', '丹青学园关于开展学生宿舍安全卫生检查的通知', 2, null],
  [S, '医学院', '关于医学院2026级新生白大衣授予仪式安排的通知', 2, null, { hidden: 'irrelevant' }],
  [S, '就业指导与服务中心', '某科技公司2027届校园招聘宣讲会（紫金港站）', 2, null, { hidden: 'blocked' }],
  [S, '本科生院', '关于开展2026年秋季学期本科生转专业（类）工作的通知', 3, null],
  [S, '综合服务网', '关于2027年度城乡居民医疗保险（大学生）参保缴费的通知', 3, null],
  [S, '计算机科学与技术学院', '计算机学院“学长计划”第二期朋辈辅导报名', 3, null],
  [S, '研工部', '关于举办第十二届浙江大学研究生学术论坛的通知', 3, null, { hidden: 'irrelevant' }],
  [S, '体育与艺术', '紫金港风雨操场10月下旬开放时间调整', 3, null],
  [S, '学工部', '关于评选2025-2026学年浙江大学优秀学生、优秀学生干部的通知', 4, null],
  [S, '团委', '浙江大学第二十三届“三好杯”志愿服务项目大赛报名通知', 4, null],
  [S, '计算机科学与技术学院', '关于开展2026年秋季学期本科生学业预警谈话的通知', 4, null],
  [S, '体育与艺术', '浙江大学2026年秋季田径运动会报名通知', 4, null],
  [S, '学工部', '关于开展“10·25心理健康月”系列活动的通知', 5, null],
  [S, '物理学院', '大学物理实验中心2026秋冬学期实验安排及注意事项', 5, null],
  [S, '综合服务网', '紫金港校区校车运行时刻调整通知', 5, null],
  [S, '研工部', '关于2027届研究生毕业生就业推荐表发放的通知', 5, null, { hidden: 'irrelevant' }],
  [S, '丹青学园', '丹青学园2026秋冬学期“学园之夜”活动报名', 5, null],
  [S, '图书馆', '关于试用Web of Science新增数据库的通知', 5, null],
  [S, '本科生院', '关于公布2026年本科生暑期社会实践优秀成果的通知', 6, null],
  [S, '团委', '关于开展“青春向党·奋斗强国”主题团日活动的通知', 6, null],
  [S, '计算机科学与技术学院', '关于2025级本科生主修专业确认工作的安排', 6, null],
  [S, '学工部', '关于做好学生宿舍冬季用电安全检查的通知', 8, null],
  [S, '本科生院', '浙江大学2026年秋季学期开学教学检查情况通报', 9, null],
  [S, '计算机科学与技术学院', '计算机学院2026年秋季学期学术报告会安排（第一期）', 11, null],
  [S, '综合服务网', '紫金港校区10月12日部分楼宇停电通知', 12, null],
]

const ACCOUNTS = [
  [W, '浙江大学', '金秋浙大｜紫金港的银杏开始黄了', 0, '12:05'],
  [W, '求是潮', '期中周生存指南：紫金港自习室空位地图', 0, '09:30'],
  [W, '浙大计算机学院', '计算机学院举办2026年秋季学术报告会', 1, '17:20'],
  [W, '浙大青年', '“挑战杯”校赛启动！这些问题你一定关心', 1, '11:00'],
  [W, '浙大学生会', '校运会志愿者招募啦！', 1, '19:45'],
  [W, '浙江大学', '求是讲坛｜人工智能与科学发现', 2, '18:00'],
  [W, '浙大图书馆', '新书速递｜10月计算机类新书来了', 2, '10:15'],
  [W, '求是潮', '紫金港食堂秋季新品测评', 3, '12:30'],
  [W, '浙大计算机学院', '学长说｜大二怎么学好数据结构', 4, '20:00'],
  [W, '浙大心理', '心理健康月｜给自己留一点留白', 5, '08:30'],
]

/** 二课活动：opens、closes 是报名的起止。 */
const ACTIVITIES = [
  { title: '求是讲坛第十二讲：大模型时代的软件工程', from: '计算机学院团委', found: [1, '09:00'], opens: at(dayOf(1), '09:00'), closes: at('2026-10-25', '23:59') },
  { title: '紫金港秋季长跑接力赛志愿者', from: '校团委', found: [2, '14:00'], opens: at(dayOf(2), '14:00'), closes: at('2026-10-23', '18:00') },
  { title: '“书香浙大”读书分享会（第五期）', from: '图书馆', found: [0, '10:00'], opens: at('2026-10-22', '09:00'), closes: at('2026-10-28', '23:59') },
  { title: '2026年秋季无偿献血志愿服务', from: '校红十字会', found: [3, '08:00'], opens: at(dayOf(3), '08:00'), closes: at('2026-10-21', '23:59') },
  { title: '心理健康月：正念减压工作坊', from: '心理健康教育与咨询中心', found: [4, '16:00'], opens: at(dayOf(4), '16:00'), closes: at('2026-10-24', '12:00') },
]

/** 群里的消息（校园通知页签）和私聊、邮件、CC98（个人消息页签）。 */
const CHATS = [
  { platform: 'dingtalk', kind: 'group', from: '大学物理（乙）Ⅱ 课程群', day: 1, time: '20:15', id: 'chat:phys-delay',
    title: '张老师：第三次作业（电磁感应）截止时间延后两天，改到本周五 23:59',
    originals: [
      { sender: '张老师', time: '20:15', text: '同学们，第三次作业（电磁感应）截止时间延后两天，改到本周五（10月23日）23:59，学在浙大上我一会儿同步改。' },
      { sender: '张老师', time: '20:16', text: '第 5 题题图有误，以这张为准。[图片]' },
      { sender: '课代表', time: '20:18', text: '收到！大家注意第 5 题换图了' },
      { sender: '同学', time: '20:21', text: '谢谢老师～' },
    ] },
  { platform: 'wechat', kind: 'group', from: '计科2502班级群', day: 0, time: '11:20', id: 'chat:class-meeting',
    title: '班长：周四班会改到周五晚 7 点，东2-102，记得带体测确认截图',
    originals: [
      { sender: '班长', time: '11:20', text: '通知：周四班会改到周五（10/23）晚 7 点，东2-102。顺便收一下体测时段确认的截图，发我私聊。' },
      { sender: '学习委员', time: '11:24', text: '另外数据结构 HW5 这周日 23:00 截止，PTA 上别忘了' },
      { sender: '同学', time: '11:30', text: '好的' },
    ] },
  { platform: 'wechat', kind: 'group', from: '数据结构基础 2026秋冬', day: 2, time: '21:05', id: 'chat:fds-hw5',
    title: '助教：HW5 题目集已在 PTA 发布，周日 23:00 截止，第 7 题注意边界',
    originals: [{ sender: '助教', time: '21:05', text: 'HW5（树与二叉树）题目集已经在 PTA 发布，本周日 23:00 截止。第 7 题注意空树的边界情况。' }] },
  { platform: 'dingtalk', kind: 'group', from: '概率论与数理统计 答疑群', day: 1, time: '16:40', id: 'chat:prob-mid',
    title: '王老师：期中考试范围第 1–4 章，闭卷，可以带计算器',
    originals: [{ sender: '王老师', time: '16:40', text: '期中考试安排：10月31日（周六）14:00–16:00，范围第 1–4 章，闭卷，可以带计算器。' }] },
  { platform: 'dingtalk', kind: 'group', from: '计算机组成 课程群', day: 2, time: '10:05', id: 'chat:co-lab3',
    title: '李老师：Lab 3 实验报告模板已上传学在浙大，10月26日前提交',
    originals: [{ sender: '李老师', time: '10:05', text: 'Lab 3（单周期 CPU）实验报告模板已上传学在浙大，10月26日 23:59 前提交 PDF。' }] },
  { platform: 'wechat', kind: 'group', from: '计科2502班级群', day: 3, time: '22:10', id: 'chat:class-summary', mode: 'summary',
    title: '群里在统计周末秋游报名、收体测时段截图，另有人问 Lab 3 的模板在哪（12 条）',
    originals: [] },
  // 个人消息
  { platform: 'wechat', kind: 'personal', from: '室友小周', day: 0, time: '14:50', id: 'chat:roommate',
    title: '晚上去不去紫金港健身房？顺便帮我带一下快递', originals: [{ sender: '室友小周', time: '14:50', text: '晚上去不去紫金港健身房？顺便帮我带一下快递，取件码发你了' }] },
  { platform: 'dingtalk', kind: 'personal', from: '计算机组成 助教', day: 1, time: '15:30', id: 'chat:co-ta',
    title: '你的 Lab 2 报告图表编号重复了，改一下重新交就行', originals: [{ sender: '计算机组成 助教', time: '15:30', text: '同学你好，你的 Lab 2 报告图 3 和图 4 编号重复了，改一下重新交就行，不扣分。' }] },
]

const MAIL = [
  ['学在浙大', '作业批改通知：数据结构基础 HW3 已批改', 0, '10:02'],
  ['浙江大学图书馆', '您借阅的图书即将到期（2 册）', 0, '08:30'],
  ['本科生院', '2026秋季学期期中教学调查问卷邀请', 1, '09:00'],
  ['计算机组成 助教', 'Re: Lab 2 报告格式问题', 1, '15:42'],
  ['物理实验教学中心', '大学物理实验预约成功：霍尔效应（10月23日）', 2, '13:10'],
  ['计算机学院学生科', '关于2026年国家奖学金申请材料补交的提醒', 3, '17:35'],
]

const CC98 = [
  ['reply', '有人回复了你的帖子《大二数据结构怎么准备期中》', 0, '13:12'],
  ['at', '在《概率论期中复习资料汇总》中提到了你', 1, '22:40'],
  ['message', '私信：显示器还在吗？想要 27 寸那台', 2, '19:05'],
  ['system', '你的帖子被版主设为精华', 3, '10:00'],
]

/** 拼成页面要的样子（ui/client/Feed.tsx 的 Item）。 */
export function feedItems() {
  const items = []
  const base = { foundAt: null, hidden: null }
  for (const [kind, from, title, ago, time, extra = {}] of [...SCHOOL, ...ACCOUNTS]) {
    const date = dayOf(ago)
    const id = extra.id ?? `${kind}:${items.length}`
    items.push({
      ...base, id, kind, view: 'campus', title, from, at: at(date, time ?? '00:00'), dated: !!time,
      url: `https://example.zju.edu.cn/${kind === 'wechat' ? 'mp' : 'notice'}/${id.replace(/[^a-z0-9]+/gi, '-')}`,
      foundAt: at(date, time ?? '08:00'), hidden: extra.hidden ?? null,
    })
  }
  for (const [index, item] of ACTIVITIES.entries()) {
    const [ago, time] = item.found
    const start = at(dayOf(ago), time)
    items.push({ ...base, id: `sztz:${index}`, kind: 'sztz', view: 'campus', title: item.title, from: item.from, at: start, dated: true,
      url: `https://example.zju.edu.cn/sztz/activity-${index}`, foundAt: at(dayOf(ago), time), opens: item.opens, closes: item.closes })
  }
  for (const chat of CHATS) {
    const date = dayOf(chat.day)
    items.push({
      ...base, id: chat.id, kind: 'chat', view: chat.kind === 'group' ? 'campus' : 'personal', title: chat.title, from: chat.from,
      at: at(date, chat.time), dated: true, url: '', foundAt: at(date, chat.time), platform: chat.platform, chatKind: chat.kind, mode: chat.mode ?? 'original',
      originals: chat.originals.map((message, index) => ({ id: `${chat.id}:${index}`, sentAt: at(date, message.time), sender: { name: message.sender }, text: message.text })),
      ...(chat.mode === 'summary' ? { body: chat.title } : {}),
    })
  }
  for (const [index, [from, title, ago, time]] of MAIL.entries()) {
    const date = dayOf(ago)
    items.push({ ...base, id: `mail:${index}`, kind: 'mail', view: 'personal', title, from, at: at(date, time), dated: true, url: '', foundAt: at(date, time) })
  }
  for (const [index, [kind, title, ago, time]] of CC98.entries()) {
    const date = dayOf(ago)
    items.push({ ...base, id: `cc98:${index}`, kind: 'cc98', view: 'personal', title, from: kind === 'system' ? '系统消息' : ['计算机系的小透明', '概率不挂科', '紫金港二手群主', ''][index] || 'CC98', at: at(date, time), dated: true, url: '', foundAt: at(date, time), cc98Kind: kind })
  }
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

/** 通知点开以后的正文（NoticeContent.tsx 的 Content）。没写的按标题给一段通用的。 */
export function noticeContent(item) {
  const facts = [['来源', item.from], ['发布', item.at.slice(0, 10)]]
  if (item.kind === 'chat') return { title: item.title, from: item.from, facts, originalUrl: null, messages: item.originals, ...(item.mode === 'summary' ? { summary: item.title } : {}) }
  const bodies = {
    'school:tice-2026': '各学院（系）、各学园：\n\n根据《国家学生体质健康标准》要求，现将2026年秋季学期学生体质健康测试有关事项通知如下。\n\n**一、测试对象**\n\n全体在校本科生。2025级本科生统一安排在 **10月29日（周四）13:30** 起，在紫金港校区东田径场测试。\n\n**二、测试项目**\n\n50米跑、800米（女）/1000米（男）、立定跳远、坐位体前屈、仰卧起坐（女）/引体向上（男），以及身高体重、肺活量。\n\n**三、时段确认**\n\n请于 **10月27日17:00前** 登录体测系统确认测试时段，逾期不再调整。\n\n**四、注意事项**\n\n穿运动鞋，携带校园卡；因病不能参加者，凭校医院证明向所在学园辅导员申请缓测。\n\n党委学生工作部\n2026年10月20日',
    'school:cet-2026': '2026年下半年全国大学英语四、六级考试将于12月19日举行。报名时间为10月22日9:00至10月28日17:00，请先在综合服务网确认报考资格，再前往考试报名网站完成缴费。',
  }
  const body = bodies[item.id] ?? `${item.title}。\n\n各有关单位、全体学生：\n\n现将有关事项通知如下，请相互转告，按时完成。具体安排见附件。\n\n${item.from}\n${item.at.slice(0, 10)}`
  return { title: item.title, from: item.from, markdown: body, facts, originalUrl: item.url || null, ...(item.kind === 'school' ? { attachments: [{ name: '附件1：具体安排.pdf', index: 0 }] } : {}) }
}
