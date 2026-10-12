import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ProfileStore } from './store.mjs'
import { CORE_ROOT, coreSkillNames, installCoreSkills } from './skills.mjs'
import { LearnedSkills } from './learned.mjs'
import { Feed } from './feed.mjs'
import { AccountSettings } from './account.mjs'
import { PluginSwitches } from './plugins.mjs'
import { IdentityFill } from './identity-fill.mjs'
import { collegeOptions } from './colleges.mjs'
import { ChatFolders } from './chats.mjs'
import { Affairs } from './affairs.mjs'
import { Downloads } from './downloads.mjs'
import { Learning } from './learning.mjs'
import { Chaoxing } from './chaoxing.mjs'
import { Xuezai } from './xuezai.mjs'
import { engineStamp } from './stamp.mjs'
import { Wechat } from './wechat.mjs'
import { NoticeFilter } from './notice-filter.mjs'
import { NoticeMemo } from './notice-memo.mjs'
import { askModel } from './model.mjs'
import { ChatGpt } from './chatgpt.mjs'
import { installAgent } from './agent.mjs'
import { LearnKit } from './learn.mjs'
import { installPermissions } from './permissions.mjs'
import { officeText } from './office.mjs'
import { startModelBridge } from './vision.mjs'
import { FlowNotes, isFlowGroup } from './flow-notes.mjs'
import { Review } from './review.mjs'
import { Alerts, articlesAlert } from './alerts.mjs'

