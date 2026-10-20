import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { LearnedSkills, SECTIONS } from './learned.mjs'
import { coreSkillNames, installCoreSkills, skillDetail } from './skills.mjs'
import { FlowNotes } from './flow-notes.mjs'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-learned-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return new LearnedSkills(root, coreSkillNames())
}

/** 一篇六节齐全的正文；extra 接在「步骤」一节里。 */
const body = (extra = '') => `# 退课怎么办\n\n把一门课退掉。\n\n${SECTIONS.map(name => `## ${name}\n\n${name === '步骤' ? `1. \`notice list --keyword 退课\` 看截止。${extra}` : `${name}的内容。`}`).join('\n\n')}`

test('学到的技能存成档案目录里的一个文件夹：正文加参考文档，能读、能整篇换、能删', t => {
  const learned = fixture(t)
  assert.deepEqual(learned.list(), [])
  const saved = learned.save({ name: 'course-withdrawal', title: '退课怎么办', description: '用户问退课、\n中期退课、退课截止时间时用', body: body('细则见 [退课规则](references/rules.md)。'), references: [{ name: 'rules.md', body: '# 退课规则\n\n中期退课要审批。' }] })
  assert.equal(saved.path, path.join(learned.dir, 'course-withdrawal', 'SKILL.md'))
  assert.ok(fs.readFileSync(saved.path, 'utf8').startsWith('---\nname: course-withdrawal\ntitle: 退课怎么办\ndescription: 用户问退课、 中期退课、退课截止时间时用\n---\n# 退课怎么办\n'))
  assert.equal(fs.readFileSync(path.join(learned.dir, 'course-withdrawal', 'references', 'rules.md'), 'utf8'), '# 退课规则\n\n中期退课要审批。\n')
  assert.deepEqual(saved.references, ['references/rules.md'])
  assert.deepEqual(learned.list().map(skill => [skill.name, skill.title]), [['course-withdrawal', '退课怎么办']])
  // 页面上点得开参考文档；它在技能自己的文件夹里，读不到别的技能和档案里的文件。
  const detail = skillDetail({ name: 'course-withdrawal', reference: 'references/rules.md' }, { learned })
  assert.equal(detail.reference.title, '退课规则')
  assert.equal(detail.body, '# 退课规则\n\n中期退课要审批。\n')
  assert.throws(() => skillDetail({ name: 'course-withdrawal', reference: '../../identity.json' }, { learned }), /不在该技能的参考资料中/)
  // 整篇换掉：这次没给的旧参考文档一起拿掉。
  assert.match(learned.save({ name: 'course-withdrawal', title: '退课怎么办', description: '退课', body: body('改过的走法。') }).body, /改过的走法/)
  assert.equal(fs.existsSync(path.join(learned.dir, 'course-withdrawal', 'references', 'rules.md')), false)
  assert.equal(learned.list().length, 1)
  assert.deepEqual(learned.remove({ name: 'course-withdrawal' }), { name: 'course-withdrawal' })
  assert.equal(fs.existsSync(path.join(learned.dir, 'course-withdrawal')), false)
  assert.throws(() => learned.read({ name: 'course-withdrawal' }), /没有这个技能/)
})

