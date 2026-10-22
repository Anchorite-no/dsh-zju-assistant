/**
 * 假模型照着放的对话剧本。每段：id、用户说的话（prompt，也用来认是哪一段）、标题、几步。
 * 一步可以带思考（think）、正文（text）、几次工具调用（tools，同一步里的几次是同时发出的）。
 * 工具真的由引擎去跑：pwsh 跑的是副本里的假 core（core-data.mjs 的结果），campus_* 读写的是隔离实例自己的档案。
 * 历史对话按 ago（几分钟前）的顺序造出来，侧栏里就有「3 天前」「昨天」这样的时间。
 */
import path from 'node:path'
import { STAGE } from './stage.mjs'

const ZJU = `node "${path.join(STAGE, 'core', 'zju', 'scripts', 'zju.ts')}"`
const DING = `node "${path.join(STAGE, 'core', 'dingtalk', 'scripts', 'dingtalk.mjs')}"`
const z = (args, description) => ({ name: 'pwsh', input: { command: `${ZJU} ${args}`, description } })
const ding = (args, description) => ({ name: 'pwsh', input: { command: `${DING} ${args}`, description } })
const tool = (name, input) => ({ name, input })

/** 「大物最近有什么要做的」：十几步，跨学在浙大、教务网、钉钉群、智云、实验平台、学习通、校园通知和本地档案。 */
const PHYS = {
  id: 'phys', ago: 0, title: '大物最近要做的事',
  prompt: '大物最近有什么要做的？作业、考试、实验都帮我理一下',
  steps: [
    { think: '用户问大学物理（乙）Ⅱ 最近要做的事。先看档案里这门课对应哪些平台和群，同时去学在浙大读待办、去教务网查考试。', tools: [
      tool('campus_profile_read', { query: '大学物理' }),
      z('xuezai todos', 'Read Xuezai to-do list'),
      z('zdbk exams', 'Read exam schedule from zdbk'),
    ] },
    { think: '学在浙大上第三次作业的截止时间和档案里记的不一样，档案说课程群里延后过。去钉钉课程群看原话，再读这份作业的要求。', tools: [
      ding('read --chat "大学物理（乙）Ⅱ 课程群" --limit 30', 'Read DingTalk course group'),
      z('xuezai homework view --course "大学物理（乙）Ⅱ" --title "第三次作业"', 'View homework detail'),
    ] },
    { think: '期中就在这周六。查智云上最近几次课，再在字幕里搜老师有没有说考试范围。', tools: [
      z('zhiyun search lessons --course "大学物理（乙）Ⅱ"', 'List Zhiyun lessons'),
      z('zhiyun search subtitles --course "大学物理（乙）Ⅱ" --keyword "期中"', 'Search lecture subtitles'),
    ] },
    { think: '配套的大学物理实验：看实验平台上选了哪次实验，学习通上有没有讲义。', tools: [
      z('lab selected', 'List selected physics labs'),
      z('chaoxing chapter list --course "大学物理实验"', 'List Chaoxing chapters'),
    ] },
    { think: '再看学校有没有和物理相关的新通知、学在浙大上的复习资料。', tools: [
      z('notice list --keyword "物理"', 'Search campus notices'),
      z('xuezai material list --course "大学物理（乙）Ⅱ"', 'List course materials'),
    ] },
    { think: '看备忘录里有没有已经记过的。', tools: [tool('campus_note_read', { query: '大物' })] },
    { think: '备忘录里已经有作业延后那条。再对一下这周的课表，期中前还有几次课。', tools: [z('zdbk timetable', 'Read timetable from zdbk')] },
    { text: `大学物理（乙）Ⅱ 这一周要做的，按时间排：

| 时间 | 事情 | 来源 |
|---|---|---|
| **周四 10月22日 22:00** | 实验预习报告「霍尔效应测磁场」在学在浙大交 | 学在浙大 |
| **周五 10月23日 08:00** | 大物实验「霍尔效应测磁场」，东四-213 | 实验选课平台 |
| **周五 10月23日 23:59** | 第三次作业（电磁感应）截止，**已从今天延后两天** | 钉钉课程群（张老师 10月20日 20:15）、学在浙大 |
| **周六 10月24日 10:30** | 期中考试，东1B-201，座位 37，考到第九章第二节 | 教务网、智云字幕、课程群 |

几处要注意的：

1. **第三次作业第 5 题（9-15）的题图有误**，以张老师在群里补发的图为准；学在浙大上的截止时间已经同步改到周五。
2. 期中考试带**学生证和计算器**（张老师今天上午在群里说的）。学在浙大上有一份「期中复习提纲.pdf」，第 9 章两份讲义也在。
3. 实验讲义在学习通「大学物理实验 → 霍尔效应测磁场」里；预习报告学在浙大上要交电子版，纸质的实验前交给刘老师。

备忘录里已经有「大物第三次作业延后到周五」。要不要我再记一条「大物期中考试」，把时间、考场和要带的东西写进去？` },
  ],
}

