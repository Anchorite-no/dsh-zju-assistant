/**
 * 对话后复盘：一次对话聊完，过一阵没有新的一轮，就回看一遍，把用户说到的稳定背景、偏好、目标和学习反馈整理进记忆，
 * 把照工作流办事时被用户纠正的一步补到工作流旁边（flow-notes.mjs）。对话里的助手不再顺手记记忆，都走这里。
 * 用户 2026-10-12 定的：要能不断长进，又不能攒一堆垃圾。做法参照 Hermes Agent（回答发出去以后另起一次复盘），
 * 力度反过来：默认不写，有信号才写。
 *
 * 分三步：把会话压成摘要（review-digest.mjs）→ 问模型一次，它只出建议（review-prompt.mjs）→ 这里一道道核对，过了的才落盘。
 * 模型的建议不能全信，离线试的时候它会：把助手讲的话写成用户懂了什么、误删没有矛盾的旧行、往依据里抄敏感的话。
 * 所以依据必须是用户原话里找得到的（依据本身不落盘），写下的每一行要和用户说过的话对得上，
 * 删除只认「还不熟」里挪到「学过」的一行，放宽确认的话一律不写，条数和长度都有上限。
 *
 * 存三处：
 *   档案目录的 review.json       要不要自动整理。没有这个文件就是要。
 *   档案目录的 review-log.json   每次落盘记一条：改了哪条、加了什么、改之前的全文。页面上「最近整理的」照它列，撤销靠它。
 *   缓存目录的 review.json       每个对话看到了哪，和最近几次跑的结果（没写成的原因也在里面，查问题时看）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { noteTitle } from './store.mjs'
import { digest as summarize } from './review-digest.mjs'
import { COURSE_SECTIONS, TYPES, parseProposal, systemPrompt, userPrompt } from './review-prompt.mjs'

/** 一轮结束后多久没有新的一轮就复盘。CAMPUS_REVIEW_IDLE_MS 只在验证时用，把等待调短。 */
const IDLE_MS = Number(process.env.CAMPUS_REVIEW_IDLE_MS) || 10 * 60_000
/** 一次对话最多几条记忆、几条工作流补充；一条记忆一次最多加几行；一行最多几个字；一条记忆的正文到多长就不再加。 */
const MAX = { memory: 2, flow: 1, add: 3, line: 160, body: 3000 }
/** 一行、一句依据最少几个字，再短说不清一件事；课程名最少几个字才拿去和已有的课对。 */
const MIN = { line: 4, signal: 4, course: 2 }
/** 写下的一行至少要和用户说过的话有几处两个字连着一样的；补工作流至少要有几次成功的、这个工作流里的命令。 */
const NEED = { shared: 3, commands: 2 }
/** 日志留多少条；记多少个对话看到了哪；留最近几次跑的结果。 */
const KEEP = { log: 60, sessions: 300, runs: 20 }
/** 新建一条时给的标签。 */
const TAGS = { 课程: '课程', 讲解偏好: '偏好', 目标与打算: '目标', 个人背景: '背景' }
/** 有人改过的记忆不动原文，只在末尾这个小标题下面加。 */
const HUMAN_SECTION = '助手补充'
/**
 * 放宽确认的话（「以后不用问我」「直接提交」）。要不要先问由应用的权限设置管，这种话不能经复盘变成记忆或者工作流的一步。
 * 宁可多拦：一条正经的补充里写了「直接提交」也不收。但只认「不要 / 不用……问」和「直接」加一件要先问的事这两种写法，
 *「先确认他的思路」「代码直接发完整的」「删之前别忘了先问他」这些正常的偏好不在里面。
 */
const LOOSEN = /(?:不用|无需|不必|不需要|不要|不再|别再|跳过|免去)[^，。；,;]{0,8}(?:确认|询问|问我|问他|问用户|征求|同意)|默认[^，。；,;]{0,6}同意|直接(?:提交|办理|报名|选课|退课|发帖|发布|交作业)/

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}
function writeJson(file, value) {
  const temp = `${file}.${randomUUID()}.tmp`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  try { fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 }); fs.renameSync(temp, file) }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
}

