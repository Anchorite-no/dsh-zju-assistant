/**
 * 演示用的一学期：一名化名「林同学」的 2025 级计算机学院本科生，2026-2027 学年秋学期第 6 周的星期三下午。
 * 所有页面（校园事务、日程表、学习、个人档案、对话里的校园命令）都从这一份里取，同一件事在各处对得上，
 * 例如张老师在钉钉课程群里说「第三次作业延后两天」：作业卡、备忘录、日程表、通知、对话里都是周五 23:59。
 * 没有真实的人名、学号、手机号；老师一律「X老师」，学号、手机号用明显假的。
 */

/** 演示里的「现在」：北京时间 2026-10-21（周三）15:40，秋学期第 6 周（双周）。 */
export const DEMO_NOW = process.env.DEMO_NOW || '2026-10-21T15:40:00+08:00'
export const TODAY = '2026-10-21'

/** 某天某时（北京时间）的 ISO 写法。 */
export const at = (date, time = '00:00') => `${date}T${time}:00+08:00`
/** 从今天往前（负数往后）几天的日期。 */
export function dayOf(offset) {
  const base = Date.UTC(2026, 9, 21) - offset * 86400000
  return new Date(base).toISOString().slice(0, 10)
}

export const STUDENT = {
  display_name: '林同学', college: '计算机科学与技术学院', major_name: '计算机科学与技术', major_code: '080901',
  grade: '2025', student_level: '本科', campus: '紫金港校区',
}

/** 课程：教务网的课表、学在浙大、智云、学习通、课程群用的都是这一份名字。 */
export const COURSES = [
  { id: 'fds', name: '数据结构基础', teacher: '陈老师', code: '211C0020', credit: 2.5, xuezai: 'xz-61021', zhiyun: 'zy-88201', group: { platform: 'wechat', name: '数据结构基础 2026秋冬' },
    meetings: [{ weekday: 1, periods: [3, 4, 5], location: '紫金港东1A-301', weeks: '1-8', weekPattern: '每周' }, { weekday: 4, periods: [6, 7, 8], location: '紫金港曹光彪西-503（机房）', weeks: '1-8', weekPattern: '双周' }] },
  { id: 'prob', name: '概率论与数理统计', teacher: '王老师', code: '061B0170', credit: 3, xuezai: 'xz-61022', zhiyun: 'zy-88202', group: { platform: 'dingtalk', name: '概率论与数理统计 答疑群' },
    meetings: [{ weekday: 2, periods: [1, 2], location: '紫金港东2-202', weeks: '1-8', weekPattern: '每周' }, { weekday: 4, periods: [3, 4], location: '紫金港东2-202', weeks: '1-8', weekPattern: '每周' }] },
  { id: 'phys', name: '大学物理（乙）Ⅱ', teacher: '张老师', code: '761T0020', credit: 3, xuezai: 'xz-61023', zhiyun: 'zy-88203', group: { platform: 'dingtalk', name: '大学物理（乙）Ⅱ 课程群' },
    meetings: [{ weekday: 1, periods: [6, 7, 8], location: '紫金港东1B-201', weeks: '1-8', weekPattern: '每周' }, { weekday: 3, periods: [3, 4], location: '紫金港东1B-201', weeks: '1-8', weekPattern: '每周' }] },
  { id: 'lab', name: '大学物理实验', teacher: '刘老师', code: '761T0040', credit: 1, xuezai: 'xz-61024', chaoxing: 'cx-2307', group: null,
    meetings: [{ weekday: 5, periods: [1, 2, 3, 4], location: '紫金港东四物理实验中心', weeks: '2-8', weekPattern: '双周' }] },
  { id: 'co', name: '计算机组成', teacher: '李老师', code: '211C0040', credit: 3.5, xuezai: 'xz-61025', zhiyun: 'zy-88205', group: { platform: 'dingtalk', name: '计算机组成 课程群' },
    meetings: [{ weekday: 2, periods: [3, 4, 5], location: '紫金港东1A-405', weeks: '1-8', weekPattern: '每周' }, { weekday: 4, periods: [9, 10], location: '紫金港东1A-405', weeks: '1-8', weekPattern: '单周' }] },
  { id: 'dm', name: '离散数学及其应用', teacher: '周老师', code: '211B0010', credit: 3, xuezai: 'xz-61026', zhiyun: 'zy-88206', group: null,
    meetings: [{ weekday: 3, periods: [6, 7, 8], location: '紫金港东2-301', weeks: '1-8', weekPattern: '每周' }] },
  { id: 'psy', name: '心理学及应用', teacher: '吴老师', code: '031E0010', credit: 2, xuezai: 'xz-61027', zhiyun: 'zy-88207', group: null,
    meetings: [{ weekday: 2, periods: [11, 12, 13], location: '紫金港西1-203', weeks: '1-8', weekPattern: '每周' }] },
  { id: 'pe', name: '体育Ⅲ（羽毛球）', teacher: '何老师', code: '401E0030', credit: 1, xuezai: null, group: null,
    meetings: [{ weekday: 5, periods: [6, 7], location: '紫金港风雨操场', weeks: '1-8', weekPattern: '每周' }] },
  { id: 'xs', name: '形势与政策Ⅱ', teacher: '孙老师', code: '371E0020', credit: 1, xuezai: 'xz-61029', group: null,
    meetings: [{ weekday: 4, periods: [11, 12], location: '紫金港东1A-101', weeks: '1-8', weekPattern: '单周' }] },
]
export const course = id => COURSES.find(item => item.id === id)

