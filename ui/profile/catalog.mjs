/**
 * ZJU Core 接进应用的全部内容，只在这里写一遍。原 ZJU Skill 的 profile.env 拆成了下面三样：
 *   CAMPUS_PLUGINS   插件页上的校园功能：每一项管 ZJU Core 的哪些模块、要填哪些账号
 *   ACCOUNTS         各系统的账号怎么填、存在档案目录 accounts.json 的哪个键
 *   IDENTITY_FIELDS  设置里「个人档案」最上面的基础信息，存在 identity.json
 * 引擎侧（plugins.mjs、account.mjs、store.mjs）和页面（插件页、账号表单、设置里的个人档案）都从这里取；
 * ZJU Core 按同样的键名读（core/zju/lib/profile/profile.ts），catalog.test.mjs 核对两边对得上。
 * 页面会把本文件打进包里，这里不能引用 Node 模块。类型写在 catalog.d.mts。
 */

/** 各系统的账号。user 是账号那一栏（没有就只有密码），secret 是密码那一栏；key 是 accounts.json 里的键。 */
export const ACCOUNTS = {
  zju: { title: '统一身份认证', user: { key: 'zju_username', label: '学号' }, secret: { key: 'zju_password', label: '密码' } },
  webvpn: { title: 'WebVPN', user: { key: 'webvpn_username', label: '校园网账号' }, secret: { key: 'webvpn_password', label: '密码' } },
  pta: { title: 'PTA', user: { key: 'pta_username', label: '邮箱' }, secret: { key: 'pta_password', label: '密码' } },
  // 大物实验课的账号留空时用学号。
  lab: { title: '大物实验课', user: { key: 'lab_username', label: '账号', placeholder: '留空用学号', optional: true }, secret: { key: 'lab_password', label: '密码' } },
  chaoxing: { title: '超星学习通', user: { key: 'chaoxing_username', label: '手机号' }, secret: { key: 'chaoxing_password', label: '密码' } },
  // 可以填好几个：第一个用下面的键，再添加的在键名后加 _2、_3……，ZJU Core 认的就是这种写法。
  cc98: { title: 'CC98', multiple: true, user: { key: 'cc98_username', label: '论坛账号' }, secret: { key: 'cc98_password', label: '密码' } },
  tyys: { title: '体育场馆', secret: { key: 'tyys_card_password', label: '校园卡查询密码' } },
  // 要同伴才能订的场地，用同伴本人授权的统一身份认证账号取同伴码。
  buddy: { title: '场馆同伴', user: { key: 'tyys_buddy_username', label: '同伴学号' }, secret: { key: 'tyys_buddy_password', label: '同伴密码' } },
}

/** 校内网站怎么访问，和 WebVPN 账号排在一起。 */
export const TRANSPORT = {
  key: 'transport',
  label: '校内网站访问方式',
  options: [{ value: 'webvpn', label: 'WebVPN' }, { value: 'direct', label: '校园网直连' }],
}

/**
 * 插件页的校园功能。modules 是这一项管的 ZJU Core 模块：关掉一项，这些模块的命令就被 core 拒绝。
 * accounts 是详情页里能填的账号，requires 是缺了就整项用不了的账号。base 的一项没有开关。
 * description 是列表里名字下面那一行，只说接了哪些系统，要短（两列时约放 23 个字）；
 * systems 是详情页里逐条列的：接的是哪个系统，它能做什么。
 */
