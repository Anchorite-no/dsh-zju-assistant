import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { CORE_ROOT } from './skills.mjs'
import { FlowNotes } from './flow-notes.mjs'

const flowsDir = path.join(CORE_ROOT, 'zju', 'flows')
const { modules } = await import(new URL('../../core/zju/lib/cli.ts', import.meta.url))

/**
 * 一段文字里提到的校园命令：从一个模块名开始，后面的词能顺着命令树往下走多远就算多远，再把同一句里的 --选项 收起来。
 * 一句到中文标点、反引号、表格的竖线或换行为止（竖线两边带空格的才算表格的；参数里拿竖线分隔几个值的不算）。
 */
function mentions(text) {
  const found = []
  for (const segment of text.split(/[，。；：、（）「」`\n]| \| /)) {
    const words = segment.trim().split(/\s+/)
    for (let index = 0; index < words.length; index++) {
      // 模块名后面得跟着它的一条命令，光是一个词（「教务网 zdbk」）不算。
      if (!Object.hasOwn(modules, words[index]) || !modules[words[index]].commands?.[words[index + 1]]) continue
      const names = [words[index], words[index + 1]]
      let node = modules[words[index]].commands[words[index + 1]], at = index + 2
      while (node.children?.[words[at]]) { node = node.children[words[at]]; names.push(words[at]); at++ }
      const flags = words.slice(at).filter(word => word.startsWith('--')).map(word => word.slice(2))
      found.push({ command: names.join(' '), node, flags })
      index = at - 1
    }
  }
  return found
}

function check(file, text) {
  const used = mentions(text)
  for (const { command, node, flags } of used) {
    assert.ok(!node.hidden, `${file}：${command} 是不公开的命令`)
    assert.ok(!node.children || node.options, `${file}：${command} 后面还要接一个动作`)
    for (const flag of flags) assert.ok(node.options && Object.hasOwn(node.options, flag), `${file}：${command} 没有 --${flag} 这个参数`)
  }
  return used
}

test('自带的工作流：每个都写了给人看的名字和什么时候用，文件名是引擎认的英文短名，四十行上下', () => {
  const flows = new FlowNotes({ file: path.join(flowsDir, 'no-notes.json'), flowsDir }).flows()
  assert.ok(flows.length >= 6)
  for (const flow of flows) {
    assert.match(flow.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, flow.name)
    assert.ok(flow.label && flow.label.length <= 12, `${flow.name} 的名字太长`)
    assert.ok(flow.description.length >= 30 && flow.description.length <= 160, `${flow.name} 的说明要说清什么时候用，又不能太长`)
    assert.match(flow.description, /用户[说问]/, `${flow.name} 的说明里写出用户会说的话`)
    assert.match(flow.text, /^# /, `${flow.name} 的正文从大标题开始`)
    assert.ok(flow.text.split('\n').length <= 60, `${flow.name} 太长了`)
  }
  // 说明总表和 zju 技能的正文里都列着它们。
  const readme = fs.readFileSync(path.join(flowsDir, 'README.md'), 'utf8'), skill = fs.readFileSync(path.join(CORE_ROOT, 'zju', 'SKILL.md'), 'utf8')
  for (const flow of flows) {
    assert.ok(readme.includes(`(${flow.name}.md)`), `flows/README.md 里没有 ${flow.name}`)
    assert.ok(skill.includes(`[${flow.label}](flows/${flow.name}.md)`), `SKILL.md 里没有 ${flow.label}`)
  }
})

test('工作流和定时任务的说明里写到的命令，core 里都真有，参数也对得上', () => {
  let total = 0
  for (const name of fs.readdirSync(flowsDir).filter(file => file.endsWith('.md') && file !== 'README.md')) {
    const used = check(`flows/${name}`, fs.readFileSync(path.join(flowsDir, name), 'utf8'))
    assert.ok(used.length >= 3, `flows/${name} 里至少写到三条命令`)
    total += used.length
  }
  total += check('references/schedule.md', fs.readFileSync(path.join(CORE_ROOT, 'zju', 'references', 'schedule.md'), 'utf8')).length
  assert.ok(total >= 40)
  // 这个检查自己认得出错的：不存在的动作、不存在的参数。
  assert.throws(() => check('x', '先 `zdbk selection sections --course 课程名 --nope 1`'), /没有 --nope 这个参数/)
  assert.throws(() => check('x', '执行 zdbk selection 看一下'), /后面还要接一个动作/)
  assert.deepEqual(mentions('用 zju 技能执行 cc98 account notifications。').map(item => item.command), ['cc98 account notifications'])
})

test('工作流里链到的别的文档都在', () => {
  for (const name of fs.readdirSync(flowsDir).filter(file => file.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(flowsDir, name), 'utf8')
    for (const [, target] of text.matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)) {
      assert.ok(fs.existsSync(path.join(flowsDir, target)), `flows/${name} 链到的 ${target} 不存在`)
    }
  }
})