/** 选课：比较教概率论的几位老师。 */
const COURSE = {
  id: 'course', ago: 60 * 26, title: '概率论选课比较老师',
  prompt: '下学期要选概率论与数理统计，帮我比较一下教务网上几位老师的班',
  steps: [
    { think: '先看这一轮选课的规则，再搜这门课的教学班。', tools: [z('zdbk selection context', 'Read course selection rules'), z('zdbk selection search --name "概率论与数理统计"', 'Search course in zdbk')] },
    { tools: [z('zdbk selection sections --course "概率论与数理统计"', 'List teaching sections')] },
    { think: '四个班，孙老师的满了。另外三位去查老师看评分和给分，同时在 CC98 搜讨论。', tools: [
      z('chalaoshi teacher --name "王老师"', 'Look up teacher rating'), z('chalaoshi teacher --name "赵老师"', 'Look up teacher rating'), z('chalaoshi teacher --name "钱老师"', 'Look up teacher rating'),
      z('cc98 search --keyword "概率论 选课"', 'Search CC98 topics'),
    ] },
    { tools: [z('cc98 topic view --id 6203311', 'Read CC98 topic'), z('cc98 topic view --id 6187420', 'Read CC98 topic')] },
    { text: `四个教学班里孙老师的已经满了，另外三位：

| 老师 | 时间 | 余量 | 查老师评分 | 平均绩点 |
|---|---|---|---|---|
| 王老师 | 周一 1-2、周三 3-4 | 23 | 8.9（412 人） | 4.12 |
| 赵老师 | 周二 6-7、周四 6-7 | 57 | **9.3**（287 人） | 3.98 |
| 钱老师 | 周一 11-12、周四 1-2 | 8 | 6.8（198 人） | 3.40 |

**建议首选王老师**：给分最好，CC98 上说作业是课本题、讲得清楚；不过周一第 1-2 节是早八，和你「不选早八」的偏好冲突。
**不想早起就选赵老师**：评分最高、余量多，节奏慢一点。钱老师每次点名、期末偏难，不建议。

要不要我把这三个班按「赵 → 王 → 钱」的顺序填进志愿？填之前会再跟你确认一次。` },
  ],
}

