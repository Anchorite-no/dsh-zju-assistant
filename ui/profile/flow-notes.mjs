/**
 * 工作流的补充：助手照 core/zju/flows/ 里的工作流办事时学到、正文里没有的那一条（比如被用户纠正了的一步）。
 * 工作流在应用的安装目录里，升级就换掉，使用中不能改；补充存在档案目录的 flow-notes.json，
 * 拼在 zju 技能正文的末尾交给引擎（skills.mjs），助手加载 zju 时就看到。
 * 谁来写：对话后的复盘（review.mjs）。用户在插件页「技能」一组里能看、能删。
 *
 * 每条补充记着写下它时工作流文件的指纹。应用升级后正文变了，这条就标成「待核对」：
 * 可能已经被写进正文了，也可能不再成立。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

/** 一个工作流最多留几条补充；一条最少、最多几个字；出处最多几个字。 */
const MAX_NOTES = 8, MIN_TEXT = 8, MAX_TEXT = 300, MAX_SOURCE = 200

/** 插件页「技能」一组里，一个有补充的工作流算一项，名字前面带这个，和助手存下的技能分开。 */
const GROUP = 'flow:'
export const isFlowGroup = name => typeof name === 'string' && name.startsWith(GROUP)

/** 一条补充写成一行：后面括号里是出处。 */
const bullet = note => `- ${note.text}${note.source && !note.text.includes(note.source) ? `（${/^https?:/.test(note.source) ? `来源：${note.source}` : note.source}）` : ''}`
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16)
/** 比两条是不是一回事时用：去掉空白和标点。 */
const plain = value => String(value).replace(/[\s\p{P}\p{S}]+/gu, '').toLowerCase()

export class FlowNotes {
  /** file 是存补充的文件；flowsDir 是应用自带的工作流所在的文件夹。 */
  constructor({ file, flowsDir }) {
    this.file = file
    this.flowsDir = flowsDir
    /** 补充有增减时调用，让引擎重新读技能。 */
    this.onChange = () => {}
  }

  /** 应用自带的工作流：名字（文件名）、标题、全文、指纹。README 不算。 */
  flows() {
    let names = []
    try { names = fs.readdirSync(this.flowsDir) } catch { return [] }
    return names.filter(name => name.endsWith('.md') && name.toLowerCase() !== 'readme.md').sort().map((name) => {
      const text = fs.readFileSync(path.join(this.flowsDir, name), 'utf8').replaceAll('\r\n', '\n').trim()
      return { name: name.slice(0, -3), title: /^#\s+(.+)$/m.exec(text)?.[1].trim() ?? name.slice(0, -3), text, hash: hash(text) }
    })
  }

  stored() {
    try { const notes = JSON.parse(fs.readFileSync(this.file, 'utf8')).notes; return Array.isArray(notes) ? notes : [] } catch { return [] }
  }
  write(notes) {
    const temp = `${this.file}.${randomUUID()}.tmp`
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    try { fs.writeFileSync(temp, `${JSON.stringify({ notes }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); fs.renameSync(temp, this.file) }
    finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
    this.onChange()
  }

  /** 全部补充，新的在前。工作流已经不在了的不列；stale 是正文在这条写下之后变过。 */
  list() {
    const flows = new Map(this.flows().map(flow => [flow.name, flow]))
    return this.stored().filter(note => flows.has(note.flow))
      .map(note => ({ ...note, flowTitle: flows.get(note.flow).title, stale: note.flowHash !== flows.get(note.flow).hash }))
      .sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)))
  }

  /** 补一条。过不了下面这几道的抛错，原因写在错误里。 */
  add({ flow, text, source = '', session = '' } = {}) {
    const target = this.flows().find(item => item.name === flow)
    if (!target) throw new Error(`没有「${flow}」这个工作流`)
    const line = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
    if (line.length < MIN_TEXT) throw new Error('补充太短了')
    if (line.length > MAX_TEXT) throw new Error(`补充太长了，最多 ${MAX_TEXT} 个字`)
    const notes = this.stored(), mine = notes.filter(note => note.flow === flow), key = plain(line)
    if (mine.some((note) => { const other = plain(note.text); return other.includes(key) || key.includes(other) })) throw new Error('已经有一条说的是同一件事')
    if (plain(target.text).includes(key)) throw new Error('工作流正文里已经有了')
    if (mine.length >= MAX_NOTES) throw new Error(`这个工作流的补充已经有 ${MAX_NOTES} 条了，先整理再加`)
    const note = { id: randomUUID().slice(0, 8), flow, text: line, source: String(source ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_SOURCE), addedAt: new Date().toISOString(), flowHash: target.hash, ...(session ? { session } : {}) }
    this.write([...notes, note])
    return note
  }

  /** 去掉一条：用户在页面上删，或者撤销一次整理。 */
  remove({ id } = {}) {
    const notes = this.stored()
    if (!notes.some(note => note.id === id)) throw new Error('没有这条补充，请刷新')
    this.write(notes.filter(note => note.id !== id))
    return { id }
  }

  /** 给插件页「技能」一组用：有补充的工作流各算一项，正文是它的那几条。 */
  groups() {
    const groups = new Map()
    for (const note of this.list()) groups.set(note.flow, [...(groups.get(note.flow) ?? []), note])
    return [...groups].map(([flow, notes]) => ({
      name: `${GROUP}${flow}`, title: `${notes[0].flowTitle}的补充`,
      description: `照这个工作流办事时补进来的 ${notes.length} 条，助手加载 zju 技能时一起看到。${notes.some(note => note.stale) ? '工作流在这之后更新过，这几条待核对。' : ''}`,
      updatedAt: notes[0].addedAt,
      body: `${[...notes].reverse().map(bullet).join('\n')}\n`,
    }))
  }
  group({ name } = {}) {
    const group = this.groups().find(item => item.name === name)
    if (!group) throw new Error('没有这个技能，请刷新')
    return group
  }
  /** 在插件页上删掉一个工作流的全部补充。单条的在「个人档案」里撤销。 */
  removeGroup({ name } = {}) {
    this.group({ name })
    this.write(this.stored().filter(note => `${GROUP}${note.flow}` !== name))
    return { name }
  }

  /** 拼在 zju 技能正文末尾的那一段；没有补充时是空的。 */
  section() {
    const notes = this.list()
    if (!notes.length) return ''
    const groups = new Map()
    for (const note of [...notes].reverse()) groups.set(note.flow, [...(groups.get(note.flow) ?? []), note])
    const parts = [...groups].map(([flow, items]) => [
      `### ${items[0].flowTitle}（flows/${flow}.md）${items.some(item => item.stale) ? '：工作流在这些补充之后更新过，先对照正文' : ''}`,
      ...items.map(bullet),
    ].join('\n'))
    return `\n\n## 工作流的补充\n\n下面几条是使用中补进来的，不在工作流的文件里。走到对应的工作流时一并照做；正文已经写了的，以正文为准。\n\n${parts.join('\n\n')}\n`
  }
}
