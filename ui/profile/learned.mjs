/**
 * 助手写的技能：一件校园事务多步探索才走通、或者用户说「把这套存成技能」以后，照 core/skills/skill-writer 写下来，下次遇到同类问题直接加载。
 * 一个技能是档案目录 skills/ 下的一个文件夹：SKILL.md 是正文，开头的属性区是 name（引擎认的英文短名）、
 * title（给人看的名字）和 description（什么时候用），格式就是引擎的技能文件；references/ 下是正文链到的参考文档。
 * 正文的结构和应用自带的技能一样（core/skills/README.md），六节缺一节存不进去。
 * 早先存下的是 skills/<name>.md 一个文件，照旧能读、能删；再存一次就换成文件夹。
 * 存在档案目录而不是应用目录里：重装应用不会丢，用户在插件页看得到、删得掉。
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { load, dump, JSON_SCHEMA } from 'js-yaml'

/** 引擎只认这种名字：小写字母和数字，用短横线连起来。 */
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** 参考文档的文件名：英文短名加 .md。 */
const DOC = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
const FRONT = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
const MAX = { name: 48, title: 40, description: 300, body: 20000, references: 8 }
/** 技能正文里必须有的六节，和应用自带的技能一样（core/skills/README.md）。 */
export const SECTIONS = ['什么时候用', '开始前', '步骤', '交付', '做完以后', '出错和边界']

function field(value, label, limit) {
  const result = typeof value === 'string' ? value.replaceAll('\r\n', '\n').trim() : ''
  if (!result) throw new Error(`技能要有${label}`)
  if (result.length > limit) throw new Error(`${label}太长了，最多 ${limit} 个字`)
  return result
}

/** 写一个文件：先写到旁边的临时文件再换过去，写到一半不会留下半个文件。 */
function write(file, text) {
  const temp = `${file}.${randomUUID()}.tmp`
  try { fs.writeFileSync(temp, text, { encoding: 'utf8', mode: 0o600 }); fs.renameSync(temp, file) }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
}