/** 交作业前先确认：读要求、看文件，再问用户。 */
const CONFIRM = {
  id: 'confirm', ago: 0, title: '提交计组 Lab 3 报告',
  prompt: '把计算机组成 Lab 3 的实验报告交到学在浙大，文件是 对话 文件夹里的 Lab3-实验报告.pdf',
  steps: [
    { think: '先读这份作业的要求和提交规则，再看文件对不对。', tools: [z('xuezai homework view --course "计算机组成" --title "Lab 3"', 'View homework detail')] },
    { tools: [z('doc text --file "Lab3-实验报告.pdf"', 'Read report text')] },
    { think: '要求是 PDF，含数据通路图、控制信号表和波形，文件 12 页都有。提交是写操作，先请用户确认。', tools: [tool('ask_user_question', { questions: [{
      id: 'submit', header: '确认提交',
      question: '把「Lab3-实验报告.pdf」（12 页，2.1 MB）提交到学在浙大《计算机组成》的「Lab 3 单周期 CPU 实验报告」？截止 10月26日 23:59，提交后截止前还能撤回重交。',
      options: [{ label: '确认提交 (Recommended)', description: '现在提交，交完回查一次提交记录' }, { label: '先不交', description: '我再检查一遍报告' }],
    }] })] },
    { tools: [z('xuezai homework submit --course "计算机组成" --title "Lab 3" --file "Lab3-实验报告.pdf" --confirm', 'Submit homework')] },
    { text: '已提交。学在浙大上的提交记录：**Lab3-实验报告.pdf（2.1 MB），10月21日 15:43，状态「已提交」**。截止前想改可以撤回重交。' },
  ],
}

const simple = (id, ago, title, prompt, tools, text, think) => ({ id, ago, title, prompt, steps: [...(tools.length ? [{ think, tools }] : []), { text }] })

