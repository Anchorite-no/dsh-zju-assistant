import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { CORE_ROOT } from './skills.mjs'
import { FlowNotes, docs } from './flow-notes.mjs'
import { SECTIONS } from './learned.mjs'

const flowsDir = path.join(CORE_ROOT, 'skills')
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

/** 一个自带技能（正文连同 references/、templates/）至少这么多字：命令清单写不到这么长，要写判断和分支。 */
const MIN_CHARS = 5000
const skills = new FlowNotes({ file: path.join(flowsDir, 'no-notes.json'), flowsDir }).flows()
/** 一个技能文件夹里的全部 Markdown：正文和 references/、templates/ 下的各篇。 */
const files = skill => [skill.file, ...docs(skill.dir)]
const read = file => fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n')
/** 一节的正文：从这个二级标题到下一个二级标题。 */
const section = (text, name) => text.split(/^## /m).find(part => part.startsWith(`${name}\n`)) ?? ''
/** 正文里提到 zju 的技能要用校园命令。 */
const usesZju = skill => /\bzju\b/.test(skill.text)
/** 去掉代码块和反引号里的内容：那里的链接是示例。 */
const prose = text => text.replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '')

test('自带技能是一个个文件夹，结构照 core/skills/README.md', async (t) => {
  assert.ok(skills.length >= 6)
  const index = read(path.join(flowsDir, 'README.md')), zju = read(path.join(CORE_ROOT, 'zju', 'SKILL.md'))
  for (const skill of skills) await t.test(skill.name, () => {
    assert.match(skill.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    assert.ok(!skill.parent, '子步骤放进所属技能的 references/，不再单独一个文件夹')
    assert.ok(read(skill.file).startsWith('---\n') && read(skill.file).split('\n---')[0].split('\n').includes(`name: ${skill.name}`), '属性区的 name 要和文件夹同名')
    assert.ok(skill.label && skill.label.length <= 12, '名字太长')
    assert.ok(skill.description, '要说明什么时候用')
    assert.ok(skill.text.startsWith('# '), '正文从大标题开始')
    // 用 ok 不用 match：没过时不把整篇正文打出来。
    const headings = new Set(skill.text.split('\n').filter(line => line.startsWith('## ')).map(line => line.slice(3).trim()))
    for (const name of SECTIONS) assert.ok(headings.has(name), `缺「${name}」一节`)
    assert.ok(/campus_profile_read|campus_context_read/.test(section(skill.text, '开始前')), '「开始前」要读这个人的档案或记忆')
    const chars = files(skill).reduce((sum, file) => sum + read(file).length, 0)
    assert.ok(chars >= MIN_CHARS, `连同参考文档只有 ${chars} 个字，至少 ${MIN_CHARS}`)
    for (const file of files(skill)) assert.match(path.relative(flowsDir, file), /^[\x20-\x7e]+$/, '文件名用英文（安装程序写不了带中文的名字）')
    assert.ok(index.includes(`(${skill.name}/SKILL.md)`), 'core/skills/README.md 的表里没有它')
    if (usesZju(skill)) assert.ok(zju.includes(`[${skill.label}](../skills/${skill.name}/SKILL.md)`), 'zju 的 SKILL.md 末尾没列它')
  })
})

test('技能和定时任务的说明里写到的命令，core 里都真有，参数也对得上', async (t) => {
  let total = 0
  for (const skill of skills) await t.test(skill.name, () => {
    const used = files(skill).flatMap(file => check(path.relative(flowsDir, file), read(file)))
    if (usesZju(skill)) assert.ok(used.length >= 3, '用到 zju 的技能至少写到三条命令')
    total += used.length
  })
  total += check('references/schedule.md', read(path.join(CORE_ROOT, 'zju', 'references', 'schedule.md'))).length
  assert.ok(total >= 40)
  // 这个检查自己认得出错的：不存在的动作、不存在的参数。
  assert.throws(() => check('x', '先 `zdbk selection sections --course 课程名 --nope 1`'), /没有 --nope 这个参数/)
  assert.throws(() => check('x', '执行 zdbk selection 看一下'), /后面还要接一个动作/)
  assert.deepEqual(mentions('用 zju 技能执行 cc98 account notifications。').map(item => item.command), ['cc98 account notifications'])
})

test('技能里链到的别的文档都在', async (t) => {
  for (const skill of skills) await t.test(skill.name, () => {
    for (const file of files(skill)) {
      for (const [, target] of prose(read(file)).matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)) {
        if (/^[a-z][a-z\d+.-]*:/i.test(target)) continue
        assert.ok(fs.existsSync(path.resolve(path.dirname(file), decodeURIComponent(target))), `${path.relative(flowsDir, file)} 链到的 ${target} 不存在`)
      }
    }
  })
})
