/**
 * 助手学到的技能：一件校园事务经过多步探索才走通之后，把最短的走法存成一个技能，下次遇到同类问题直接加载。
 * 一个技能是档案目录 skills/ 里的一个 Markdown 文件，开头的属性区是 name（引擎认的英文短名）、
 * title（给人看的名字）和 description（什么时候用），格式就是引擎的技能文件。
 * 存在档案目录而不是应用目录里：重装应用不会丢，用户在插件页看得到、删得掉。
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { load, dump, JSON_SCHEMA } from 'js-yaml'

/** 引擎只认这种名字：小写字母和数字，用短横线连起来。 */
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FRONT = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
const MAX = { name: 48, title: 40, description: 300, body: 20000 }

function field(value, label, limit) {
  const result = typeof value === 'string' ? value.replaceAll('\r\n', '\n').trim() : ''
  if (!result) throw new Error(`技能要有${label}`)
  if (result.length > limit) throw new Error(`${label}太长了，最多 ${limit} 个字`)
  return result
}

export class LearnedSkills {
  /** root 是档案目录；reserved 是应用自带技能的名字，学到的技能不能和它们重名。 */
  constructor(root, reserved = []) {
    this.dir = path.join(root, 'skills')
    this.reserved = new Set(reserved)
    /** 技能有增减时调用，让引擎重新读技能目录。 */
    this.onChange = () => {}
  }

  file(name) {
    if (typeof name !== 'string' || !NAME.test(name) || name.length > MAX.name) throw new Error('技能的 name 只能用小写字母、数字和短横线，如 course-withdrawal')
    return path.join(this.dir, `${name}.md`)
  }

  /** 读一个文件；不是技能文件（没有属性区、缺名字或说明）的不算。 */
  parse(file) {
    let raw
    try { raw = fs.readFileSync(file, 'utf8') } catch { return undefined }
    const match = raw.match(FRONT)
    if (!match) return undefined
    let meta
    try { meta = load(match[1], { schema: JSON_SCHEMA }) } catch { return undefined }
    const name = path.basename(file, '.md')
    if (!meta || typeof meta !== 'object' || meta.name !== name || typeof meta.description !== 'string' || !meta.description.trim()) return undefined
    return {
      name, title: typeof meta.title === 'string' && meta.title.trim() ? meta.title.trim() : name, description: meta.description.trim(),
      body: raw.slice(match[0].length).replaceAll('\r\n', '\n').replace(/^\n+/, ''), updatedAt: fs.statSync(file).mtime.toISOString(), path: file,
    }
  }

  /** 全部学到的技能，最近改动的在前。 */
  list() {
    if (!fs.existsSync(this.dir)) return []
    return fs.readdirSync(this.dir, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.md') && NAME.test(entry.name.slice(0, -3)))
      .flatMap(entry => this.parse(path.join(this.dir, entry.name)) ?? [])
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  read({ name } = {}) {
    const skill = this.parse(this.file(name))
    if (!skill) throw new Error('没有这个技能，请刷新')
    return skill
  }

  /** 新建，或整篇换掉同名的技能。 */
  save(input = {}) {
    const file = this.file(input.name)
    if (this.reserved.has(input.name)) throw new Error(`「${input.name}」是应用自带的技能，换一个名字`)
    const title = field(input.title, '名字', MAX.title), description = field(input.description, '说明', MAX.description).replace(/\s*\n\s*/g, ' ')
    const body = field(input.body, '正文', MAX.body)
    const raw = `---\n${dump({ name: input.name, title, description }, { schema: JSON_SCHEMA, lineWidth: -1 })}---\n${body}\n`
    fs.mkdirSync(this.dir, { recursive: true })
    const temp = `${file}.${randomUUID()}.tmp`
    try { fs.writeFileSync(temp, raw, { encoding: 'utf8', mode: 0o600 }); fs.renameSync(temp, file) }
    finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
    this.onChange()
    return this.read({ name: input.name })
  }

  /** 删除一个技能，只有人在插件页上能做。 */
  remove({ name } = {}) {
    const skill = this.read({ name })
    fs.unlinkSync(skill.path)
    this.onChange()
    return { name: skill.name }
  }
}