/** 历史对话：几天里陆陆续续问过的。 */
const HISTORY = [
  simple('h-week', 60 * 24 * 5 + 40, '本周课表和截止', '这周都有什么课和要交的东西？', [z('zdbk timetable', 'Read timetable from zdbk'), z('xuezai todos', 'Read Xuezai to-do list'), z('pta homework list', 'List PTA homework')],
    '这周（秋学期第 6 周，双周）课排得比较满：周一上午数据结构、下午大物；周二早八概率论、晚上心理学；周四双周有数据结构上机；周五上午大物实验。\n\n要交的：**周三 23:59 数据结构 HW4**，周四中午计组 PTA，周四晚概率论习题四，周日 PTA HW5。', '查日程表这一周。'),
  simple('h-cet', 60 * 24 * 4 + 300, '四六级报名步骤', '四六级什么时候报名，怎么报？', [z('notice list --keyword "四六级"', 'Search campus notices')],
    '2026 年下半年四六级：**10月22日 9:00 – 10月28日 17:00** 报名，考试 12月19日。先在综合服务网确认资格，再去考试报名网站缴费。已经帮你看过，你是 2025 级，可以报六级。'),
  simple('h-hw5', 60 * 24 * 4 + 20, '数据结构 HW5 思路', 'PTA 上数据结构 HW5 第 7 题有什么思路？别直接给代码', [z('pta homework view --title "HW5"', 'View PTA homework'), z('pta problem view --id 7-7', 'View PTA problem')],
    '第 7 题是判断两棵树是否同构。思路提示：\n\n1. 先想清楚「同构」允许交换哪两个孩子\n2. 递归比较：根相同时，要么左左右右同构，要么左右交叉同构\n3. **注意空树**，群里助教也提醒了边界\n\n你先写一版，卡住了把代码发我看。'),
  simple('h-sztz', 60 * 24 * 3 + 200, '二课记点还差多少', '我的二课三课记点够了吗？', [z('sztz credits', 'Read activity credits'), z('sztz activity list', 'List open activities')],
    '第二课堂 6.5 / 10，第三课堂 2 / 4，第四课堂 1 / 2，**都还没达标**。现在能报名的里面，「求是讲坛第十二讲」0.5 分（报名到 10月25日），长跑接力赛志愿者 1 分（报名到 10月23日 18:00）。'),
  simple('h-badminton', 60 * 24 * 3 + 30, '周四晚羽毛球场', '周四晚上紫金港还有羽毛球场吗', [z('tyys venue list --date 2026-10-22', 'List sports venues')],
    '周四（10月22日）晚上紫金港还有：风雨操场 5 号场 18:00–19:00、2 号场 20:00–21:00，体育馆 7 号场 21:00–22:00。要我帮你约 18:00 那个吗？'),
  COURSE,
  simple('h-psy', 60 * 23, '心理学读书报告选书', '心理学读书报告选哪本书好写？', [tool('campus_note_read', { query: '心理学' })],
    '你备忘录里列了三本。从好写的角度推荐《思考，快与慢》：章节独立，好挑两三个效应结合自己的经历写，3000 字够用。'),
  simple('h-cc98', 60 * 22, 'CC98 二手显示器', 'CC98 上有人出二手显示器吗', [z('cc98 board topics --board "二手市场" --keyword "显示器"', 'Read CC98 board')],
    '二手市场版有一个「出 27 寸显示器 九成新 自提紫金港」，8 条回复。要我把帖子打开看看价格吗？'),
  simple('h-phys15', 60 * 20, '整理大物最近一次课的总结', '把今天大物课的内容整理成课后总结', [z('zhiyun search lessons --course "大学物理（乙）Ⅱ"', 'List Zhiyun lessons'), z('zhiyun download --course "大学物理（乙）Ⅱ" --lesson 10 --kind subtitle', 'Download subtitles')],
    '已经按回放字幕整理好，放在学习页「大学物理（乙）Ⅱ → 第 10 次」的总结里，分了 4 节，每节带时间点：电磁感应现象、动生电动势、感生电动势与涡旋电场、课堂例题。'),
  simple('h-fds-ppt', 60 * 18, '下载数据结构课件', '把数据结构第 5 讲的课件下下来', [z('xuezai material list --course "数据结构基础"', 'List course materials'), z('xuezai material download --course "数据结构基础" --name "第5讲 AVL树与伸展树.pdf"', 'Download course file')],
    '下好了：**第5讲 AVL树与伸展树.pdf**，在「下载\\CampusAgent\\数据结构基础」里。'),
  simple('h-avl', 60 * 17, '讲一下 AVL 树的旋转', '讲一下 AVL 树的四种旋转，做成讲解', [z('zhiyun search subtitles --course "数据结构基础" --keyword "旋转"', 'Search lecture subtitles'), z('xuezai material list --course "数据结构基础"', 'List course materials')],
    '讲解「AVL 树的四种旋转」做好了，在学习页「数据结构基础 → 第 5 次」点播放就能看，约 8 分钟：先用一串有序插入看 BST 怎么退化，再一种一种演示 LL、RR、LR、RL。'),
  simple('h-tice', 60 * 6, '体测时间和项目', '体测是什么时候，要测哪些项目？', [z('notice list --keyword "体质健康测试"', 'Search campus notices')],
    '2025 级 **10月29日（周四）13:30** 在紫金港东田径场：50 米、800/1000 米、立定跳远、坐位体前屈、仰卧起坐/引体向上。**10月27日 17:00 前**要在体测系统里确认时段。'),
  simple('h-prob-plan', 60 * 3, '概率论期中复习计划', '帮我排一下概率论期中的复习计划', [z('zdbk exams', 'Read exam schedule from zdbk'), tool('campus_note_read', { title: '概率论期中复习' })],
    '期中是 **10月31日（周六）14:00**，考第 1–4 章。按你现在的进度排了 9 天：\n\n- 10/22–10/24：第 1、2 章，重做第 2 章习题\n- 10/25–10/27：第 3、4 章公式整理，配习题课讲义\n- 10/28–10/29：往年卷两套，限时做\n- 10/30：错题回看，早点睡\n\n周四晚和周六上午分别有大物作业和大物期中，已经避开了。'),
]

/** 定时任务（shots-schedule.mjs）。prompt 照 core/zju/references/schedule.md「常用的几种」原样写。 */
const DAILY_PROMPT = '用 zju 技能，照「我的一周」技能（core/skills/my-week）里今天的那一份查今天的课、实验、要交的作业、七天内的考试和新通知，排成一页；做完用 campus_notify 提醒，标题「今日安排」，内容写最要紧的一件。'
const tz = 'Asia/Shanghai'