/** 教务网的考试安排。 */
export const EXAMS = [
  { course: 'phys', kind: 'midterm', date: '2026-10-24', start: '10:30', end: '12:30', location: '紫金港东1B-201', seat: '37' },
  { course: 'prob', kind: 'midterm', date: '2026-10-31', start: '14:00', end: '16:00', location: '紫金港东2-202', seat: '52' },
  { course: 'fds', kind: 'final', date: '2027-01-14', start: '08:00', end: '10:00', location: '考场还没出', seat: '' },
  { course: 'co', kind: 'final', date: '2027-01-16', start: '14:00', end: '16:00', location: '考场还没出', seat: '' },
]

/** 作业：学在浙大和 PTA。第三次大物作业原来是今天截止，张老师在钉钉群里延后两天到周五。 */
export const TASKS = [
  { id: 'xuezai:hw-fds-4', source: 'xuezai', course: 'fds', title: 'HW4 书面作业：AVL 树与伸展树', kind: '作业', deadline: at('2026-10-21', '23:59') },
  { id: 'pta:co-ch4', source: 'pta', course: 'co', title: '第 4 章 处理器 练习题', kind: '题目集', deadline: at('2026-10-22', '12:00'), note: '答了 12/20 题' },
  { id: 'xuezai:hw-prob-4', source: 'xuezai', course: 'prob', title: '习题四：随机变量的数字特征', kind: '作业', deadline: at('2026-10-22', '21:00') },
  { id: 'xuezai:hw-phys-3', source: 'xuezai', course: 'phys', title: '第三次作业：电磁感应', kind: '作业', deadline: at('2026-10-23', '23:59'), note: '已延后两天' },
  { id: 'xuezai:lab-pre-hall', source: 'xuezai', course: 'lab', title: '预习报告：霍尔效应测磁场', kind: '作业', deadline: at('2026-10-22', '22:00') },
  { id: 'xuezai:hw-dm-5', source: 'xuezai', course: 'dm', title: 'HW5 关系与偏序', kind: '作业', deadline: at('2026-10-24', '22:00') },
  { id: 'pta:fds-hw5', source: 'pta', course: 'fds', title: 'HW5 树与二叉树', kind: '题目集', deadline: at('2026-10-25', '23:00'), note: '答了 6/10 题' },
  { id: 'xuezai:co-lab3', source: 'xuezai', course: 'co', title: 'Lab 3 单周期 CPU 实验报告', kind: '作业', deadline: at('2026-10-26', '23:59') },
  { id: 'xuezai:psy-2', source: 'xuezai', course: 'psy', title: '第二次读书报告', kind: '作业', deadline: at('2026-10-30', '23:59') },
  { id: 'pta:fds-p2', source: 'pta', course: 'fds', title: 'Project 2 二叉搜索树性能比较', kind: '题目集', deadline: at('2026-11-01', '23:00'), note: '答了 0/3 题' },
  { id: 'xuezai:xs-1', source: 'xuezai', course: 'xs', title: '形势与政策 学习心得（一）', kind: '作业', deadline: at('2026-11-08', '23:59') },
  { id: 'xuezai:hw-prob-3', source: 'xuezai', course: 'prob', title: '习题三：多维随机变量', kind: '作业', deadline: at('2026-10-15', '21:00'), done: true },
]