test('存不进去的几种：名字、重名、缺字段、缺节、参考文档不对', t => {
  const learned = fixture(t), ok = { title: 'x', description: 'x', body: body() }
  for (const name of ['退课', 'Course', 'a--b', '../x', '']) assert.throws(() => learned.save({ ...ok, name }), /小写字母/)
  assert.throws(() => learned.save({ ...ok, name: 'zju' }), /自带的技能/)
  assert.throws(() => learned.save({ ...ok, name: 'a', title: '' }), /要有名字/)
  assert.throws(() => learned.save({ ...ok, name: 'a', body: ' ' }), /要有正文/)
  // 只有步骤、没有别的几节的，是原来那种命令清单，不收。
  assert.throws(() => learned.save({ ...ok, name: 'a', body: '## 步骤\n1. `notice list --keyword 退课`' }), /缺这几节：「## 什么时候用」、「## 开始前」、「## 交付」、「## 做完以后」、「## 出错和边界」/)
  assert.throws(() => learned.save({ ...ok, name: 'a', body: `---\nname: a\n---\n${body()}` }), /不要带属性区/)
  assert.throws(() => learned.save({ ...ok, name: 'a', body: body('见 [规则](references/rules.md)。') }), /references\/rules\.md 没有给出来/)
  assert.throws(() => learned.save({ ...ok, name: 'a', references: [{ name: 'rules.md', body: '规则' }] }), /正文里没有链到/)
  for (const name of ['规则.md', 'rules.txt', '../x.md', '']) assert.throws(() => learned.save({ ...ok, name: 'a', references: [{ name, body: 'x' }] }), /英文短名加 \.md/)
  assert.throws(() => learned.save({ ...ok, name: 'a', references: Array.from({ length: 9 }, (_, index) => ({ name: `r${index}.md`, body: 'x' })) }), /最多 8 篇/)
  assert.deepEqual(learned.list(), [])
})

test('早先存成单个文件的技能照旧能读、能删，再存一次就换成文件夹', t => {
  const learned = fixture(t)
  fs.mkdirSync(learned.dir, { recursive: true })
  fs.writeFileSync(path.join(learned.dir, 'gym-rules.md'), '---\nname: gym-rules\ntitle: 场馆放号\ndescription: 问体育馆几点放号\n---\n每天 7 点放后天的场。\n')
  // 手放进去的、不成格式的文件不算技能。
  fs.writeFileSync(path.join(learned.dir, 'broken.md'), '没有属性区')
  fs.writeFileSync(path.join(learned.dir, 'other-name.md'), '---\nname: not-this-file\ndescription: x\n---\n正文')
  assert.deepEqual(learned.list().map(skill => [skill.name, skill.body, skill.root]), [['gym-rules', '每天 7 点放后天的场。\n', learned.dir]])
  learned.save({ name: 'gym-rules', title: '场馆放号', description: '问体育馆几点放号', body: body() })
  assert.equal(fs.existsSync(path.join(learned.dir, 'gym-rules.md')), false)
  assert.equal(learned.read({ name: 'gym-rules' }).root, path.join(learned.dir, 'gym-rules'))
  fs.writeFileSync(path.join(learned.dir, 'old-one.md'), '---\nname: old-one\ndescription: 旧的\n---\n旧做法\n')
  assert.deepEqual(learned.remove({ name: 'old-one' }), { name: 'old-one' })
  assert.equal(fs.existsSync(path.join(learned.dir, 'old-one.md')), false)
})

test('学到的技能和自带的一起交给引擎，增减时让引擎重读目录', async t => {
  const learned = fixture(t)
  let provider, invalidated = 0
  installCoreSkills({ skills: { registerProvider: (create) => { provider = create({ invalidate: () => { invalidated++ }, signal: new AbortController().signal }) } } }, learned)
  const before = (await provider.list()).length
  learned.save({ name: 'gym-booking-rules', title: '场馆放号规则', description: '问体育馆几点放号', body: body() })
  assert.equal(invalidated, 1)
  const skills = await provider.list(), mine = skills.find(skill => skill.name === 'gym-booking-rules')
  assert.equal(skills.length, before + 1)
  assert.equal(mine.description, '场馆放号规则：问体育馆几点放号')
  // 引擎从技能自己的文件夹找参考文档。
  assert.deepEqual(mine.resourceBase, { kind: 'directory', path: path.join(learned.dir, 'gym-booking-rules') })
  assert.equal((await provider.get(mine)).content, `${body()}\n`)
  learned.remove({ name: 'gym-booking-rules' })
  assert.equal(invalidated, 2)
  assert.equal((await provider.list()).length, before)
})

test('已有子步骤和重名旧技能不会重新变成独立技能入口', async t => {
  const learned = fixture(t), flowsDir = path.join(learned.dir, '..', 'flows')
  for (const name of ['selection', 'teachers']) fs.mkdirSync(path.join(flowsDir, name), { recursive: true })
  fs.mkdirSync(learned.dir)
  fs.writeFileSync(path.join(flowsDir, 'selection', 'SKILL.md'), '---\nname: selection\ntitle: 选课\ndescription: 完成选课\n---\n# 选课\n')
  fs.writeFileSync(path.join(flowsDir, 'teachers', 'SKILL.md'), '---\ntitle: 比较老师\ndescription: 选课里的步骤\nparent: selection\n---\n# 比较老师\n')
  // 手动放入或老版本留下的文件绕过了 save 的重名校验。
  for (const name of ['initialize', 'teachers']) fs.writeFileSync(path.join(learned.dir, `${name}.md`), `---\nname: ${name}\ndescription: 旧内容\n---\n过期做法\n`)
  const notes = new FlowNotes({ file: path.join(flowsDir, 'notes.json'), flowsDir })
  const child = notes.add({ flow: 'teachers', text: '比较前确认课程教学班和学期一致。' })
  let provider
  installCoreSkills({ skills: { registerProvider: create => { provider = create({ invalidate() {} }) } } }, learned, undefined, notes)
  const entries = await provider.list()
  assert.equal(entries.filter(item => item.name === 'initialize').length, 1)
  assert.equal(entries.some(item => item.name === 'teachers'), false)
  assert.ok(entries.find(item => item.name === 'selection').content.includes(child.text))
  assert.equal(learned.list().length, 2) // 旧文件仍可查看和删除，不销毁用户记录。
})