export const CAMPUS_PLUGINS = [
  {
    id: 'campus.account',
    title: '校园账号',
    description: '统一身份认证和 WebVPN',
    art: 'account',
    base: true,
    modules: ['profile', 'zjuam', 'webvpn'],
    accounts: ['zju', 'webvpn'],
    requires: ['zju', 'webvpn'],
    systems: [
      { name: '统一身份认证', does: '登录教务网、学在浙大等校内系统' },
      { name: 'WebVPN', does: '不在校园网时访问校内网站' },
    ],
  },
  {
    id: 'campus.courses',
    title: '课程与作业',
    description: '教务网、学在浙大、PTA 和大物实验课',
    art: 'courses',
    modules: ['zdbk', 'xuezai', 'pta', 'lab'],
    accounts: ['pta', 'lab'],
    requires: [],
    systems: [
      { name: '教务网', does: '课表、考试安排、成绩与绩点、培养方案、选课' },
      { name: '学在浙大', does: '作业与待办、课件、点名记录' },
      { name: 'PTA', does: '编程作业和题目' },
      { name: '大物实验课', does: '实验安排、选实验' },
    ],
  },
  {
    id: 'campus.notices',
    title: '校园通知',
    description: '学校各部门和你所在学院的通知',
    art: 'notices',
    modules: ['notice'],
    accounts: [],
    requires: [],
    systems: [
      { name: '学校部门', does: '教务网、本科生院、研究生院、学工部、研工部、团委、图书馆、信息技术中心、综合服务网' },
      { name: '学院官网', does: '你所在学院的通知，按个人档案里的学院读' },
      { name: '查找方式', does: '按关键词、部门或学院找，看新发布的，读正文和附件' },
    ],
  },
  {
    id: 'campus.activities',
    title: '活动与场馆',
    description: '素质拓展平台和体育场馆预约',
    art: 'activities',
    modules: ['sztz', 'tyys'],
    accounts: ['tyys', 'buddy'],
    requires: [],
    systems: [
      { name: '素质拓展平台', does: '二三四课堂记点、活动列表、报名和收藏，新活动进通知' },
      { name: '体育场馆预约', does: '空场查询、预约、放号时间' },
    ],
  },
  {
    id: 'campus.materials',
    title: '学习资料',
    description: '智云课堂、学习通、电子书和知网',
    art: 'materials',
    modules: ['zhiyun', 'chaoxing', 'ebook', 'cnki'],
    accounts: ['chaoxing'],
    requires: [],
    systems: [
      { name: '智云课堂', does: '找课、搜字幕、课堂实时转写、下载录播和课件' },
      { name: '超星学习通', does: '课件和视频' },
      { name: '图书馆电子书', does: '查一本书在哪个平台有电子版' },
      { name: '中国知网', does: '检索和下载论文' },
    ],
  },
  {
    id: 'campus.community',
    title: '校园社区',
    description: 'CC98 论坛和查老师',
    art: 'community',
    modules: ['cc98', 'chalaoshi'],
    accounts: ['cc98'],
    requires: ['cc98'],
    systems: [
      { name: 'CC98', does: '搜索和看帖、十大、消息与私信' },
      { name: '查老师', does: '教师评价' },
    ],
  },
]

/**
 * 不是 ZJU Core 的功能，和它分开登记，共用应用的插件开关和详情页。backend 说它背后是哪一样：
 * wechat 是 weread 技能（core/weread）：半小时把跟踪的公众号看一遍、新文章进通知，助手拿到文章链接能读全文；关掉以后助手的技能目录里没有它，应用也不再定时检查（wechat.mjs）；
 * 它这里的 systems 列的是能做什么，文章从哪里找在详情页里另有一块（WechatSettings.tsx）。
 * learn 是 Learning Core（core/learn，助手的 learn 技能），关掉以后助手的技能目录里没有它，
 * 学习页上也不再给「让助手讲这次课」，做好的讲解照常能放。它的可选依赖在详情页里装（learn.mjs）。
 * optIn 的一项默认关着，要用户自己打开（校园功能都默认开着）。讲解是 2026-10-11 定的：做一份很花时间和模型用量，不替人开；
 * 公众号是 2026-10-12 定的。升级上来的人没有另外照顾：原来开着公众号的，升级以后也是关着，要自己再打开一次。
 */
