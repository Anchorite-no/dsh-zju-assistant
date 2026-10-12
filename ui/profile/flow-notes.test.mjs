import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { FlowNotes } from './flow-notes.mjs'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-flow-notes-'))
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }) })
  const flowsDir = path.join(root, 'flows')
  fs.mkdirSync(flowsDir)
  fs.writeFileSync(path.join(flowsDir, 'README.md'), '# 工作流\n')
  fs.writeFileSync(path.join(flowsDir, 'course-selection.md'), '---\ntitle: 本科选课\ndescription: 一个学期的选课怎么走。用户说选课、退课时用。\n---\n# 本科选课工作流\n\n## 1. 开始前\n\n先读当期[选课通知](../references/notice.md#list)，确认轮次和时间窗。\n')
  // 没写「什么时候用」的：只是 zju 里的一篇文档，不单独当技能列出来。
  fs.writeFileSync(path.join(flowsDir, 'plain.md'), '# 没有属性区的工作流\n\n照着做。\n')
  let changed = 0
  const notes = new FlowNotes({ file: path.join(root, 'profile', 'flow-notes.json'), flowsDir })
  notes.onChange = () => { changed++ }
  return { notes, flowsDir, changed: () => changed }
}

test('工作流的补充：存在档案目录，拼成给 zju 技能用的一段，能删', t => {
  const { notes, changed } = fixture(t)
  // 属性区里是给人看的名字和什么时候用；正文和它的指纹都不含属性区，光改属性区不会让已有的补充变成待核对。
  assert.deepEqual(notes.flows().map(flow => [flow.name, flow.title, flow.label, flow.description]), [
    ['course-selection', '本科选课工作流', '本科选课', '一个学期的选课怎么走。用户说选课、退课时用。'],
    ['plain', '没有属性区的工作流', '没有属性区的工作流', ''],
  ])
  assert.ok(notes.flows()[0].text.startsWith('# 本科选课工作流\n'))
  assert.equal(notes.section(), '')
  // 还没有补充时：插件页「技能」一组里，写了什么时候用的工作流各算一项自带的技能，正文是工作流的全文（大标题页面上另有）。
  assert.deepEqual(notes.groups().map(({ updatedAt: _at, ...group }) => group), [{
    name: 'flow:course-selection', title: '本科选课', description: '一个学期的选课怎么走。用户说选课、退课时用。', builtin: true, notes: 0,
    body: '## 1. 开始前\n\n先读当期选课通知，确认轮次和时间窗。\n',
  }])
  assert.equal(notes.notesSection('course-selection'), '')
  assert.throws(() => notes.removeGroup({ name: 'flow:course-selection' }), /应用自带的技能，没有可以删的补充/)
  const note = notes.add({ flow: 'course-selection', text: '实验课的教学班在单独的页面里选，\n自主选课里搜不到。', source: '用户说', session: 's1' })
  assert.equal(note.text, '实验课的教学班在单独的页面里选， 自主选课里搜不到。')
  notes.add({ flow: 'course-selection', text: '跨校区的课要留出四十分钟的路程。', source: 'https://example.edu/notice/1' })
  assert.equal(changed(), 2)
  assert.deepEqual(notes.list().map(item => [item.flowTitle, item.stale]), [['本科选课工作流', false], ['本科选课工作流', false]])
  const section = notes.section()
  assert.match(section, /## 工作流的补充[\s\S]*### 本科选课工作流（flows\/course-selection\.md）\n- 实验课的教学班在单独的页面里选， 自主选课里搜不到。（用户说）\n- 跨校区的课要留出四十分钟的路程。（来源：https:\/\/example\.edu\/notice\/1）/)
  // 有了补充：接在正文后面的一节里，早的在前；页面上和单独加载这个工作流时看到的是同一节。
  const added = '\n\n## 使用中补充的\n\n下面几条是使用中补进来的，一并照做；正文已经写了的，以正文为准：\n\n- 实验课的教学班在单独的页面里选， 自主选课里搜不到。（用户说）\n- 跨校区的课要留出四十分钟的路程。（来源：https://example.edu/notice/1）\n'
  assert.equal(notes.notesSection('course-selection'), added)
  assert.deepEqual(notes.groups().map(group => [group.name, group.title, group.notes, group.body]), [['flow:course-selection', '本科选课', 2, `## 1. 开始前\n\n先读当期选课通知，确认轮次和时间窗。${added}`]])
  assert.throws(() => notes.group({ name: 'flow:nope' }), /没有这个技能/)
  // 没写什么时候用的工作流，有了补充才列出来，好让人看得到、删得掉。
  const plain = notes.add({ flow: 'plain', text: '这一条补在没有属性区的工作流上。' })
  assert.deepEqual(notes.groups().map(group => [group.name, group.description]).at(-1), ['flow:plain', '照这个工作流办事时补进来的 1 条。'])
  notes.remove({ id: plain.id })
  assert.equal(notes.groups().length, 1)
  assert.deepEqual(notes.remove({ id: note.id }), { id: note.id })
  assert.equal(notes.list().length, 1)
  assert.throws(() => notes.remove({ id: note.id }), /没有这条补充/)
  assert.deepEqual(notes.removeGroup({ name: 'flow:course-selection' }), { name: 'flow:course-selection' })
  assert.deepEqual(notes.list(), [])
})

test('补充过不了的几种：没有这个工作流、太短太长、重复、正文里已经有、满了', t => {
  const { notes } = fixture(t)
  assert.throws(() => notes.add({ flow: 'graduation', text: '毕业手续先去学院盖章再去教务。' }), /没有「graduation」这个工作流/)
  assert.throws(() => notes.add({ flow: 'course-selection', text: '太短' }), /太短/)
  assert.throws(() => notes.add({ flow: 'course-selection', text: '长'.repeat(301) }), /太长/)
  assert.throws(() => notes.add({ flow: 'course-selection', text: '先读当期选课通知，确认轮次和时间窗' }), /正文里已经有了/)
  notes.add({ flow: 'course-selection', text: '实验课的教学班在单独的页面里选。' })
  assert.throws(() => notes.add({ flow: 'course-selection', text: '实验课的教学班，在单独的页面里选' }), /同一件事/)
  for (let index = 0; index < 7; index++) notes.add({ flow: 'course-selection', text: `第 ${index} 条各不相同的补充内容。` })
  assert.throws(() => notes.add({ flow: 'course-selection', text: '第九条放不下的补充内容。' }), /已经有 8 条/)
})

test('应用升级后工作流的正文变了，之前的补充标成待核对', t => {
  const { notes, flowsDir } = fixture(t)
  notes.add({ flow: 'course-selection', text: '实验课的教学班在单独的页面里选。' })
  fs.appendFileSync(path.join(flowsDir, 'course-selection.md'), '\n## 2. 实验课\n\n在实验课选课页面里选。\n')
  assert.equal(notes.list()[0].stale, true)
  assert.match(notes.section(), /工作流在这些补充之后更新过，先对照正文/)
  // 工作流被拿掉以后，它的补充不再列出来，也不再交给助手。
  fs.rmSync(path.join(flowsDir, 'course-selection.md'))
  assert.deepEqual(notes.list(), [])
  assert.equal(notes.section(), '')
})