/** wechatRun、alertSend 只在测试里给：换掉跑 weread 技能命令的那一步，和把提醒交给壳的那一步。 */
export function installProfile(ctx, { wechatRun, alertSend } = {}) {
  // 这个进程启动时引擎侧代码的指纹；页面拿它和自己构建时记的那份比，对不上就提示重新打开应用。
  const stamp = engineStamp()
  // 助手的底层说明（core/AGENT.md），顶掉引擎给编程助手写的那几段。记忆、备忘录、技能各在什么时候写也在那一篇里。
  installAgent(ctx)
  const store = new ProfileStore()
  // 应用自带的工作流（core/zju/flows/，每个也是一个自带的技能），和它们的补充：照工作流办事时学到、正文里没有的那一条，存在档案目录，接在正文后面。
  const flowNotes = new FlowNotes({ file: store.file('flow-notes.json'), flowsDir: path.join(CORE_ROOT, 'zju', 'flows') })
  // 助手学到的技能存在档案目录里，和应用自带的技能一起交给引擎；不能和自带的重名。
  const learned = new LearnedSkills(store.root, [...coreSkillNames(), ...flowNotes.flows().map(flow => flow.name)])
  const account = new AccountSettings(store)
  const plugins = new PluginSwitches(store)
  // 「课程讲解」「微信公众号」关着时它们的技能不交给引擎；开关一变就让引擎重读技能目录。
  const reloadSkills = installCoreSkills(ctx, learned, plugins, flowNotes)
  // 对话后复盘：聊完过一阵回看一遍，把该留的整理进记忆和工作流的补充（review.mjs）。对话里的助手不再顺手记记忆。
  const review = new Review({
    store, flowNotes, ask: input => askModel(ctx, { ...input, reasoningEffort: 'low', maxTokens: 4000, timeoutMs: 120_000 }),
    // 认一个标题是不是课：照学习页缓存里这位学生上过的课。
    courses: () => learning.courseTitles(),
    settingsFile: store.file('review.json'), logFile: store.file('review-log.json'), stateFile: path.join(path.dirname(store.root), 'cache', 'review.json'),
  })
  ctx.effect(() => review.watch(ctx), 'campus: review after conversation')
  // 「课程讲解」的可选依赖（排公式的 TeX、检查版面的浏览器），装在应用的数据目录里。
  const learnKit = new LearnKit({ dataDir: path.dirname(store.root), plugins })
  // 「微信公众号」：跟踪的号和它们最近的文章（wechat.mjs），背后是 weread 技能。它的两个选择存在档案目录，壳也要读；文章缓存放在档案目录旁边。
  // 给壳的提醒（alerts.mjs）：托盘图标闪起来，鼠标放上去看得到是什么。现在有两个来处：公众号有新文章，和助手用 campus_notify 提醒的事。
  const alerts = new Alerts(alertSend ? { send: alertSend } : {})
  const wechat = new Wechat({
    plugins, settingsFile: store.file('wechat.json'), cacheFile: path.join(path.dirname(store.root), 'cache', 'wechat.json'), ...(wechatRun ? { run: wechatRun } : {}),
    onNew: (articles) => { const alert = articlesAlert(articles); if (alert) alerts.push(alert) },
  })
  ctx.effect(() => wechat.start(), 'campus: public-account checking lifecycle')
  // 校园命令要模型看图时（场馆预约认验证码）从这条管道来问，用的是用户现在选的那个模型（vision.mjs）。
  ctx.effect(() => startModelBridge(ctx), 'campus: model bridge for campus commands')
  // 两个带技能的插件，开关一变就让引擎重读技能目录；公众号的还要停下或者重新开始检查。
  const setPlugin = (input) => {
    const value = plugins.set(input)
    if (input.id === 'campus.wechat') { wechat.changed(); reloadSkills() }
    if (input.id === 'campus.learn') reloadSkills()
    return value
  }
  const fill = new IdentityFill(store, account)
  const chats = new ChatFolders()
  // 对话里「工作区内修改」能写哪些地方、应用自带的校园命令怎么过沙箱（permissions.mjs）。
  installPermissions(ctx, { chats })
  // 校园事务页的缓存放在档案目录旁边：它是从各系统读来的，随时可以重读，不算档案。
  const affairs = new Affairs({ file: path.join(path.dirname(store.root), 'cache', 'affairs.json'), account, plugins, downloads: new Downloads() })
  // 通知太多时把和这位学生关系不大的收起来：屏蔽词，加上模型照个人档案基础信息的判断（notice-filter.mjs）。
  const noticeFilter = new NoticeFilter({
    settingsFile: store.file('notices.json'), cacheFile: path.join(path.dirname(store.root), 'cache', 'relevance.json'),
    identity: () => store.identity().values, ask: input => askModel(ctx, { ...input, reasoningEffort: 'low' }),
  })
  // 校园事务页右边的通知：学校通知攒在缓存里，公众号文章取公众号插件已经存下的。
  const feed = new Feed({ filter: noticeFilter, file: path.join(path.dirname(store.root), 'cache', 'feed.json'), account, plugins, articles: input => wechat.articles(input), refreshArticles: () => wechat.refresh() })
  // 通知那一栏每行的「加到备忘录」：直接加，或者先读正文、让模型总结了再加（notice-memo.mjs）。
  const noticeMemo = new NoticeMemo({
    store, feed, article: url => wechat.article(url),
    ask: input => askModel(ctx, { ...input, reasoningEffort: 'low', maxTokens: 4000, timeoutMs: 60_000 }),
  })
  // 学习页：智云的课程和课次（缓存），加上「文档」里课程文件夹和讲解目录现有的东西。
  const learning = new Learning({ file: path.join(path.dirname(store.root), 'cache', 'learning.json'), account, plugins, chats, downloads: new Downloads() })
  // 学习页切到「超星」时的内容：学习通里一门课各节的课件、视频（缓存）和本人的实验课表，下载的文件也放进「文档」的课程文件夹。
  const chaoxing = new Chaoxing({ file: path.join(path.dirname(store.root), 'cache', 'chaoxing.json'), account, plugins, chats, downloads: new Downloads() })
  // 学习页右栏切到「学在浙大」时的内容：点中的那门课（智云的）在学在浙大上的课件（缓存），下载的文件放进「文档」里这门课的文件夹。
  const xuezai = new Xuezai({ file: path.join(path.dirname(store.root), 'cache', 'xuezai.json'), account, plugins, chats, downloads: new Downloads(), course: id => learning.known(id) })
  // learn 技能的讲解固定放在一个文件夹里（SKILL.md 里写的 <讲解目录>），位置在对话开头告诉助手。
  let filmRoot = ''
  learning.roots().then((roots) => { filmRoot = roots.films }, () => {})
  // 设置 → 模型里的 ChatGPT 登录。引擎的这三个服务不在本包的依赖里声明，用的时候再取，没挂载就当没有这项功能。
  const chatgpt = new ChatGpt({ authorization: () => ctx.get?.('authorization'), credentials: () => ctx.get?.('credentials'), settings: () => ctx.get?.('settings') })
  const saveAccount = (input) => {
    const saved = account.save(input)
    // 学号或密码变了就顺手把基础信息里空着的几项补上；补不上不影响保存账号，设置的个人档案里可以手动再读。
    if (input?.values && ('zju_username' in input.values || 'zju_password' in input.values)) fill.refresh().catch(() => {})
    return saved
  }
  ctx.connection.fetch.register({
    path: '/api/campus/profile', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      try {
        const { action, input } = await request.json()
        const value = action === 'stamp' ? stamp
          : action === 'account-read' ? account.snapshot()
          : action === 'account-save' ? saveAccount(input)
          : action === 'identity-refresh' ? await fill.refresh({ overwrite: true })
          : action === 'colleges' ? collegeOptions()
          : action === 'chat-root' ? { root: await chats.root() }
          : action === 'chat-folder' ? await chats.create()
          : action === 'affairs-read' ? affairs.snapshot()
          : action === 'affairs-refresh' ? await affairs.refresh(input)
          : action === 'affairs-detail' ? affairs.detail(input)
          : action === 'affairs-detail-refresh' ? await affairs.refreshDetail(input)
          : action === 'affairs-file-download' ? await affairs.download(input)
          : action === 'affairs-file-reveal' ? affairs.reveal(input)
          : action === 'feed-read' ? await feed.snapshot()
          : action === 'feed-refresh' ? await feed.refresh(input)
          : action === 'feed-memo' ? await noticeMemo.add(input)
          : action === 'notice-filter-read' ? noticeFilter.settings()
          : action === 'notice-filter-save' ? noticeFilter.save(input)
          : action === 'learning-read' ? await learning.snapshot()
          : action === 'learning-refresh' ? await learning.refresh(input)
          : action === 'learning-course' ? await learning.course(input)
          : action === 'learning-course-refresh' ? await learning.refreshCourse(input)
          : action === 'learning-lesson' ? await learning.lesson(input)
          : action === 'learning-lesson-refresh' ? await learning.refreshLesson(input)
          : action === 'learning-download' ? await learning.download(input)
          : action === 'learning-reveal' ? await learning.reveal(input)
          : action === 'learning-downloading' ? learning.downloading(input)
          : action === 'chaoxing-read' ? await chaoxing.snapshot()
          : action === 'chaoxing-refresh' ? await chaoxing.refresh(input)
          : action === 'chaoxing-files' ? await chaoxing.files(input)
          : action === 'chaoxing-files-refresh' ? await chaoxing.refreshFiles(input)
          : action === 'chaoxing-download' ? await chaoxing.download(input)
          : action === 'chaoxing-downloading' ? chaoxing.downloading(input)
          : action === 'chaoxing-reveal' ? await chaoxing.reveal(input)
          : action === 'xuezai-files' ? await xuezai.files(input)
          : action === 'xuezai-files-refresh' ? await xuezai.refreshFiles(input)
          : action === 'xuezai-download' ? await xuezai.download(input)
          : action === 'xuezai-downloading' ? xuezai.downloading(input)
          : action === 'xuezai-reveal' ? await xuezai.reveal(input)
          // 插件页「技能」一组：应用自带的工作流（各算一项，带着使用中补进来的几条），和助手存下的技能。
          : action === 'skills-list' ? [...flowNotes.groups().map(({ body: _body, ...group }) => group), ...learned.list().map(({ body: _body, path: _path, ...skill }) => skill)]
          : action === 'skill-read' ? (isFlowGroup(input?.name) ? flowNotes.group(input) : learned.read(input))
          : action === 'skill-delete' ? (isFlowGroup(input?.name) ? flowNotes.removeGroup(input) : learned.remove(input))
          : action === 'flow-notes-list' ? flowNotes.list()
          : action === 'flow-note-delete' ? flowNotes.remove(input)
          : action === 'review-read' ? review.snapshot()
          : action === 'review-set' ? review.set(input)
          : action === 'review-undo' ? review.undo(input)
          : action === 'learn-read' ? learnKit.snapshot()
          : action === 'learn-install' ? learnKit.install(input)
          : action === 'learn-remove' ? learnKit.remove(input)
          : action === 'plugins-read' ? plugins.snapshot()
          : action === 'plugins-set' ? setPlugin(input)
          : action === 'wechat-read' ? wechat.snapshot()
          : action === 'wechat-visit' ? wechat.visit()
          : action === 'wechat-retry' ? wechat.retry()
          : action === 'wechat-find' ? await wechat.find(input)
          : action === 'wechat-track' ? await wechat.track(input)
          : action === 'wechat-untrack' ? await wechat.untrack(input)
          : action === 'wechat-login' ? wechat.login()
          : action === 'wechat-logout' ? await wechat.logout()
          : action === 'wechat-set' ? wechat.set(input)
          : action === 'chatgpt-read' ? await chatgpt.snapshot()
          : action === 'chatgpt-login' ? await chatgpt.login(input)
          : action === 'chatgpt-answer' ? await chatgpt.answer(input)
          : action === 'chatgpt-cancel' ? await chatgpt.cancel()
          : action === 'chatgpt-logout' ? await chatgpt.logout()
          : store.dispatch(action, input)
        return Response.json({ value }, { headers: { 'cache-control': 'no-store' } })
      } catch (error) { return Response.json({ error: error.message }, { status: 400, headers: { 'cache-control': 'no-store' } }) }
    },
  })
  const output = { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] }
  ctx.tools.register(defineTool({
    name: 'campus_profile_read',
    description: '读取个人档案：基础信息，和一条条记忆（你对用户这个人的了解，标题就是主题）。不带参数返回基础信息和记忆目录；query 按标题、标签、属性和正文搜索；title 读一条的全文。修过一门课不代表已经掌握。',
    parameters: { query: { type: 'string', description: '搜索的词，如课程名、标签' }, title: { type: 'string', description: '记忆的标题，读这一条的全文' } },
    output, execute: async args => store.query(args),
    presentCall: () => ({ card: 'generic', title: '读取个人档案', kind: 'other' }),
  }))
  ctx.tools.register(defineTool({
    name: 'campus_profile_write',
    description: '新建或更新一条记忆（关于用户这个人的、相对稳定的了解：学过什么、偏好、长期目标）。只在两种时候用：用户明确让你记住关于他本人的事；技能里写明要记的那一步。别的不用你记，对话结束后应用会自己回看并整理。一次性的查询结果、账号和密码不记；用户让你记的一件事（比赛、待办、要带的东西）也不记在这里，用 campus_note_write。写之前先用 campus_profile_read 搜一下：同一个主题只留一条，已有就改那一条。记忆是给用户本人看和改的，照人自己记笔记的样子写：标题是主题本身，简短，不带日期和学期；tags 只写这条是哪一类（如 课程、偏好、目标），一条一个就够，先用目录里已有的，没有合适的再起新的；学期、状态、来源这类信息放 properties，正文里不再重复；正文先用一两句话说清楚，再分小标题列要点，只写事实，不写给模型看的指令和处理办法；提到另一条记忆写成 [[那条的标题]]。更新已有的要带读到的 revision；用户改过的只能用 append 在后面补充。',
    parameters: {
      title: { type: 'string', required: true, description: '记忆的标题，也是文件名。已有这个标题就是更新那一条' },
      revision: { type: 'string', description: '更新已有的记忆时必填，用 campus_profile_read 读到的 revision' },
      body: { type: 'string', description: 'Markdown 正文，不含标题和属性；新建时必填' },
      append: { type: 'boolean', description: '把 body 接在原来的正文后面，原文不动' },
      tags: { type: 'array', items: { type: 'string' }, description: '这条是哪一类，如 ["课程"]。给了就整组替换' },
      properties: { type: 'object', additionalProperties: true, description: '标题下面的属性，如 {"状态": "已修", "学期": "2025–2026 春夏", "来源": "学在浙大课程简介、PTA 作业"}。只改给到的几项，值给空字符串是去掉这一项' },
      archived: { type: 'boolean', description: '不再用的记忆归档；归档不删文件' },
    },
    output, execute: async args => store.memory.saveByAssistant(args),
    presentCall: args => ({ card: 'generic', title: args.archived ? '归档记忆' : '更新记忆', kind: 'other' }),
  }))
  ctx.tools.register(defineTool({
    name: 'campus_note_read',
    description: '读取用户的备忘录：用户自己记的一件件事（比赛、要办的手续、要带的东西）。不带参数返回目录；query 按标题和正文搜索；title 读一条的全文。用户问到他记过的事时用。',
    parameters: { query: { type: 'string', description: '搜索的词' }, title: { type: 'string', description: '备忘的标题，读这一条的全文' } },
    output, execute: async args => store.memos.query(args),
    presentCall: () => ({ card: 'generic', title: '读取备忘录', kind: 'other' }),
  }))
  ctx.tools.register(defineTool({
    name: 'campus_note_write',
    description: '用户让你记一件事时（「帮我记一下」「加到备忘录」），在备忘录里新建或更新一条。不要自己主动往备忘录里写；你对用户这个人的了解记到记忆里，用 campus_profile_write。标题是这件事本身，简短；日期、截止时间这类信息放 properties；正文照用户说的记，不加他没说的内容。更新已有的要带 campus_note_read 读到的 revision；用户写的或改过的只能用 append 在后面补充。',
    parameters: {
      title: { type: 'string', required: true, description: '备忘的标题，也是文件名。已有这个标题就是更新那一条' },
      revision: { type: 'string', description: '更新已有的备忘时必填，用 campus_note_read 读到的 revision' },
      body: { type: 'string', description: 'Markdown 正文，不含标题和属性；新建时必填' },
      append: { type: 'boolean', description: '把 body 接在原来的正文后面，原文不动' },
      properties: { type: 'object', additionalProperties: true, description: '标题下面的属性，如 {"截止": "2026-10-21"}。只改给到的几项，值给空字符串是去掉这一项' },
      archived: { type: 'boolean', description: '办完的、不再用的备忘归档；归档不删文件' },
    },
    output, execute: async args => store.memos.saveByAssistant(args),
    presentCall: args => ({ card: 'generic', title: args.archived ? '归档备忘' : '写入备忘录', kind: 'other' }),
  }))
  ctx.tools.register(defineTool({
    name: 'campus_skill_save',
    description: '把一件校园事务的做法存成技能，以后遇到同类问题直接加载。只在这种时候存：现有技能和参考文档里没有现成答案，你经过多步探索才从官方来源确认了做法，而且这类问题以后还会再出现。存的是最短可行的走法，不是这次的经过：适用哪些问题、按顺序的步骤（用哪条命令或打开哪个网址）、关键结论和来源链接，四十行以内，不写用户的个人信息。同名的技能会被整篇换掉：按已有的技能走不通时，改好再存一次。',
    parameters: {
      name: { type: 'string', required: true, description: '英文短名，只用小写字母、数字和短横线，如 course-withdrawal' },
      title: { type: 'string', required: true, description: '给用户看的名字，如 退课怎么办' },
      description: { type: 'string', required: true, description: '一两句话说明遇到什么问题该用它，写出用户会说的关键词' },
      body: { type: 'string', required: true, description: 'Markdown 正文：适用的问题、步骤、结论和来源' },
    },
    output, execute: async args => { const { body: _body, path: _path, ...saved } = learned.save(args); return saved },
    presentCall: () => ({ card: 'generic', title: '保存技能', kind: 'other' }),
  }))
  ctx.tools.register(defineTool({
    name: 'campus_notify',
    description: '在系统托盘上提醒用户一句话：图标会闪，鼠标放上去看得到这句话，点了回到这个对话。只在用户多半没在看这个对话时用：定时任务到点查到了要告诉他的东西（新的私信、有了余量、成绩出了）、到点的提醒、等了很久的事做完了。没查到新东西不提醒；用户正在和你一来一回地对话时也不用，直接回答。提醒只是叫他来看，完整的内容照常写在回答里。',
    parameters: {
      title: { type: 'string', required: true, description: '谁的消息，几个字，如 CC98 新消息、成绩出了、该出门了' },
      text: { type: 'string', description: '一句话说清是什么，如「老王回复了你：周六打球吗」；八十个字以内，不放密码、成绩单全文这类不该露在屏幕角上的内容' },
    },
    // 点了回到叫它的那个对话。
    output, execute: async (args, exec) => alerts.push({ title: args.title, text: args.text, sessionId: exec?.agent?.session?.id }),
    presentCall: () => ({ card: 'generic', title: '提醒用户', kind: 'other' }),
  }))
  ctx.systemPrompt.context({ name: 'campus-profile', order: 25, text: () => {
    try {
      const result = store.query()
      const profile = `个人档案的基础信息和记忆目录（要看全文时调用 campus_profile_read）：\n${JSON.stringify({ identity: result.identity.values, memory: result.memory.slice(0, 50).map(({ title, tags, properties }) => ({ title, tags, ...properties })), totalMemory: result.memory.length })}`
      const switches = plugins.promptText()
      return switches ? `${profile}\n${switches}` : profile
    } catch { return '个人档案暂时读取失败，请通过 campus_profile_read 检查，不要猜测个人信息。' }
  } })
  // 看文件长什么样：引擎自带的 Office 引擎怎么用（office.mjs）。要文字的那一半在 zju 技能的 doc text 里。
  ctx.systemPrompt.context({ name: 'campus-files', order: 27, text: () => officeText() })
  ctx.systemPrompt.context({ name: 'campus-learning', order: 26,
    // 「课程讲解」关着时不提讲解目录：没有 learn 技能，说了反而会让它自己去拼一个讲解出来。
    text: () => !learnKit.enabled() ? '' : filmRoot ? `讲解目录（learn 技能里写的 <讲解目录>，讲解的工作目录和成品都放在这里）：${filmRoot}` : '讲解目录的位置还没有读到；做讲解前先问用户放在哪。' })
}
