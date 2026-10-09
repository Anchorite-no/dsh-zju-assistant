import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { LearnedSkills } from './learned.mjs'
import { coreSkillNames, installCoreSkills } from './skills.mjs'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-learned-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return new LearnedSkills(root, coreSkillNames())
}

test('学到的技能存成档案目录里的技能文件，能读、能整篇换、能删', t => {
  const learned = fixture(t)
  assert.deepEqual(learned.list(), [])
  const saved = learned.save({ name: 'course-withdrawal', title: '退课怎么办', description: '用户问退课、\n中期退课、退课截止时间时用', body: '## 步骤\n1. `zju notice list --keyword 退课`' })
  assert.equal(fs.readFileSync(saved.path, 'utf8'), '---\nname: course-withdrawal\ntitle: 退课怎么办\ndescription: 用户问退课、 中期退课、退课截止时间时用\n---\n## 步骤\n1. `zju notice list --keyword 退课`\n')
  assert.deepEqual(learned.list().map(skill => [skill.name, skill.title]), [['course-withdrawal', '退课怎么办']])
  assert.match(learned.save({ name: 'course-withdrawal', title: '退课怎么办', description: '退课', body: '改过的走法' }).body, /改过的走法/)
  assert.equal(learned.list().length, 1)
  // 名字要是引擎认的写法，不能顶掉应用自带的技能，几样都得有。
  for (const name of ['退课', 'Course', 'a--b', '../x', '']) assert.throws(() => learned.save({ name, title: 'x', description: 'x', body: 'x' }), /小写字母/)
  assert.throws(() => learned.save({ name: 'zju', title: 'x', description: 'x', body: 'x' }), /自带的技能/)
  assert.throws(() => learned.save({ name: 'a', title: '', description: 'x', body: 'x' }), /要有名字/)
  assert.throws(() => learned.save({ name: 'a', title: 'x', description: 'x', body: ' ' }), /要有正文/)
  // 手放进去的、不成格式的文件不算技能。
  fs.writeFileSync(path.join(learned.dir, 'broken.md'), '没有属性区')
  fs.writeFileSync(path.join(learned.dir, 'other-name.md'), '---\nname: not-this-file\ndescription: x\n---\n正文')
  assert.equal(learned.list().length, 1)
  assert.deepEqual(learned.remove({ name: 'course-withdrawal' }), { name: 'course-withdrawal' })
  assert.throws(() => learned.read({ name: 'course-withdrawal' }), /没有这个技能/)
})

test('学到的技能和自带的一起交给引擎，增减时让引擎重读目录', async t => {
  const learned = fixture(t)
  let provider, invalidated = 0
  installCoreSkills({ skills: { registerProvider: (create) => { provider = create({ invalidate: () => { invalidated++ }, signal: new AbortController().signal }) } } }, learned)
  const before = (await provider.list()).length
  learned.save({ name: 'gym-booking-rules', title: '场馆放号规则', description: '问体育馆几点放号', body: '每天 7 点放后天的场。' })
  assert.equal(invalidated, 1)
  const skills = await provider.list(), mine = skills.find(skill => skill.name === 'gym-booking-rules')
  assert.equal(skills.length, before + 1)
  assert.equal(mine.description, '场馆放号规则：问体育馆几点放号')
  assert.equal((await provider.get(mine)).content, '每天 7 点放后天的场。\n')
  learned.remove({ name: 'gym-booking-rules' })
  assert.equal(invalidated, 2)
  assert.equal((await provider.list()).length, before)
})
