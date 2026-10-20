import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { installProfile } from './host.mjs'
import { CORE_ROOT } from './skills.mjs'
import { FlowNotes } from './flow-notes.mjs'
import { engineStamp } from './stamp.mjs'

test('model tools, UI route and context share one profile; skills come from the bundled cores', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-profile-host-'))
  const previous = process.env.CAMPUS_PROFILE_DIR
  process.env.CAMPUS_PROFILE_DIR = path.join(root, 'profile')
  t.after(() => {
    if (previous === undefined) delete process.env.CAMPUS_PROFILE_DIR
    else process.env.CAMPUS_PROFILE_DIR = previous
    fs.rmSync(root, { recursive: true, force: true })
  })
  const tools = new Map(), contexts = [], policies = [], effects = [], listeners = {}
  let route, provider, reloads = 0
  const ctx = {
    effect: create => { effects.push(create) },
    logger: { warn: message => assert.fail(message) },
    connection: { fetch: { register: value => { route = value } } },
    tools: { register: tool => tools.set(tool.name, tool) },
    on: (name, listener) => { listeners[name] = listener },
    skills: { registerProvider: create => { provider = create({ invalidate() { reloads++ }, signal: new AbortController().signal }) } },
    systemPrompt: { context: value => contexts.push(value), section: value => policies.push(value) },
  }
  // 应用自带的技能（core/skills/）：一个文件夹一个，名字是文件夹名。
  const FLOWS = ['course-selection', 'course-study', 'exam-prep', 'homework-submit', 'my-week', 'skill-writer']
  // 交给壳的提醒记在这里（真的是经进程之间的通道发给壳，托盘图标闪）。
  const alerts = []
  // 假的 weread 技能：跟踪着一个号，本机微信里有它的一篇文章，微信读书没登录。
  const tracked = { biz: 'MzA3MDk5NDA0NA==', name: '浙大体育与艺术' }
  installProfile(ctx, { chatRun: async (_platform, args) => args[0] === 'status' ? { ok: true, running: false } : { ok: true, chats: [], hasMore: false }, alertSend: (message) => { alerts.push(message); return true }, wechatRun: async args => args[0] === 'track' ? { ok: true, tracked: [tracked] }
    : args[0] === 'login' ? { ok: true, loggedIn: true }
    : { ok: true, state: { ok: true }, accounts: [{ ...tracked, source: 'web', articles: [{ id: 'a1', title: '测试推文', url: 'https://mp.weixin.qq.com/s/x', publishedAt: '2026-10-09T09:00:00+08:00' }] }] } })
  // 八项生命周期：邮箱连接、对话复盘、按需配音进程、公众号检查、微信和钉钉聊天检查、模型管道，和邮箱、CC98 的后台检查。
  assert.equal(effects.length, 8)
  const call = async (action, input = {}) => {
    const response = await route.fetch(new Request('http://localhost/api/campus/profile', { method: 'POST', body: JSON.stringify({ action, input }) }))
    return { status: response.status, ...(await response.json()) }
  }
  // 页面靠这个指纹判断后台是不是比界面旧。
  assert.equal((await call('stamp')).value, engineStamp())
  assert.match(engineStamp(), /^[0-9a-f]{12}$/)
  // 公众号默认关着：技能不交给引擎，页面的操作被拒绝；打开以后才有。
  assert.deepEqual((await provider.list()).map(skill => skill.name), ['zju', 'campus-mail', 'initialize', ...FLOWS])
  assert.ok(tools.has('campus_context_initialize'))
  assert.ok(tools.has('campus_context_read'))
  assert.equal((await provider.list()).find(skill => skill.name === 'initialize').invocation.userInvocable, true)
  assert.equal((await provider.list()).find(skill => skill.name === 'campus-mail').invocation.userInvocable, false)
  assert.equal((await provider.list()).find(skill => skill.name === 'zju').invocation.modelInvocable, true)
  assert.equal((await provider.list()).find(skill => skill.name === 'zju').invocation.userInvocable, false)
  assert.match(contexts.find(context => context.name === 'campus-context').text(), /尚未初始化/)
  assert.equal(fs.existsSync(path.join(root, 'profile', '.context-initialized.json')), false)
  assert.equal((await call('mail-status')).value.connected, false)
  assert.equal((await call('mail-status')).value.enabled, true)
  assert.ok(tools.has('campus_mail_search'))
  assert.ok(tools.has('campus_mail_draft'))
  assert.ok(tools.has('campus_mail_send'))
  assert.ok(tools.has('campus_mail_drafts'))
  assert.ok(tools.has('campus_mail_remove_draft'))
  assert.equal((await call('mail-send', { confirm: true })).status, 400)
  await call('plugins-set', { id: 'campus.mail', enabled: false })
  await assert.rejects(tools.get('campus_mail_send').execute({ id: 'unused', revision: 'unused', confirm: true }, {}), /打开「浙大邮箱」/)
  await assert.rejects(tools.get('campus_mail_search').execute({}, {}), /打开「浙大邮箱」/)
  assert.equal((await call('mail-list')).status, 400)
  assert.equal((await call('mail-draft', { to: ['person@example.com'], subject: 'Test', text: 'Test' })).status, 400)
  assert.equal((await provider.list()).some(skill => skill.name === 'campus-mail'), false)
  await call('plugins-set', { id: 'campus.mail', enabled: true })
  assert.equal((await call('wechat-find', { source: 'web' })).status, 400)
  await call('plugins-set', { id: 'campus.wechat', enabled: true })
  // 页面点一次检查（在后台做，页面靠 busy 知道做完没有），跟踪的号和它的文章进了缓存。
  assert.equal((await call('wechat-retry')).value.busy, true)
  let wechat
  do { wechat = (await call('wechat-read')).value } while (wechat.busy)
  assert.deepEqual(wechat.accounts.map(item => [item.name, item.source, item.latest.title]), [['浙大体育与艺术', 'web', '测试推文']])
  // 助手读公众号走 weread 技能，没有另外的工具；插件关着时页面的操作被拒绝，技能也不交给引擎。
  assert.equal(tools.has('campus_wechat_read'), false)
  await call('plugins-set', { id: 'campus.wechat', enabled: false })
  assert.equal((await call('wechat-find', { source: 'web' })).status, 400)
  assert.equal(process.env.WEREAD_DISABLED, '1')
  assert.deepEqual((await provider.list()).map(skill => skill.name), ['zju', 'campus-mail', 'initialize', ...FLOWS])
  assert.match(contexts[0].text(), /微信公众号（weread 技能，读公众号文章）/)
  await call('plugins-set', { id: 'campus.wechat', enabled: true })
  assert.equal(process.env.WEREAD_DISABLED, undefined)
  assert.equal((await call('chat-watch-find', { platform: 'wechat' })).status, 400)
  await call('plugins-set', { id: 'campus.wechat-chat', enabled: true })
  assert.ok((await provider.list()).some(skill => skill.name === 'wechat'))
  assert.deepEqual((await call('chat-watch-find', { platform: 'wechat' })).value.chats, [])
  await call('plugins-set', { id: 'campus.wechat-chat', enabled: false })
  assert.equal(process.env.WECHAT_CHAT_DISABLED, '1')
  assert.equal((await call('chat-watch-find', { platform: 'wechat' })).status, 400)
  assert.equal((await call('chat-watch-snapshot', { platform: 'unknown' })).status, 400)
  const readTool = tools.get('campus_profile_read'), writeTool = tools.get('campus_profile_write')
  assert.equal((await readTool.execute({}, {})).memory.length, 0)
  const note = await writeTool.execute({ title: 'AVL 树的反馈', body: '还没理解双旋转', tags: ['反馈'], properties: { 来源: '用户本轮说明' } }, {})
  assert.ok((await call('snapshot')).value.memory.some(item => item.title === note.title && item.tags.includes('反馈')))
  // 页面上改过以后，助手读到的是改过的，拿旧版本写不进去，也不能整篇覆盖。
  const edited = (await call('save', { title: note.title, from: note.title, revision: note.revision, tags: note.tags, properties: [], body: '我已理解单旋转，但双旋转还不熟。' })).value
  const reread = await readTool.execute({ title: note.title }, {})
  assert.match(reread.body, /单旋转/)
  await assert.rejects(() => writeTool.execute({ title: note.title, revision: note.revision, body: '过期的结论' }, {}), /其他位置更新/)
  await assert.rejects(() => writeTool.execute({ title: note.title, revision: edited.revision, body: '整篇换掉' }, {}), /有人改过/)

  // 备忘录是另一处：助手按用户说的记一条，页面上看得到；它不进个人档案，也不进模型的上下文。
  const memo = await tools.get('campus_note_write').execute({ title: '周五找辅导员签字', body: '带上申请表', properties: { 截止: '2026-10-16' } }, {})
  assert.deepEqual((await call('memo-list')).value.notes.map(item => item.title), [memo.title])
  assert.equal((await tools.get('campus_note_read').execute({ title: memo.title }, {})).properties.截止, '2026-10-16')
  assert.ok(!(await call('snapshot')).value.memory.some(item => item.title === memo.title))
  assert.doesNotMatch(contexts[0].text(), /辅导员/)

  // 助手提醒用户：交给壳一条消息（托盘图标闪），带着叫它的那个对话，点托盘时回到那里。没有标题的不发。
  const notified = await tools.get('campus_notify').execute({ title: 'CC98 新消息', text: '老王回复了你' }, { agent: { session: { id: 'ses_42' } } })
  assert.deepEqual(notified, { title: 'CC98 新消息', text: '老王回复了你', sessionId: 'ses_42', sent: true })
  assert.deepEqual(alerts.at(-1), { type: 'alert', alert: { title: 'CC98 新消息', text: '老王回复了你', sessionId: 'ses_42' } })
  await assert.rejects(() => tools.get('campus_notify').execute({ title: '  ', text: '标题是空的' }, {}), /提醒要有标题/)
  assert.match(tools.get('campus_notify').description, /没查到新东西不提醒/)

  // 助手存下的技能在插件页列得出来，引擎的技能目录里也有；只有页面能删。
  // 正文的六节照自带技能的结构（core/skills/README.md），缺一节存不进去；存成档案目录 skills/ 下的一个文件夹。
  const skillBody = ['什么时候用', '开始前', '步骤', '交付', '做完以后', '出错和边界'].map(name => `## ${name}\n\n${name === '步骤' ? '先查通知。' : '照常。'}`).join('\n\n')
  await assert.rejects(() => tools.get('campus_skill_save').execute({ name: 'course-withdrawal', title: '退课怎么办', description: '问退课时用', body: '先查通知。' }, {}), /正文缺这几节/)
  const saved = await tools.get('campus_skill_save').execute({ name: 'course-withdrawal', title: '退课怎么办', description: '问退课时用', body: skillBody }, {})
  assert.equal('body' in saved, false)
  assert.equal('path' in saved || 'root' in saved, false)
  // 插件页「技能」一组：自带的工作流在前（带 builtin），学到的在后。
  const listed = (await call('skills-list')).value
  assert.deepEqual(listed.filter(item => item.builtin).map(item => item.name), ['core:initialize', ...FLOWS.map(name => `flow:${name}`)])
  assert.ok(listed.filter(item => item.builtin).every(item => item.title && item.description && item.notes === 0 && !('body' in item)))
  assert.deepEqual(listed.filter(item => !item.builtin).map(item => [item.name, item.title]), [['course-withdrawal', '退课怎么办']])
  // 自带的不能删，学到的技能也不能起和它们一样的名字。
  assert.equal((await call('skill-delete', { name: 'flow:course-selection' })).status, 400)
  assert.equal((await call('skill-read', { name: 'core:initialize' })).value.title, '初始化')
  const initialization = (await call('skill-read', { name: 'core:initialize' })).value
  assert.deepEqual(initialization.references.map(item => item.path), ['references/matching.md', 'references/sources.md'])
  const matching = (await call('skill-read', { name: 'core:initialize', reference: initialization.references[0].path })).value
  assert.equal(matching.reference.path, 'references/matching.md')
  assert.equal(matching.body, fs.readFileSync(path.join(CORE_ROOT, 'initialize', 'references', 'matching.md'), 'utf8').replaceAll('\r\n', '\n'))
  for (const reference of ['../mail/SKILL.md', '../../api-keys.local.yaml', 'SKILL.md']) assert.equal((await call('skill-read', { name: 'core:initialize', reference })).status, 400)
  assert.equal((await call('skill-delete', { name: 'core:initialize' })).status, 400)
  const selection = (await call('skill-read', { name: 'flow:course-selection' })).value
  assert.equal(selection.title, '选课')
  assert.ok(selection.references.some(item => item.path === 'skills/course-selection/references/compare-teachers.md'))
  assert.equal((await call('skill-read', { name: 'flow:course-selection', reference: 'skills/course-selection/references/compare-teachers.md' })).status, 200)
  assert.equal((await call('skill-read', { name: 'flow:course-teachers' })).status, 400)
  await assert.rejects(() => tools.get('campus_skill_save').execute({ name: 'exam-prep', title: '考前', description: '考前用', body: '看书。' }, {}), /应用自带的技能/)
  assert.equal((await call('skill-read', { name: 'course-withdrawal' })).value.body, `${skillBody}\n`)
  assert.ok((await provider.list()).some(skill => skill.name === 'course-withdrawal'))
  assert.deepEqual((await call('skill-delete', { name: 'course-withdrawal' })).value, { name: 'course-withdrawal' })

  // 工作流的补充存在档案目录，拼在 zju 技能正文的末尾；页面上列得出来、删得掉，删了引擎重读技能。
  const zju = async () => (await provider.list()).find(skill => skill.name === 'zju').content
  assert.doesNotMatch(await zju(), /工作流的补充/)
  assert.deepEqual((await call('flow-notes-list')).value, [])
  fs.writeFileSync(path.join(root, 'profile', 'flow-notes.json'), JSON.stringify({ notes: [{ id: 'n1', flow: 'course-selection', text: '实验课的教学班在单独的页面里选。', source: '用户说', addedAt: '2026-10-12T00:00:00Z', flowHash: 'old' }] }))
  // 技能的大标题取自正文，不在这里写死。
  const selectionTitle = new FlowNotes({ file: path.join(root, 'none.json'), flowsDir: path.join(CORE_ROOT, 'skills') }).flows().find(flow => flow.name === 'course-selection').title
  assert.ok((await zju()).endsWith(`## 工作流的补充\n\n下面几条是使用中补进来的，不在技能的文件里。照对应的技能办事时一并照做；正文已经写了的，以正文为准。\n\n### ${selectionTitle}（技能 course-selection）：工作流在这些补充之后更新过，先对照正文\n- 实验课的教学班在单独的页面里选。（用户说）\n`))
  assert.deepEqual((await call('flow-notes-list')).value.map(note => [note.id, note.flowTitle, note.stale]), [['n1', selectionTitle, true]])
  // 插件页「技能」一组里，这个工作流那一项记着有一条补充；点开是工作流的全文，补充接在后面。单独加载这个工作流时也带着。
  assert.deepEqual((await call('skills-list')).value.filter(item => item.notes).map(item => [item.name, item.title, item.notes]), [['flow:course-selection', '选课', 1]])
  const tail = /## (?:1\. )?开始前[\s\S]*## 使用中补充的\n\n下面几条是使用中补进来的，工作流在这之后更新过，先对照正文：\n\n- 实验课的教学班在单独的页面里选。（用户说）\n$/
  assert.match((await call('skill-read', { name: 'flow:course-selection' })).value.body, tail)
  const flow = (await provider.list()).find(skill => skill.name === 'course-selection')
  assert.match(flow.description, /^选课：/)
  assert.match(flow.content, /^这是应用自带的技能。正文里的校园命令/)
  assert.match(flow.content, tail)
  // 每个自带的工作流都写了什么时候用，正文里的命令是 core 里真有的（见 catalog.test.mjs 对命令的核对）。
  for (const name of FLOWS) assert.ok((await provider.list()).find(skill => skill.name === name).description.length > 20, name)
  const reloaded = reloads
  assert.deepEqual((await call('flow-note-delete', { id: 'n1' })).value, { id: 'n1' })
  assert.equal(reloads, reloaded + 1)
  assert.doesNotMatch(await zju(), /工作流的补充/)
  // 对话后的复盘默认开着，能关；还没整理过时列表是空的。
  assert.deepEqual((await call('review-read')).value, { enabled: true, idleMinutes: 10, entries: [] })
  assert.equal((await call('review-set', { enabled: false })).value.enabled, false)
  assert.equal((await call('review-undo', { id: 'x' })).status, 400)
  // 对话里的助手不再顺手记记忆：工具的说明和底层说明里都这么写。
  assert.match(writeTool.description, /只在两种时候用：用户明确让你记住关于他本人的事；技能里写明要记的那一步/)

  // 通知的筛选：默认带着几个屏蔽词，可以改；这里没有模型服务，问不成就不筛，通知照原样给。
  assert.deepEqual((await call('notice-filter-read')).value, { blocked: ['劳务派遣', '经费认领', '汇款认领'], byProfile: true })
  assert.deepEqual((await call('notice-filter-save', { blocked: ['测试'] })).value, { blocked: ['测试'], byProfile: true })
  assert.equal((await call('feed-refresh', { force: true })).value.items.find(item => item.title === '测试推文').hidden, 'blocked')
  await call('notice-filter-save', { blocked: [] })
  // 通知列表：没填统一身份认证时不去读学校通知，公众号的文章照样在。
  const feed = (await call('feed-read')).value
  assert.equal(feed.sources.find(source => source.id === 'school').state, 'account')
  assert.equal(feed.sources.find(source => source.id === 'wechat').state, 'ready')
  assert.deepEqual(feed.items.map(item => [item.title, item.from, item.hidden]), [['测试推文', '浙大体育与艺术', null]])
  // 通知那一行的「加到备忘录」：加进去的带着来源、日期和原文链接；再点一次不重复加；不在列表里的拒绝。
  assert.deepEqual((await call('feed-memo', { id: feed.items[0].id })).value, { title: '测试推文', existed: false, summarized: false, reason: '' })
  const clipped = (await call('memo-list')).value.notes.find(item => item.title === '测试推文')
  assert.deepEqual(clipped.properties, [{ key: '来源', value: '浙大体育与艺术' }, { key: '日期', value: '2026-10-09' }])
  assert.equal(clipped.body, '[查看原文](https://mp.weixin.qq.com/s/x)\n')
  assert.equal((await call('feed-memo', { id: feed.items[0].id, summarize: true })).value.existed, true)
  assert.equal((await call('feed-memo', { id: 'wechat:没有的' })).status, 400)
  assert.equal((await call('feed-content', { id: 'wechat:没有的', url: 'https://example.com' })).status, 400)

  // 账号页能读写密码，模型看得到的上下文和档案工具里没有它。这里不用统一身份认证的账号：保存它会去教务网读学籍。
  const account = (await call('account-read')).value
  assert.equal((await call('account-save', { revision: account.revision, values: { cc98_username: 'fixture', cc98_password: 'secret-fixture' } })).value.values.cc98_password, 'secret-fixture')
  assert.match(contexts[0].text(), /AVL 树的反馈/)
  assert.doesNotMatch(contexts[0].text(), /secret-fixture|还不熟/)
  assert.doesNotMatch(JSON.stringify(await readTool.execute({}, {})), /secret-fixture/)
  // 底层说明是 core/AGENT.md 整篇，记忆、备忘录、技能各在什么时候写也在里面；花括号不做替换。
  const agent = policies.find(section => section.name === 'campus-agent')
  assert.equal(agent.interpolate, false)
  assert.match(agent.text(), /不授予操作权限/)
  assert.match(agent.text(), /校园智能体/)
  // 拼系统提示的最后一步：引擎写给编程助手的三段去掉，预设带的那条英文人设换成我们的，别的段不动。
  const assembled = await listeners['system-prompt/assemble']({}, {}, async () => ({ tools: ['kept'], sections: [
    { name: 'harness:identity', text: 'You are an AI agent powered by DeepSeek Harness.' },
    { name: 'deployment:persona-prefix', text: 'You are a coding agent powered by the {{model}} model.' },
    { name: 'campus-agent', text: 'x' }, { name: 'tool:bash', text: 'y' },
    { name: 'harness:source', text: 'checkout' }, { name: 'app:web-surface', text: 'gui' },
    { name: 'deployment:persona-suffix', text: 'Your working directory is {{cwd}}.' },
  ] }))
  assert.deepEqual(assembled.sections.map(section => section.name), ['deployment:persona-prefix', 'campus-agent', 'tool:bash', 'deployment:persona-suffix'])
  assert.match(assembled.sections[0].text, /^你是「校园智能体」里的助手.*\{\{model\}\}/)
  assert.deepEqual(assembled.tools, ['kept'])

  // 看文件的那一段：给出引擎自带的 Office 命令行在哪、怎么渲染成图。
  const files = contexts.find(context => context.name === 'campus-files')
  assert.match(files.text(), /doc text[\s\S]*read_image[\s\S]*libreoffice-kit[\\/]lib[\\/]cli\.js" render --input[\s\S]*convert --input/)

  // 「课程讲解」默认关着：learn 技能不交给引擎，上下文里不提讲解目录，但说明它关着，依赖也装不了。
  const learning = contexts.find(context => context.name === 'campus-learning')
  assert.deepEqual((await provider.list()).map(skill => skill.name).sort(), [...FLOWS, 'campus-mail', 'initialize', 'weread', 'zju'].sort())
  assert.equal(learning.text(), '')
  assert.match(contexts[0].text(), /课程讲解（learn 技能，做讲解）/)
  assert.equal((await call('learn-read')).value.enabled, false)
  assert.equal((await call('learn-install', { id: 'tex' })).status, 400)
  assert.ok(!(await call('skills-list')).value.some(skill => skill.name === 'core:learn'))
  assert.equal((await call('skill-read', { name: 'core:learn' })).status, 400)
  // 打开：引擎被叫去重读技能目录，learn 回来了。
  const before = reloads
  await call('plugins-set', { id: 'campus.learn', enabled: true })
  assert.equal(reloads, before + 1)
  assert.match(learning.text(), /讲解目录/)
  assert.doesNotMatch(contexts[0].text(), /课程讲解/)
  assert.deepEqual((await call('learn-read')).value.parts.map(part => part.id), ['tex', 'browser'])
  const skills = await provider.list()
  assert.ok((await call('skills-list')).value.some(skill => skill.name === 'core:learn'))
  assert.equal((await call('skill-read', { name: 'core:learn' })).value.title, '课程讲解')
  assert.equal((await call('skill-delete', { name: 'core:learn' })).status, 400)
  assert.deepEqual(skills.map(skill => skill.name).sort(), [...FLOWS, 'campus-mail', 'initialize', 'learn', 'weread', 'zju'].sort())
  for (const skill of skills) assert.ok(path.resolve(skill.path).startsWith(path.resolve(CORE_ROOT)))
  assert.match((await provider.get(skills.find(skill => skill.name === 'learn'))).content, /campus_profile_read/)
  assert.match((await provider.get(skills.find(skill => skill.name === 'zju'))).content, /campus_profile_write/)
  // weread 技能的说明写的是应用里的用法：名单和插件页是同一份，要用户处理的事请他去插件页。
  assert.match((await provider.get(skills.find(skill => skill.name === 'weread'))).content, /scripts\/weread\.ts[\s\S]*「插件」页「微信公众号」/)

  // 再关上：learn 又没有了。
  await call('plugins-set', { id: 'campus.learn', enabled: false })
  assert.ok(!(await call('skills-list')).value.some(skill => skill.name === 'core:learn'))
  assert.deepEqual((await provider.list()).map(skill => skill.name).sort(), [...FLOWS, 'campus-mail', 'initialize', 'weread', 'zju'].sort())
})