/** 比较时去掉空白：模型照抄原话时空格和换行不一定一样。 */
const squeeze = value => String(value ?? '').replace(/\s+/g, '')
const oneLine = value => String(value ?? '').replace(/\s+/g, ' ').trim()
/** 一行列表去掉前面的记号。 */
const bare = row => row.replace(/^\s*[-*+]\s+/, '').trim()
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase()
/** 一段话里两个字连着的全部组合（只算字、字母和数字），用来看两句话说的是不是一回事。 */
function pairs(value) {
  const text = String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''), found = new Set()
  for (let index = 0; index + 1 < text.length; index++) found.add(text.slice(index, index + 2))
  return found
}

/** 正文里某个小标题管的那几行：[标题行, 下一个标题行)；没有这个小标题就是 null。代码块里以 # 开头的行不算标题。 */
function sectionRange(rows, heading) {
  let fenced = false, at = -1, end = rows.length
  for (const [index, row] of rows.entries()) {
    if (/^\s*(```|~~~)/.test(row)) fenced = !fenced
    else if (!fenced && /^#{1,6}\s/.test(row)) {
      if (at >= 0) { end = index; break }
      if (row.trim() === `## ${heading}`) at = index
    }
  }
  return at < 0 ? null : [at, end]
}
/** 在某个小标题下面加几行；没有这个小标题就在末尾起一个。 */
export function addUnder(body, heading, lines) {
  const rows = body.trimEnd().split('\n'), range = sectionRange(rows, heading), items = lines.map(line => `- ${line}`)
  if (!range) return `${body.trimEnd()}${body.trim() ? '\n\n' : ''}## ${heading}\n${items.join('\n')}\n`
  let at = range[1]
  while (at > range[0] + 1 && !rows[at - 1].trim()) at--
  rows.splice(at, 0, ...items)
  return `${rows.join('\n')}\n`
}
/** 把某个小标题下面的一行去掉；原文对不上就不动（返回 null）。 */
export function removeUnder(body, heading, line) {
  const rows = body.split('\n'), range = sectionRange(rows, heading)
  if (!range) return null
  const at = rows.findIndex((row, index) => index > range[0] && index < range[1] && /^\s*[-*+]\s+/.test(row) && bare(row) === bare(line))
  if (at < 0) return null
  rows.splice(at, 1)
  return rows.join('\n')
}

/**
 * 模型说的课程名对上哪一条：先在已有的课程条目里找，再在这位学生上过的课（courses）里找。
 * 名字一样的直接认；一个包着另一个的（「微积分」对「微积分（甲）Ⅰ」）只有唯一一门时才认。
 * 返回 { note } 是已有的条目，{ title } 是可以新建、用这个正式的课名，{ why } 是认不出来。
 */
function findCourse(given, notes, courses) {
  const within = (a, b) => a.includes(b) || b.includes(a)
  const pick = (names) => {
    const exact = names.filter(name => sameName(name, given))
    if (exact.length) return exact
    return given.length >= MIN.course ? names.filter(name => within(name.toLowerCase(), given.toLowerCase())) : []
  }
  if (notes.some(note => sameName(note.title, given) && !note.tags.includes('课程'))) return { why: '这个标题已经是别的记忆了，不是课程' }
  const entries = notes.filter(note => note.tags.includes('课程')), mine = pick(entries.map(note => note.title))
  if (mine.length === 1) return { note: entries.find(note => note.title === mine[0]) }
  if (mine.length > 1) return { why: '有几门课的名字都像它，不知道是哪一门' }
  const known = pick([...new Set(courses)])
  if (known.length === 1) return { title: known[0] }
  return { why: known.length ? '有几门课的名字都像它，不知道是哪一门' : '不是他上过的课，没有新建' }
}

/**
 * 核对模型的建议，返回过了的和没过的（没过的只留是哪一条、为什么）。
 * notes 是全部记忆（含归档的），owned 判断一条是不是助手写下以后没人动过，summary 是这次对话的摘要（review-digest.mjs），
 * courses 是这位学生上过的课的名字，flows 是应用自带的工作流，undone 是以前被用户撤销过的行（按标题分）。
 */
export function vet(proposal, { notes, owned, summary, courses = [], flows = [], undone = new Map() }) {
  const said = summary.said.map(squeeze), talk = squeeze(summary.text), spoken = pairs(summary.said.join('\n'))
  const dropped = [], memory = new Map()
  const drop = (what, why) => { dropped.push({ what, why }) }
  // 依据要在用户原话里找得到。核对完依据就不用了，不落盘，也不进日志。
  const grounded = item => [].concat(item?.signal ?? []).filter(text => typeof text === 'string').map(squeeze).filter(text => text.length >= MIN.signal).some(text => said.some(line => line.includes(text)))
  // 写下的一行要和用户说过的话对得上：助手讲的内容、模型自己发挥的，和用户的话重合不了几个字。
  const echoes = (line) => { let count = 0; for (const pair of pairs(line)) if (spoken.has(pair) && ++count >= NEED.shared) return true; return false }

  for (const [index, item] of proposal.memory.entries()) {
    const type = TYPES.includes(item?.type) ? item.type : null, label = `记忆：${oneLine(item?.title) || item?.type || '（没有标题）'}`
    if (index >= MAX.memory) { drop(label, '一次对话最多两条'); continue }
    if (!type) { drop(label, '不是那四类里的'); continue }
    if (!grounded(item)) { drop(label, '依据不是用户说过的话'); continue }

    let title = oneLine(item.title), note
    if (type === '课程') {
      try { title = noteTitle(title) } catch { drop(label, '课程名不能当标题'); continue }
      const found = findCourse(title, notes, courses)
      if (found.why) { drop(label, found.why); continue }
      if (found.title && !talk.includes(squeeze(title))) { drop(label, '对话里没有提到这门课'); continue }
      note = found.note
      title = found.title ?? title
    } else {
      // 已有一条说同一类事、标题不一样的（比如「讲解方式偏好」），往那一条里加：模型给了它的标题就照标题找，
      // 没给就找标题是类别名的，再没有就找带这一类标签的。课程的条目不能拿来放别的。
      note = notes.find(other => title && sameName(other.title, title) && !other.tags.includes('课程'))
        ?? notes.find(other => sameName(other.title, type) && !other.tags.includes('课程'))
        ?? notes.find(other => !other.archived && other.tags.includes(TAGS[type]) && !other.tags.includes('课程'))
      title = type
    }
    if (note?.archived) { drop(label, '这一条已经归档了'); continue }
    if (note?.problem) { drop(label, '这一条的属性区有格式问题'); continue }
    title = note?.title ?? title

    const merged = memory.get(title) ?? { type, title, note: note ?? null, add: [], remove: [] }
    // 先定哪些行要删，再看要加的行是不是已经有了：他说「会了」的那一行可能和「还不熟」里的一字不差。
    const wanted = [].concat(item.add ?? []).map(entry => ({ under: type === '课程' ? oneLine(entry?.under) : '', line: oneLine(typeof entry === 'string' ? entry : entry?.line) }))
    for (const line of [].concat(item.remove ?? []).filter(text => typeof text === 'string')) {
      // 删除只认一种：这条是助手写的、没人改过；被删的是「还不熟」下面原样的一行；这一行同时出现在要加到「学过」的某一行里。
      const moved = wanted.some(entry => entry.under === '学过' && squeeze(entry.line).includes(squeeze(bare(line))))
      if (type !== '课程' || !note || !owned(note) || !moved || removeUnder(note.body, '还不熟', line) === null) { drop(label, '有一行没有删（只删「还不熟」里挪到「学过」的原样一行）'); continue }
      if (!merged.remove.some(other => bare(other) === bare(line))) merged.remove.push(line)
    }
    const after = merged.remove.reduce((body, line) => removeUnder(body, '还不熟', line) ?? body, note?.body ?? '')
    const existing = new Set(after.split('\n').map(row => squeeze(bare(row))))
    const refused = undone.get(title) ?? new Set()
    for (const { under, line } of wanted) {
      if (line.length < MIN.line || line.length > MAX.line) { drop(label, '有一行太短或太长'); continue }
      if (type === '课程' && !COURSE_SECTIONS.includes(under)) { drop(label, '没说加在「学过」还是「还不熟」下面'); continue }
      if (LOOSEN.test(squeeze(line))) { drop(label, '放宽确认的话不记'); continue }
      if (!echoes(line)) { drop(label, '有一行和用户说过的话对不上'); continue }
      if (refused.has(squeeze(line))) { drop(label, '这一行之前被撤销过'); continue }
      if (existing.has(squeeze(line)) || merged.add.some(other => squeeze(other.line) === squeeze(line))) continue
      if (merged.add.length >= MAX.add) { drop(label, `一次最多加 ${MAX.add} 行`); break }
      merged.add.push({ under, line })
    }
    memory.set(title, merged)
  }
  const accepted = []
  for (const item of memory.values()) {
    const label = `记忆：${item.title}`
    if (!item.add.length) { drop(label, '没有要加的内容'); continue }
    // 删掉的那一行要真的落到了「学过」里：对应的那一行没过核对的话，这一行也不删。
    item.remove = item.remove.filter(line => item.add.some(entry => entry.under === '学过' && squeeze(entry.line).includes(squeeze(bare(line)))))
    if ((item.note?.body.length ?? 0) + item.add.reduce((sum, entry) => sum + entry.line.length, 0) > MAX.body) { drop(label, '这一条已经很长了，没有再加'); continue }
    accepted.push(item)
  }

  const flow = []
  for (const [index, item] of proposal.flow.entries()) {
    const target = oneLine(item?.target), line = oneLine(item?.line), label = `工作流：${target || '（没有名字）'}`
    const found = flows.find(other => other.name === target)
    if (index >= MAX.flow) { drop(label, '一次对话最多一条'); continue }
    if (!found) { drop(label, '没有这个工作流'); continue }
    // 办成了，而且办的就是这个工作流管的事：成功的校园命令里，至少两条是工作流正文里出现过的那几种。
    if (summary.ran.filter(command => command.trim() && found.text.includes(command.trim().split(/\s+/).slice(0, 2).join(' '))).length < NEED.commands) { drop(label, '对话里没有照这个工作流办成的事'); continue }
    // 只收用户纠正出来的：要有用户的原话作依据，补的这一条要和用户说的对得上。
    if (!grounded(item)) { drop(label, '没有用户的原话作依据'); continue }
    if (!echoes(line)) { drop(label, '和用户说过的话对不上'); continue }
    if (LOOSEN.test(squeeze(line))) { drop(label, '放宽确认的话不记'); continue }
    flow.push({ target, line, source: oneLine(item?.source) })
  }
  return { memory: accepted, flow, dropped }
}

export class Review {
  /**
   * store 是档案的存储，flowNotes 是工作流的补充；ask 问模型一次（{ system, text } → 回答的文字）；
   * sessionOf 按编号取会话（引擎的 ctx.sessions.get）；courses 给出这位学生上过的课的名字。后面几项只在测试里换。
   */
  constructor({ store, flowNotes, ask, sessionOf = () => undefined, courses = () => [], settingsFile, logFile, stateFile, idleMs = IDLE_MS, setTimer = setTimeout, clearTimer = clearTimeout, now = () => new Date() }) {
    Object.assign(this, { store, flowNotes, ask, sessionOf, courses, settingsFile, logFile, stateFile, idleMs, setTimer, clearTimer, now })
    this.timers = new Map()
    this.retried = new Set()
    this.queue = Promise.resolve()
  }

  settings() { return { enabled: readJson(this.settingsFile, {})?.enabled !== false } }
  set(input = {}) {
    if (typeof input.enabled !== 'boolean') throw new Error('无效的设置')
    writeJson(this.settingsFile, { enabled: input.enabled })
    if (!input.enabled) this.stop()
    return this.snapshot()
  }
  entries() { const log = readJson(this.logFile, {})?.entries; return Array.isArray(log) ? log : [] }
  state() { const state = readJson(this.stateFile, {}); return { sessions: state?.sessions ?? {}, runs: Array.isArray(state?.runs) ? state.runs : [] } }

  /**
   * 存日志。记忆后来又被改过、或者已经不在了的，撤不回去了，改之前的全文也就不留了（fixed）：
   * 用户在记忆里删掉的内容，不该在这份日志里还留着一份。
   */
  writeLog(entries) {
    const shelf = this.store.memory, live = new Map()
    for (const entry of entries) if (entry.kind === 'memory' && !entry.undone && !entry.fixed) live.set(entry.title, [...(live.get(entry.title) ?? []), entry])
    for (const [title, chain] of live) {
      // 同一条记忆整理过几次的，从最近一次往回撤；现在的内容对得上最近一次，这一串就都还撤得回去。
      const now = shelf.find(title) ? shelf.note(title) : null
      if (now?.revision !== chain.at(-1).after) for (const entry of chain) { entry.fixed = true; delete entry.before }
    }
    writeJson(this.logFile, { entries: entries.slice(-KEEP.log) })
  }

  /** 页面要的：开关，和最近整理的（新的在前；改之前的全文不给页面）。 */
  snapshot() {
    return { ...this.settings(), idleMinutes: Math.max(1, Math.round(this.idleMs / 60_000)), entries: this.entries().map(({ before: _before, after: _after, ...entry }) => entry).reverse() }
  }

  /** 把核对过的建议落盘，每一处改动记一条日志。返回这次记下的几条和没过的。 */
  apply(proposal, { summary, session = '' }) {
    const shelf = this.store.memory
    // 用户撤销过的行不再写回来：同一个对话接着聊时，前面几轮他说的话还在，模型可能照样再提一遍。
    const undone = new Map()
    for (const entry of this.entries().filter(item => item.kind === 'memory' && item.undone)) {
      const lines = undone.get(entry.title) ?? new Set()
      for (const line of entry.added) lines.add(squeeze(line.replace(new RegExp(`^(?:${COURSE_SECTIONS.join('|')})：`), '')))
      undone.set(entry.title, lines)
    }
    const { memory, flow, dropped } = vet(proposal, { notes: shelf.list().notes, owned: note => shelf.owned(note), summary, courses: this.courses(), flows: this.flowNotes.flows(), undone })
    const base = { at: this.now().toISOString(), session, about: summary.title || '' }
    const written = []
    for (const item of memory) {
      try { written.push({ id: randomUUID().slice(0, 8), ...base, ...this.writeMemory(item) }) }
      catch (error) { dropped.push({ what: `记忆：${item.title}`, why: error.message }) }
    }
    for (const item of flow) {
      try {
        const note = this.flowNotes.add({ flow: item.target, text: item.line, source: item.source, session })
        written.push({ id: randomUUID().slice(0, 8), ...base, kind: 'flow', flow: note.flow, title: this.flowNotes.flows().find(other => other.name === note.flow)?.title ?? note.flow, noteId: note.id, added: [note.text], removed: [] })
      } catch (error) { dropped.push({ what: `工作流：${item.target}`, why: error.message }) }
    }
    if (written.length) this.writeLog([...this.entries(), ...written])
    return { written, dropped }
  }

  /** 写一条记忆：没有就新建；助手写的、没人动过的，改在对应的小标题下面；有人改过的只在末尾补。 */
  writeMemory({ type, title, note, add, remove }) {
    const shelf = this.store.memory
    const shown = add.map(entry => entry.under ? `${entry.under}：${entry.line}` : entry.line)
    if (!note) {
      const body = type === '课程'
        ? COURSE_SECTIONS.filter(heading => add.some(entry => entry.under === heading)).map(heading => `## ${heading}\n${add.filter(entry => entry.under === heading).map(entry => `- ${entry.line}`).join('\n')}`).join('\n\n')
        : add.map(entry => `- ${entry.line}`).join('\n')
      const saved = shelf.saveByAssistant({ title, body, tags: [TAGS[type]], properties: { 来源: '本人说的' } })
      return { kind: 'memory', type, title: saved.title, created: true, owned: true, added: shown, removed: [], before: null, after: saved.revision }
    }
    const owned = shelf.owned(note), removed = []
    let saved
    if (owned) {
      let body = note.body
      for (const line of remove) { const next = removeUnder(body, '还不熟', line); if (next !== null) { body = next; removed.push(bare(line)) } }
      if (type === '课程') {
        for (const heading of COURSE_SECTIONS) { const lines = add.filter(entry => entry.under === heading).map(entry => entry.line); if (lines.length) body = addUnder(body, heading, lines) }
      } else {
        const last = body.trimEnd().split('\n').at(-1) ?? ''
        body = `${body.trimEnd()}${/^\s*[-*+]\s+/.test(last) || !body.trim() ? '\n' : '\n\n'}${add.map(entry => `- ${entry.line}`).join('\n')}\n`
      }
      saved = shelf.saveByAssistant({ title: note.title, body, revision: note.revision })
    } else {
      const last = [...note.body.matchAll(/^##\s+(.+)$/gm)].at(-1)?.[1].trim()
      const block = `${last === HUMAN_SECTION ? '' : `## ${HUMAN_SECTION}\n`}${shown.map(line => `- ${line}`).join('\n')}`
      saved = shelf.saveByAssistant({ title: note.title, body: block, append: true, revision: note.revision })
    }
    return { kind: 'memory', type, title: saved.title, created: false, owned, added: shown, removed, before: note.raw, after: saved.revision }
  }

  /** 撤销一次整理。之后又被改过的记忆不撤，免得把后来的改动一起冲掉。 */
  undo({ id } = {}) {
    const entries = this.entries(), entry = entries.find(item => item.id === id)
    if (!entry) throw new Error('没有这条整理记录，请刷新')
    if (entry.undone) throw new Error('这一条已经撤销过了')
    if (entry.kind === 'flow') {
      try { this.flowNotes.remove({ id: entry.noteId }) } catch { /* 已经被删掉的也算撤了 */ }
    } else {
      const shelf = this.store.memory
      if (!shelf.find(entry.title)) throw new Error('这条记忆已经不在了')
      const note = shelf.note(entry.title)
      if (entry.fixed || note.revision !== entry.after) throw new Error('这条记忆后来又改过，撤不回去了。请直接在记忆里改。')
      if (entry.created) shelf.remove({ title: note.title, revision: note.revision })
      else shelf.restore({ title: note.title, revision: note.revision, raw: entry.before, owned: entry.owned })
    }
    entry.undone = true
    delete entry.before
    this.writeLog(entries)
    return this.snapshot()
  }

  /** 复盘一个对话。没有新的一轮就什么都不做；模型问不成时不记「看到了哪」，下次接着看。 */
  async run(id) {
    if (!this.settings().enabled) return null
    const session = this.sessionOf(id)
    if (!session) return null
    const state = this.state(), since = state.sessions[id]?.seq ?? -1
    const summary = summarize(session.snapshotEvents(), { since })
    if (!summary.fresh) return null
    const run = { at: this.now().toISOString(), session: id, about: summary.title }
    try {
      const notes = this.store.memory.list().notes.filter(note => !note.archived && !note.problem)
      const answer = await this.ask({ system: systemPrompt({ flows: this.flowNotes.flows(), notes: this.flowNotes.list() }), text: userPrompt({ memories: notes, digest: summary.text }) })
      const { written, dropped } = this.apply(parseProposal(answer), { summary, session: id })
      Object.assign(run, { wrote: written.length, dropped })
      const sessions = { ...this.state().sessions, [id]: { seq: summary.lastSeq, at: run.at } }
      const kept = Object.fromEntries(Object.entries(sessions).sort((a, b) => String(b[1].at).localeCompare(String(a[1].at))).slice(0, KEEP.sessions))
      writeJson(this.stateFile, { sessions: kept, runs: [...this.state().runs, run].slice(-KEEP.runs) })
      this.retried.delete(id)
      return run
    } catch (error) {
      run.error = error.message
      writeJson(this.stateFile, { sessions: this.state().sessions, runs: [...this.state().runs, run].slice(-KEEP.runs) })
      // 多半是网络断了一下：再等一轮试一次，还不成就等这个对话下次有动静。
      if (!this.retried.has(id)) { this.retried.add(id); this.schedule(id) }
      return run
    }
  }

  /** 一轮结束了：开始计时，到点没有新的一轮就复盘。子智能体的会话不看。 */
  schedule(id, header) {
    if (!this.settings().enabled || header?.parentSession || header?.delegationDepth > 0) return
    this.cancel(id)
    const timer = this.setTimer(() => {
      this.timers.delete(id)
      // 一次只跑一个，免得几个对话同时到点一起问模型、一起写档案。
      this.queue = this.queue.then(() => this.run(id)).catch(() => {})
    }, this.idleMs)
    timer?.unref?.()
    this.timers.set(id, timer)
  }
  cancel(id) {
    if (!this.timers.has(id)) return
    this.clearTimer(this.timers.get(id))
    this.timers.delete(id)
  }
  stop() { for (const id of [...this.timers.keys()]) this.cancel(id) }

  /** 听引擎的会话事件。返回停下来的办法。 */
  watch(ctx) {
    this.sessionOf = id => ctx.get?.('sessions')?.get(id)
    const off = ctx.on('session/event', (session, event) => {
      if (event?.type === 'turn/start') { this.retried.delete(session.id); this.cancel(session.id) } else if (event?.type === 'turn/end') this.schedule(session.id, session.header)
    })
    return () => { off?.(); this.stop() }
  }
}