/** 前一晚 21:30：建「今日安排」（插件页「自动化任务」里那一行「交给助手」放进来的原话）。 */
const SCHED_MORNING = {
  id: 'sched-setup', ago: 1090, title: '每天早上的今日安排', runId: 'sched-run',
  prompt: '帮我建一个定时任务「今日安排」：每天早上 7:30 把今天的课、实验、要交的作业、七天内的考试和新通知排成一页，做完在托盘上提醒我。',
  steps: [
    { think: '先看这个对话里有没有建过同样的任务。', tools: [tool('schedule_list', {})] },
    { think: '没有。照 schedule.md「今日安排」建一个每天 7:30 的。', tools: [tool('schedule_create', { title: '今日安排', prompt: DAILY_PROMPT, daily: { time: '07:30:00', time_zone: tz } })] },
    { text: '建好了：**今日安排**，每天 7:30。\n\n到点我会读今天的课和实验、学在浙大和 PTA 上要交的作业、七天内的考试和新通知，排成一页写在这个对话里，再在托盘上提醒你最要紧的一件。\n\n应用开着才会到点执行（关了窗口留在托盘里也算开着）；电脑关着错过的，下次打开时补做最近的一次。要改时间或者删掉，在侧栏「日程表」的「定时任务」页签里。' },
  ],
}

/** 今早 7:30 到点：引擎发来 [SCHEDULE REMINDER]，照 prompt 排今天一页，再在托盘提醒。 */
const SCHED_RUN = {
  id: 'sched-run', title: '今日安排',
  match: said => said.includes('[SCHEDULE REMINDER') && said.includes('今日安排'),
  steps: [
    { think: '到点的「今日安排」。今天 10 月 21 日周三，秋学期第 6 周。读课表、要交的作业、考试、新通知和课程群。', tools: [
      z('zdbk timetable', 'Read timetable from zdbk'), z('xuezai todos', 'Read Xuezai to-do list'), z('pta homework list', 'List PTA homework'),
      z('zdbk exams', 'Read exam schedule from zdbk'), z('notice new', 'Read new campus notices'), ding('read --chat "大学物理（乙）Ⅱ 课程群" --limit 20', 'Read DingTalk course group'),
    ] },
    { think: '最要紧的是今晚 23:59 的 HW4 和周六的大物期中。托盘提醒一句。', tools: [tool('campus_notify', { title: '今日安排', text: '今晚 23:59 交数据结构 HW4；周六 10:30 大物期中' })] },
    { text: `**10 月 21 日 周三 · 秋学期第 6 周**

**今天的课**

| 时间 | 课程 | 地点 |
|---|---|---|
| 10:00–11:35 | 大学物理（乙）Ⅱ | 紫金港东1B-201 |
| 13:25–15:50 | 离散数学及其应用 | 紫金港东2-301 |

**48 小时内要交的**

- **今天 23:59** 数据结构基础 HW4 书面作业（学在浙大）
- 明天 12:00 计算机组成 第 4 章练习题（PTA，答了 12/20 题）
- 明天 21:00 概率论与数理统计 习题四（学在浙大）
- 明天 22:00 大物实验预习报告：霍尔效应测磁场（学在浙大）

**七天内的考试**

- **周六 10:30** 大学物理（乙）Ⅱ 期中，紫金港东1B-201，座位 37

**新消息**

- 张老师昨晚在课程群说：大物第三次作业延后到**周五 23:59**
- 紫金港东区明天（10/22）部分区域停水
- 本科生院：冬学期第二轮选课安排已发布

最要紧的：今晚交 HW4，周六大物期中。已在托盘上提醒你。` },
  ],
}

