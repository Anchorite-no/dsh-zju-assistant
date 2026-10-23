/**
 * 副本里假 core（fake-zju.ts、fake-chat.mjs）的结果表：键是「模块 对象 动作」，值是 { data, delayMs?, match? }。
 * match 按某个参数的值再分，例如 chalaoshi teacher 按 --name。内容和 data.mjs 的一学期一致。
 */
import { at, COURSES, course, EXAMS, TASKS } from './data.mjs'
import { lessonsOf } from './learning.mjs'

const name = id => course(id).name

export function coreTable() {
  const todos = TASKS.filter(task => !task.done).map(task => ({ title: task.title, course: name(task.course), source: task.source === 'pta' ? 'PTA' : '学在浙大', deadline: task.deadline, ...(task.note ? { note: task.note } : {}) }))
  return {
    'xuezai todos': { delayMs: 900, data: { todos: todos.filter(todo => todo.source === '学在浙大') } },
    'pta homework list': { delayMs: 800, data: { homework: todos.filter(todo => todo.source === 'PTA') } },
    'xuezai homework view': {
      delayMs: 700,
      data: { title: '第三次作业：电磁感应', course: name('phys'), deadline: at('2026-10-23', '23:59'), originalDeadline: at('2026-10-21', '23:59'), requirement: '教材第 9 章习题 9-3、9-7、9-12、9-15、9-21，手写拍照合成一个 PDF。', attachments: [{ name: '第三次作业.pdf' }], submissions: [] },
      match: { title: { 'Lab 3': { data: { title: 'Lab 3 单周期 CPU 实验报告', course: name('co'), deadline: at('2026-10-26', '23:59'), requirement: '按模板提交 PDF：数据通路图、控制信号表、3 条以上指令的仿真波形与分析。', attachments: [{ name: 'Lab3 实验报告模板.docx' }, { name: 'Lab3 指令测试集.zip' }], submissions: [] } } } },
    },
    'xuezai homework submit': { delayMs: 1500, data: { submitted: true, file: 'Lab3-实验报告.pdf', at: at('2026-10-21', '15:43'), records: [{ file: 'Lab3-实验报告.pdf', size: '2.1 MB', status: '已提交' }] } },
    'pta homework view': { delayMs: 800, data: { title: 'HW5 树与二叉树', deadline: at('2026-10-25', '23:00'), progress: '6/10', problems: Array.from({ length: 10 }, (_, i) => ({ id: '7-' + (i + 1), type: i < 4 ? '判断' : i < 7 ? '选择' : '编程', score: i < 7 ? 2 : 20, state: i < 6 ? '答对' : '未作答' })) } },
    'pta problem view': { delayMs: 700, data: { id: '7-7', title: '树的同构', limits: { time: '400 ms', memory: '64 MB' }, text: '给定两棵树 T1 和 T2，如果 T1 可以通过若干次左右孩子互换变成 T2，则称两棵树同构……' } },
    'zhiyun download': { delayMs: 1500, data: { saved: [{ kind: 'subtitle', name: '大学物理（乙）Ⅱ-第10次-字幕.srt' }] } },
    'xuezai material list': { delayMs: 700, data: { files: ['第9章 电磁感应.pdf', '第9章 习题课.pdf', '第三次作业.pdf', '期中复习提纲.pdf', '第8章 稳恒磁场.pdf'].map(file => ({ name: file })) } },
    'xuezai material download': { delayMs: 1600, data: { saved: [{ name: '第5讲 AVL树与伸展树.pdf', path: '下载\\CampusAgent\\数据结构基础\\第5讲 AVL树与伸展树.pdf' }] } },
    'zdbk exams': { delayMs: 1100, data: { courses: EXAMS.map(exam => ({ name: name(exam.course), [exam.kind]: { status: exam.location.includes('没出') ? '未公布' : '已公布', date: exam.date, startTime: exam.start, endTime: exam.end, location: exam.location, seat: exam.seat } })) } },
    'zdbk timetable': { delayMs: 1000, data: { term: { year: '2026-2027', term: '秋' }, courses: COURSES.map(item => ({ name: item.name, teacher: item.teacher })), periodTimes: [] } },
    'zdbk selection context': { delayMs: 800, data: { year: '2027-2028', term: '春夏', round: '第一轮', rules: [{ category: '专业必修', wishes: 3 }] } },
    'zdbk selection search': { delayMs: 900, data: { courses: [{ name: '概率论与数理统计', code: '061B0170', credit: 3, category: '专业基础' }, { name: '概率论与数理统计（H）', code: '061B0180', credit: 3.5, category: '荣誉课程' }] } },
    'zdbk selection sections': { delayMs: 1000, data: { sections: [
      { teacher: '王老师', time: '周一第1-2节；周三第3-4节', place: '紫金港东2-202', capacity: 120, remaining: 23 },
      { teacher: '赵老师', time: '周二第6-7节；周四第6-7节', place: '紫金港东1A-201', capacity: 100, remaining: 57 },
      { teacher: '钱老师', time: '周一第11-12节；周四第1-2节', place: '紫金港西2-101', capacity: 90, remaining: 8 },
      { teacher: '孙老师', time: '周三第8-9节；周五第3-4节', place: '紫金港东2-305', capacity: 60, remaining: 0 },
    ] } },
    'chalaoshi teacher': {
      delayMs: 900,
      data: { name: '王老师', rating: 8.9, count: 412, rollcall: '偶尔点名', courses: [{ course: '概率论与数理统计', gpa: 4.12, n: 236 }] },
      match: { name: {
        赵老师: { data: { name: '赵老师', rating: 9.3, count: 287, rollcall: '基本不点名', courses: [{ course: '概率论与数理统计', gpa: 3.98, n: 151 }] } },
        钱老师: { data: { name: '钱老师', rating: 6.8, count: 198, rollcall: '每次点名', courses: [{ course: '概率论与数理统计', gpa: 3.40, n: 120 }] } },
      } },
    },
    'chalaoshi course': { delayMs: 800, data: { teachers: [{ teacher: '王老师', gpa: 4.12, sd: 0.61, n: 236 }, { teacher: '赵老师', gpa: 3.98, sd: 0.70, n: 151 }, { teacher: '钱老师', gpa: 3.40, sd: 0.92, n: 120 }] } },
    'cc98 search': { delayMs: 1000, data: { topics: [{ title: '概率论选课求推荐，王老师和赵老师怎么选', replies: 46 }, { title: '【经验】概统期末复习资料汇总', replies: 128 }, { title: '钱老师的概率论点名太勤了', replies: 33 }, { title: '大二上概统作业量大吗', replies: 21 }] } },
    'cc98 topic view': { delayMs: 900, data: { title: '概率论选课求推荐，王老师和赵老师怎么选', posts: [{ floor: 1, text: '王老师讲得清楚，作业是课本题，给分好。' }, { floor: 2, text: '赵老师板书多，节奏慢一点，适合基础一般的同学。' }, { floor: 3, text: '钱老师要求严，期末偏难。' }] } },
    'zhiyun search lessons': { delayMs: 900, data: { lessons: lessonsOf('phys').slice(0, 6).map(lesson => ({ title: `${name('phys')} 第${lesson.lesson}次`, date: lesson.date, time: lesson.time })) } },
    'zhiyun search subtitles': { delayMs: 1300, data: { hits: [
      { course: name('phys'), lesson: 10, at: '01:31:20', text: '期中考试是这周六上午十点半，就在这个教室，考到第九章第二节' },
      { course: name('phys'), lesson: 9, at: '00:05:12', text: '第三次作业的第五题图画错了，我会在群里发新的图' },
    ] } },
    'notice new': { delayMs: 1100, data: { notices: [
      { title: '紫金港校区东区部分区域10月22日停水通知', from: '综合服务网', date: '2026-10-20' },
      { title: '关于2026-2027学年冬学期第二轮选课安排的通知', from: '本科生院', date: '2026-10-20' },
      { title: '关于组织2025级本科生参加浙江大学程序设计能力测试的通知', from: '计算机科学与技术学院', date: '2026-10-20' },
    ] } },
    'notice list': { delayMs: 1200, data: { notices: [
      { title: '大学物理实验中心2026秋冬学期实验安排及注意事项', from: '物理学院', date: '2026-10-16' },
      { title: '关于做好2026-2027学年秋冬学期期中教学检查工作的通知', from: '本科生院', date: '2026-10-21' },
    ] } },
    'lab selected': { delayMs: 800, data: { labs: [{ title: '霍尔效应测磁场', date: '2026-10-23', time: '08:00-11:35', room: '东四-213' }, { title: '分光计的调节与使用', date: '2026-11-06', time: '08:00-11:35', room: '东四-305' }] } },
    'chaoxing chapter list': { delayMs: 1000, data: { chapters: ['误差理论与数据处理', '杨氏模量的测量', '霍尔效应测磁场', '示波器的使用', '分光计的调节与使用'].map(title => ({ title, materials: 2, videos: 1 })) } },
    'tyys venue list': { delayMs: 1100, data: { venues: [{ name: '紫金港风雨操场 羽毛球', free: ['18:00-19:00 5号场', '20:00-21:00 2号场'] }, { name: '紫金港体育馆 羽毛球', free: ['21:00-22:00 7号场'] }] } },
    'sztz credits': { delayMs: 1000, data: { second: { points: 6.5, need: 10 }, third: { points: 2, need: 4 }, fourth: { points: 1, need: 2 }, items: [{ name: '求是讲坛', points: 1 }, { name: '志愿服务', points: 2.5 }, { name: '学园之夜', points: 1 }] } },
    'sztz activity list': { delayMs: 900, data: { activities: [{ title: '求是讲坛第十二讲：大模型时代的软件工程', points: 0.5, closes: '2026-10-25' }, { title: '紫金港秋季长跑接力赛志愿者', points: 1, closes: '2026-10-23' }] } },
    'doc text': { delayMs: 900, data: { pages: 12, text: '计算机组成 Lab 3 单周期 CPU 实验报告……（共 12 页）' } },
    'cc98 board topics': { delayMs: 900, data: { topics: [{ title: '出 27 寸显示器 九成新 自提紫金港', replies: 8 }, { title: '收一台 24 寸显示器，预算 400', replies: 3 }] } },
    'dingtalk read': { delayMs: 1100, data: { chat: '大学物理（乙）Ⅱ 课程群', messages: [
      { sender: '张老师', sentAt: at('2026-10-20', '20:15'), text: '同学们，第三次作业（电磁感应）截止时间延后两天，改到本周五（10月23日）23:59。' },
      { sender: '张老师', sentAt: at('2026-10-20', '20:16'), text: '第 5 题题图有误，以这张为准。[图片]' },
      { sender: '课代表', sentAt: at('2026-10-20', '20:18'), text: '收到！大家注意第 5 题换图了' },
      { sender: '张老师', sentAt: at('2026-10-21', '09:40'), text: '周六期中考试带学生证和计算器，考到第九章第二节。' },
    ] } },
    'dingtalk list': { delayMs: 700, data: { chats: [{ name: '大学物理（乙）Ⅱ 课程群' }, { name: '概率论与数理统计 答疑群' }, { name: '计算机组成 课程群' }] } },
    'wechat read': { delayMs: 900, data: { chat: '数据结构基础 2026秋冬', messages: [{ sender: '助教', text: 'HW5 题目集已在 PTA 发布，周日 23:00 截止' }] } },
  }
}