/** 备忘录：自己记的，有的是从通知加进来的。属性里写了「时间」「截止」的会排进日程表。 */
export const MEMOS = [
  { title: '大物第三次作业延后到周五', tags: ['课程'], properties: [{ key: '截止', value: '2026-10-23 23:59' }, { key: '来源', value: '钉钉「大学物理（乙）Ⅱ 课程群」' }],
    body: '张老师 10 月 20 日晚在课程群里说：第三次作业（电磁感应）截止时间延后两天，改到**本周五 23:59**，学在浙大上的截止时间会同步改。\n\n- 第 5 题的图有误，以群里补发的图为准\n- 交手写拍照的 PDF，一题一页\n\n相关：[[大学物理（乙）Ⅱ]]\n<!-- notice:chat:phys-delay -->', updatedAt: at('2026-10-20', '20:31') },
  { title: '周五下午找辅导员签字', tags: ['事务'], properties: [{ key: '时间', value: '2026-10-23 15:30' }, { key: '地点', value: '紫金港东四 学生事务中心 203' }],
    body: '带上**综合素质测评表**和学生证，找辅导员签字盖章。辅导员周五下午在办公室。', updatedAt: at('2026-10-19', '09:12') },
  { title: '大物实验带预习报告', tags: ['课程'], properties: [{ key: '地点', value: '紫金港东四物理实验中心 213' }],
    body: '霍尔效应实验，第 1–4 节。预习报告手写，实验前交给刘老师；带实验记录本和计算器。', updatedAt: at('2026-10-18', '21:40') },
  { title: '四六级报名', tags: ['考试'], properties: [{ key: '报名截止', value: '2026-10-28 17:00' }, { key: '来源', value: '综合服务网' }],
    body: '2026 年下半年全国大学英语四、六级考试报名。\n\n- 报名时间：10 月 22 日 9:00 至 10 月 28 日 17:00\n- 先在综合服务网确认资格，再到考试报名网站缴费\n- 考试日期 12 月 19 日\n\n[原文](https://example.zju.edu.cn/notice/school-cet-2026)', updatedAt: at('2026-10-19', '18:20') },
  { title: '羽毛球场预约', tags: ['生活'], properties: [{ key: '时间', value: '2026-10-22 18:00' }, { key: '地点', value: '紫金港风雨操场 5 号场' }],
    body: '和室友约了周四晚上 18:00–19:00，已在体艺 App 上预约成功，提前 10 分钟到。', updatedAt: at('2026-10-20', '12:05') },
  { title: '概率论期中复习', tags: ['考试'], properties: [{ key: '时间', value: '2026-10-31 14:00' }, { key: '范围', value: '第 1–4 章' }],
    body: '王老师在答疑群说：期中考第 1–4 章，可以带计算器，闭卷。\n\n- [ ] 第 2 章习题重做一遍\n- [ ] 第 3、4 章公式整理\n- [ ] 做往年卷两套', updatedAt: at('2026-10-20', '22:10') },
  { title: '挑战杯校内赛报名', tags: ['竞赛'], properties: [{ key: '截止', value: '2026-10-27 23:59' }],
    body: '和同组三位同学商量好作品方向后在团委系统报名，需要指导老师签字的申报书。', updatedAt: at('2026-10-17', '16:45') },
  { title: '社团技术部面试', tags: ['生活'], properties: [{ key: '时间', value: '2026-10-24 19:00' }, { key: '地点', value: '紫金港学生活动中心 305' }],
    body: '带一份简历，准备 3 分钟自我介绍和一个做过的小项目。', updatedAt: at('2026-10-16', '10:30') },
  { title: '图书馆还书', tags: ['生活'], properties: [{ key: '截止', value: '2026-10-26' }],
    body: '《深入理解计算机系统》和《概率论与数理统计（第五版）》，到期前续借或者还掉。', updatedAt: at('2026-10-15', '13:00') },
  { title: '心理学读书报告选书', tags: ['课程'], properties: [],
    body: '吴老师给的书单里挑一本：\n\n1. 《思考，快与慢》\n2. 《被讨厌的勇气》\n3. 《自卑与超越》\n\n倾向第 1 本，报告 3000 字，10 月 30 日交。', updatedAt: at('2026-10-14', '20:00') },
]

/** 通知加到备忘录时模型总结出来的那一条（截图「通知加到备忘录」用，挑的是体测通知）。 */
export const AI_MEMO = {
  source: 'school:tice-2026',
  title: '体质健康测试',
  tags: ['事务'],
  properties: [{ key: '时间', value: '2026-10-29 13:30' }, { key: '截止', value: '2026-10-27 17:00' }, { key: '来源', value: '学工部' }],
  body: '**AI 总结**\n\n- 2025 级在 **10 月 29 日（周四）下午 13:30** 到紫金港东田径场测试\n- 项目：50 米、800/1000 米、立定跳远、坐位体前屈、引体向上/仰卧起坐\n- **10 月 27 日 17:00 前**在体测系统里确认测试时段，过时不能改\n- 穿运动鞋，带校园卡；身体不适的提前找辅导员办缓测\n\n[原文](https://example.zju.edu.cn/notice/school-tice-2026)',
}