/** 下午 15:37：再建四个（作业快截止、成绩出了、盯教学班余量、下周一览）。 */
const SCHED_MORE = {
  id: 'sched-more', ago: 3, title: '盯成绩、余量和作业',
  prompt: '再帮我设几个定时任务：每天晚上 9 点看看 48 小时内要交的作业；每 2 小时查一次成绩；每 10 分钟盯一下概率论王老师那个班有没有余量；每周日晚上 8 点给我下周一览。',
  steps: [
    { think: '先看这个对话里已有的任务，不重复建。', tools: [tool('schedule_list', {})] },
    { think: '还没有。照 schedule.md 建四个；盯余量只查不选，查成绩隔两小时，都不短于站点的限制。', tools: [
      tool('schedule_create', { title: '作业快截止', daily: { time: '21:00:00', time_zone: tz }, prompt: '用 zju 技能执行 xuezai todos 和 pta homework list。48 小时内截止、还没交的列出来（课程、作业、截止时间），有就用 campus_notify 提醒，标题「作业快截止」，内容写最近的一项和一共几项，回答末尾问用户要不要现在照「交作业」技能交；没有就只说一句没有，不提醒。' }),
      tool('schedule_create', { title: '成绩出了', every_seconds: 7200, prompt: '用 zju 技能执行 zdbk grades。和这个对话里上一次的结果比，有新出成绩的课就用 campus_notify 提醒，标题「成绩出了」，内容写课程名；回答里列出新出的课和成绩。没有新的只说一句没有。结果里有 evaluationPending 时提醒一次要先完成评教，之后不再重复提醒。' }),
      tool('schedule_create', { title: '盯教学班余量', every_seconds: 600, prompt: '用 zju 技能执行 zdbk selection sections --course 概率论与数理统计 --teacher 王老师。余量大于 0 就用 campus_notify 提醒，标题「有余量了」，内容写课程、教师和余量；没有余量什么都不用说。只查不选，不要提交志愿。' }),
      tool('schedule_create', { title: '下周一览', weekly: { time: '20:00:00', time_zone: tz, weekdays: [7] }, prompt: '用 zju 技能，照「我的一周」技能（core/skills/my-week）里一周的那一份：先用 campus_schedule_read 读下周一到周日，再执行 xuezai todos、zdbk exams，列出下周每天的课、下周截止的作业、下周的考试；做完用 campus_notify 提醒，标题「下周一览」，内容写下周最要紧的一件。' }),
    ] },
    { text: `建好了四个：

| 任务 | 时间 | 做什么 |
|---|---|---|
| 作业快截止 | 每天 21:00 | 48 小时内截止、还没交的作业，有就提醒 |
| 成绩出了 | 每 2 小时 | 有新出成绩的课就提醒 |
| 盯教学班余量 | 每 10 分钟 | 概率论与数理统计 王老师的班有余量就提醒，只查不选 |
| 下周一览 | 每周日 20:00 | 下周每天的课、要交的作业和考试 |

早上那个「今日安排」在另一个对话里。五个任务都在侧栏「日程表」→「定时任务」里，可以看、改、删。盯余量和查成绩只在选课、出分这段时间有用，选课结束、成绩出齐以后记得删掉，到时候我也会提醒你。` },
  ],
}

export const SCENARIOS = [SCHED_RUN, PHYS, CONFIRM, SCHED_MORNING, SCHED_MORE, ...HISTORY]
export { PHYS, CONFIRM, HISTORY, SCHED_MORNING, SCHED_MORE }

/** 起标题和应用自己问模型。 */
export const helpers = {
  title(user) {
    const said = (() => { try { return JSON.parse(user.slice(user.indexOf('['))).map(item => item.text).join(' ') } catch { return user } })()
    return SCENARIOS.find(item => item.prompt && said.includes(item.prompt.slice(0, 10)))?.title ?? '新会话'
  },
  ask() { return '好的' },
}