test('CC98 读到基线以后新来的消息，经壳的通道提醒托盘，点了去「校园事务」的「个人消息」；基线不提醒', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-profile-alert-'))
  const previous = process.env.CAMPUS_PROFILE_DIR
  process.env.CAMPUS_PROFILE_DIR = path.join(root, 'profile')
  t.after(() => {
    if (previous === undefined) delete process.env.CAMPUS_PROFILE_DIR
    else process.env.CAMPUS_PROFILE_DIR = previous
    fs.rmSync(root, { recursive: true, force: true })
  })
  let route
  const ctx = {
    effect() {}, logger: { warn() {} }, on() {},
    connection: { fetch: { register: value => { route = value } } },
    tools: { register() {} }, skills: { registerProvider() {} }, systemPrompt: { context() {}, section() {} },
  }
  // 合成的 CC98 消息，不连论坛：第二次读时多了一条回复。
  const replies = [{ id: 1, at: '2026-10-18T01:00:00.000Z', time: '2026-10-18 09:00', from: 'user1', topic: '选课咨询', content: '一', url: 'https://www.cc98.org/topic/1#1' }]
  const alerts = []
  installProfile(ctx, {
    alertSend: (message) => { alerts.push(message); return true },
    chatRun: async (_platform, args) => args[0] === 'status' ? { ok: true, running: false } : { ok: true, chats: [], hasMore: false },
    wechatRun: async () => ({ ok: true, state: { ok: true }, accounts: [] }),
    cc98Run: async args => { assert.deepEqual(args.slice(0, 3), ['cc98', 'account', 'notifications']); return { groups: [{ kind: 'reply', items: replies }, { kind: 'at', items: [] }, { kind: 'system', items: [] }] } },
  })
  const call = async (action, input = {}) => (await (await route.fetch(new Request('http://localhost/api/campus/profile', { method: 'POST', body: JSON.stringify({ action, input }) }))).json()).value
  const account = await call('account-read')
  await call('account-save', { revision: account.revision, values: { cc98_username: 'fixture', cc98_password: 'secret-fixture', webvpn_username: 'a', webvpn_password: 'b' } })
  const first = await call('feed-refresh', { force: true })
  assert.deepEqual(first.items.filter(item => item.kind === 'cc98').map(item => [item.title, item.view]), [['user1回复了「选课咨询」', 'personal']])
  assert.deepEqual(alerts, [])
  replies.unshift({ ...replies[0], id: 2, at: '2026-10-18T02:00:00.000Z', from: 'user2', url: 'https://www.cc98.org/topic/1#2' })
  await call('feed-refresh', { force: true })
  assert.deepEqual(alerts, [{ type: 'alert', alert: { title: 'CC98 有新消息', text: 'user2回复了「选课咨询」', panel: 'campus.affairs:personal' } }])
})
