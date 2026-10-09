import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { installProfile } from './host.mjs'
import { CORE_ROOT } from './skills.mjs'
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
  const tools = new Map(), contexts = [], policies = [], effects = []
  let route, provider
  const ctx = {
    effect: create => { effects.push(create) },
    logger: { warn: message => assert.fail(message) },
    connection: { fetch: { register: value => { route = value } } },
    tools: { register: tool => tools.set(tool.name, tool) },
    skills: { registerProvider: create => { provider = create({ invalidate() {}, signal: new AbortController().signal }) } },
    systemPrompt: { context: value => contexts.push(value), section: value => policies.push(value) },
  }
  installProfile(ctx, { wechatRun: async args => args[0] === 'list' ? { ok: true, accounts: [{ biz: 'MzA3MDk5NDA0NA==', name: '浙大体育与艺术', articleCount: 79 }], runtime: null }
    : { ok: true, articles: [{ title: '测试推文' }] } })
  assert.equal(effects.length, 2)
  const call = async (action, input = {}) => {
    const response = await route.fetch(new Request('http://localhost/api/campus/profile', { method: 'POST', body: JSON.stringify({ action, input }) }))
    return { status: response.status, ...(await response.json()) }
  }
  // 页面靠这个指纹判断后台是不是比界面旧。
  assert.equal((await call('stamp')).value, engineStamp())
  assert.match(engineStamp(), /^[0-9a-f]{12}$/)
  assert.equal((await call('wechat-read')).value.accounts[0].articleCount, 79)
  const wechatTool = tools.get('campus_wechat_read')
  assert.equal((await wechatTool.execute({ account: '浙大体育与艺术' })).articles[0].title, '测试推文')
  await call('plugins-set', { id: 'campus.wechat', enabled: false })
  await assert.rejects(wechatTool.execute({}), /插件已关闭/)
  assert.equal((await call('wechat-discover')).status, 400)
  await call('plugins-set', { id: 'campus.wechat', enabled: true })
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

  // 助手存下的技能在插件页列得出来，引擎的技能目录里也有；只有页面能删。
  const saved = await tools.get('campus_skill_save').execute({ name: 'course-withdrawal', title: '退课怎么办', description: '问退课时用', body: '先查通知。' }, {})
  assert.equal('body' in saved, false)
  assert.deepEqual((await call('skills-list')).value.map(item => [item.name, item.title]), [['course-withdrawal', '退课怎么办']])
  assert.equal((await call('skill-read', { name: 'course-withdrawal' })).value.body, '先查通知。\n')
  assert.ok((await provider.list()).some(skill => skill.name === 'course-withdrawal'))
  assert.deepEqual((await call('skill-delete', { name: 'course-withdrawal' })).value, { name: 'course-withdrawal' })

  // 通知列表：没填统一身份认证时不去读学校通知，公众号的文章照样在。
  const feed = (await call('feed-read')).value
  assert.equal(feed.sources.find(source => source.id === 'school').state, 'account')
  assert.equal(feed.sources.find(source => source.id === 'wechat').state, 'ready')

  // 账号页能读写密码，模型看得到的上下文和档案工具里没有它。这里不用统一身份认证的账号：保存它会去教务网读学籍。
  const account = (await call('account-read')).value
  assert.equal((await call('account-save', { revision: account.revision, values: { cc98_username: 'fixture', cc98_password: 'secret-fixture' } })).value.values.cc98_password, 'secret-fixture')
  assert.match(contexts[0].text(), /AVL 树的反馈/)
  assert.doesNotMatch(contexts[0].text(), /secret-fixture|还不熟/)
  assert.doesNotMatch(JSON.stringify(await readTool.execute({}, {})), /secret-fixture/)
  assert.match(policies[0].text, /不授予操作权限/)

  const skills = await provider.list()
  assert.deepEqual(skills.map(skill => skill.name).sort(), ['learn', 'weread', 'weread-skills', 'zju'])
  for (const skill of skills) assert.ok(path.resolve(skill.path).startsWith(path.resolve(CORE_ROOT)))
  assert.match((await provider.get(skills.find(skill => skill.name === 'learn'))).content, /campus_profile_read/)
  assert.match((await provider.get(skills.find(skill => skill.name === 'zju'))).content, /campus_profile_write/)
})