/** 正文过不过得了：六节都在，链到的参考文档都给了，给了的参考文档都被正文链到。 */
function vet(body, references) {
  if (FRONT.test(body)) throw new Error('正文不要带属性区，name、title、description 分开给')
  const missing = SECTIONS.filter(name => !new RegExp(`^## ${name}\\s*$`, 'm').test(body))
  if (missing.length) throw new Error(`正文缺这几节：${missing.map(name => `「## ${name}」`).join('、')}。结构照 core/skills/README.md，每节写不出东西也写一句为什么`)
  const linked = new Set([...body.matchAll(/\]\(references\/([^)#\s]+)(?:#[^)]*)?\)/g)].map(match => match[1]))
  for (const name of linked) if (!references.has(name)) throw new Error(`正文链到的 references/${name} 没有给出来`)
  for (const name of references.keys()) if (!linked.has(name)) throw new Error(`references/${name} 正文里没有链到，用 [说明](references/${name}) 指过去`)
}

export class LearnedSkills {
  /** root 是档案目录；reserved 是应用自带技能的名字，学到的技能不能和它们重名。 */
  constructor(root, reserved = []) {
    this.dir = path.join(root, 'skills')
    this.reserved = new Set(reserved)
    /** 技能有增减时调用，让引擎重新读技能目录。 */
    this.onChange = () => {}
  }

  check(name) {
    if (typeof name !== 'string' || !NAME.test(name) || name.length > MAX.name) throw new Error('技能的 name 只能用小写字母、数字和短横线，如 course-withdrawal')
    return name
  }
  /** 一个技能的文件：文件夹里的 SKILL.md；早先存下的单个文件也认。 */
  file(name) {
    this.check(name)
    const folder = path.join(this.dir, name, 'SKILL.md'), single = path.join(this.dir, `${name}.md`)
    return !fs.existsSync(folder) && fs.existsSync(single) ? single : folder
  }

  /** 读一个技能；不是技能文件（没有属性区、缺名字或说明）的不算。root 是它的参考文档相对的那个文件夹。 */
  parse(file) {
    let raw
    try { raw = fs.readFileSync(file, 'utf8') } catch { return undefined }
    const match = raw.match(FRONT)
    if (!match) return undefined
    let meta
    try { meta = load(match[1], { schema: JSON_SCHEMA }) } catch { return undefined }
    const folder = path.basename(file) === 'SKILL.md', name = folder ? path.basename(path.dirname(file)) : path.basename(file, '.md')
    if (!meta || typeof meta !== 'object' || meta.name !== name || typeof meta.description !== 'string' || !meta.description.trim()) return undefined
    let references = []
    if (folder) try { references = fs.readdirSync(path.join(path.dirname(file), 'references')).filter(item => DOC.test(item)).sort() } catch {}
    return {
      name, title: typeof meta.title === 'string' && meta.title.trim() ? meta.title.trim() : name, description: meta.description.trim(),
      body: raw.slice(match[0].length).replaceAll('\r\n', '\n').replace(/^\n+/, ''), updatedAt: fs.statSync(file).mtime.toISOString(), path: file,
      root: folder ? path.dirname(file) : this.dir, references: references.map(item => `references/${item}`),
    }
  }

  /** 全部学到的技能，最近改动的在前。同名的文件夹和单个文件只算文件夹那一份。 */
  list() {
    if (!fs.existsSync(this.dir)) return []
    const entries = fs.readdirSync(this.dir, { withFileTypes: true })
    const folders = entries.filter(entry => entry.isDirectory() && NAME.test(entry.name)).map(entry => entry.name)
    const singles = entries.filter(entry => entry.isFile() && entry.name.endsWith('.md') && NAME.test(entry.name.slice(0, -3)) && !folders.includes(entry.name.slice(0, -3))).map(entry => entry.name)
    return [...folders.map(name => path.join(this.dir, name, 'SKILL.md')), ...singles.map(name => path.join(this.dir, name))]
      .flatMap(file => this.parse(file) ?? [])
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  read({ name } = {}) {
    const skill = this.parse(this.file(name))
    if (!skill) throw new Error('没有这个技能，请刷新')
    return skill
  }

  /**
   * 新建，或整篇换掉同名的技能（连同参考文档：这次没给的旧参考文档会删掉）。
   * references 是 [{ name: 'rules.md', body }]，正文里用 [说明](references/rules.md) 链过去。
   */
  save(input = {}) {
    const name = this.check(input.name)
    if (this.reserved.has(name)) throw new Error(`「${name}」是应用自带的技能，换一个名字`)
    const title = field(input.title, '名字', MAX.title), description = field(input.description, '说明', MAX.description).replace(/\s*\n\s*/g, ' ')
    const body = field(input.body, '正文', MAX.body)
    const list = input.references ?? []
    if (!Array.isArray(list)) throw new Error('references 是一组 { name, body }')
    if (list.length > MAX.references) throw new Error(`参考文档最多 ${MAX.references} 篇`)
    const references = new Map()
    for (const item of list) {
      const file = typeof item?.name === 'string' ? item.name.replace(/^references\//, '') : ''
      if (!DOC.test(file)) throw new Error(`参考文档的名字「${item?.name ?? ''}」要是英文短名加 .md，如 rules.md`)
      if (references.has(file)) throw new Error(`参考文档 ${file} 给了两次`)
      references.set(file, field(item.body, `参考文档 ${file} 的正文`, MAX.body))
    }
    vet(body, references)
    const folder = path.join(this.dir, name), docs = path.join(folder, 'references')
    fs.mkdirSync(docs, { recursive: true })
    for (const [file, text] of references) write(path.join(docs, file), `${text}\n`)
    for (const file of fs.readdirSync(docs)) if (!references.has(file)) fs.rmSync(path.join(docs, file), { force: true })
    write(path.join(folder, 'SKILL.md'), `---\n${dump({ name, title, description }, { schema: JSON_SCHEMA, lineWidth: -1 })}---\n${body}\n`)
    // 早先存成单个文件的，换成文件夹以后把旧的那份拿掉。
    fs.rmSync(path.join(this.dir, `${name}.md`), { force: true })
    this.onChange()
    return this.read({ name })
  }

  /** 删除一个技能（连同它的参考文档），只有人在插件页上能做。 */
  remove({ name } = {}) {
    const skill = this.read({ name })
    if (path.basename(skill.path) === 'SKILL.md') fs.rmSync(path.dirname(skill.path), { recursive: true, force: true })
    else fs.unlinkSync(skill.path)
    this.onChange()
    return { name: skill.name }
  }
}