export const LOCAL_PLUGINS = [
  { id: 'campus.learn', title: '课程讲解', description: '把一次课或一份资料讲成带画面的讲解', art: 'learn', backend: 'learn', optIn: true,
    accounts: [], requires: [], systems: [
      { name: '讲解', does: '先把资料学懂，再重新讲一遍，做成带画面和字幕的网页，在「学习」页里播放' },
      { name: '资料', does: '智云一次课的课件、课堂截图和字幕，或者你自己的教材、论文' },
    ] },
  { id: 'campus.wechat', title: '微信公众号', description: '公众号的新文章自动进通知', art: 'wechat', backend: 'wechat', optIn: true,
    accounts: [], requires: [], systems: [
      { name: '新文章', does: '每半小时看一遍你跟踪的公众号，新发的进「校园事务」的通知' },
      { name: '读文章', does: '把公众号文章的链接发给助手，它能读到全文' },
    ] },
]
export const APP_PLUGINS = [...CAMPUS_PLUGINS, ...LOCAL_PLUGINS]

/** 不归哪个插件、始终可用的 ZJU Core 模块：读文档是各项功能都要用的。 */
export const SHARED_MODULES = ['doc']

/**
 * 设置里「个人档案」最上面的基础信息。core 为真的几项 ZJU Core 会读（学院定通知来源，专业和年级定培养方案）；
 * 称呼和校区只给助手看。
 */
export const IDENTITY_FIELDS = [
  { key: 'display_name', label: '称呼' },
  { key: 'college', label: '学院', core: true },
  { key: 'major_name', label: '专业', core: true },
  { key: 'major_code', label: '专业代码', core: true },
  { key: 'grade', label: '入学年份', core: true },
  { key: 'student_level', label: '培养层次', core: true },
  { key: 'campus', label: '校区', options: ['紫金港校区', '玉泉校区', '西溪校区', '华家池校区', '之江校区', '舟山校区', '海宁校区'] },
]

/** accounts.json 里每个账号第一份的键，加上访问方式。 */
export function accountKeys() {
  return [...Object.values(ACCOUNTS).flatMap(account => [account.user?.key, account.secret.key].filter(Boolean)), TRANSPORT.key]
}

/** 一种账号最多填几个。 */
export const MAX_ACCOUNTS = 9

/** 第 index 个账号（1 起）用的两个键。 */
export function numberedKeys(id, index) {
  const { user, secret } = ACCOUNTS[id], suffix = index > 1 ? `_${index}` : ''
  return { user: user ? `${user.key}${suffix}` : undefined, secret: `${secret.key}${suffix}` }
}

/** 键名是不是「能填好几个的账号」后面追加的那几份；是的话给出是哪种账号的第几个。 */
function numbered(key) {
  const match = /^(.+)_([2-9])$/.exec(key)
  if (!match) return undefined
  const id = Object.keys(ACCOUNTS).find(name => ACCOUNTS[name].multiple && (ACCOUNTS[name].user?.key === match[1] || ACCOUNTS[name].secret.key === match[1]))
  return id ? { id, index: Number(match[2]) } : undefined
}

/** 页面能改的键：每个账号第一份的键、访问方式，以及追加的那几份。别的键（第二位场馆同伴）页面不动，原样留着。 */
export function isAccountKey(key) {
  return accountKeys().includes(key) || numbered(key) !== undefined
}

/** 这种账号现在填了第几个、第几个；第一个总在。 */
export function accountIndexes(values, id) {
  const found = new Set([1])
  for (const key of Object.keys(values)) {
    const extra = values[key] ? numbered(key) : undefined
    if (extra?.id === id) found.add(extra.index)
  }
  return [...found].sort((a, b) => a - b)
}

/** 这个账号是否已经填到能用的程度。 */
export function accountReady(values, id) {
  const { user, secret } = ACCOUNTS[id]
  if (id === 'webvpn' && values[TRANSPORT.key] === 'direct') return true
  return (!user || user.optional === true || !!values[user.key]) && !!values[secret.key]
}
