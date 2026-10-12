/**
 * 把会话里的一次工具调用翻成给人看的话：去了哪个网站、做了什么、针对什么，以及结果怎么样。
 * 会话日志里的校园命令是「pwsh + 一整条命令」，这里从命令里认出 zju.ts 后面的「模块 对象 动作」。
 * 只做字符串和 JSON 的解析，不碰界面和引擎，parse.test.mjs 直接跑。
 */
import { COMMANDS } from './commands.gen.ts'
import { MODULE_SITES } from './sites.ts'
import { stepName } from './steps.ts'

/** campus 是校园命令，web 是联网搜索和打开网页，other 是读写文件、跑脚本这些本地操作。 */
export type ActionKind = 'campus' | 'web' | 'other'

/**
 * 结果是哪一种写法，决定怎么看这一步成没成（outcomeOf）：
 * envelope 是校园命令输出的 JSON 信封，shell 是别的命令行的输出，tool 是引擎自带工具的结果。
 */
export type OutputForm = 'envelope' | 'shell' | 'tool'

export interface Action {
  kind: ActionKind
  output: OutputForm
  /** 网站的名字；本地操作没有。 */
  site?: string
  /** 做了什么。 */
  label: string
  /** 针对什么：关键词、课程名、文件名。 */
  about?: string
  /** 会改动东西的操作（报名、提交、预约）。 */
  write?: boolean
  /** 同一个网站上的同一种动作用同一个键，连着的几次合成一行。 */
  key: string
  /** 原样的命令或参数，给想看的人看。 */
  command: string
  /** 能直接打开的网址，只有命令里带了才有。 */
  link?: string
}

export interface Outcome {
  ok: boolean
  /** 结果里有几条；数不出来就没有。 */
  count?: number
  /** 前几条的标题。 */
  titles?: string[]
  /** 用的是本地缓存，没有访问网站。 */
  cached?: boolean
  /** 没成功时的原因。 */
  error?: string
}

/** 这些参数是翻页、数量、开关一类，不说明「针对什么」。 */
const QUIET_FLAGS = new Set([
  'limit', 'page', 'pages', 'size', 'sort', 'order', 'quality', 'interval', 'duration', 'timeout',
  'out', 'output', 'dir', 'format', 'at', 'fresh', 'confirm', 'cancel', 'all', 'help',
])

const SHELL_TOOLS = new Set(['pwsh', 'bash', 'shell', 'powershell', 'sh'])

/** 引擎自带工具的说法；about 取哪个参数。 */
const LOCAL_TOOLS: Record<string, { label: string, about?: string }> = {
  read: { label: '读取文件', about: 'file_path' },
  read_image: { label: '查看图片', about: 'file_path' },
  write: { label: '写入文件', about: 'file_path' },
  edit: { label: '修改文件', about: 'file_path' },
  str_replace_editor: { label: '修改文件', about: 'path' },
  grep: { label: '在文件里查找', about: 'pattern' },
  glob: { label: '查找文件', about: 'pattern' },
  skill: { label: '读取使用说明', about: 'name' },
  todo_write: { label: '更新待办' },
  ask_user_question: { label: '向你提问' },
  subagent: { label: '分派子任务', about: 'description' },
  present: { label: '交付文件' },
  campus_profile_read: { label: '读取个人档案' },
  campus_profile_write: { label: '更新记忆', about: 'title' },
  campus_note_read: { label: '读取备忘录' },
  campus_note_write: { label: '写入备忘录', about: 'title' },
  campus_skill_save: { label: '保存技能', about: 'title' },
  campus_notify: { label: '在托盘上提醒', about: 'title' },
}

function shorten(text: string, max = 40): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function baseName(path: string): string {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path
}

function hostOf(url: string): string | undefined {
  try { return new URL(url).hostname } catch { return undefined }
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text) } catch { return undefined }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 按 shell 的写法把一整条命令切成词：认单引号、双引号；换行、管道、分号、重定向、括号处断成一段，
 * 用 null 隔开。只用来找 zju.ts 的那次调用，不求和 PowerShell 完全一致。
 */
function shellTokens(text: string): (string | null)[] {
  const tokens: (string | null)[] = []
  let word = '', quote = '', started = false
  const push = () => { if (started) tokens.push(word); word = ''; started = false }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quote) {
      if (ch === quote) quote = ''
      else if (ch === '`' && quote === '"' && i + 1 < text.length) word += text[++i]
      else word += ch
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; started = true; continue }
    if (ch === '\n' || ch === '|' || ch === ';' || ch === '&' || ch === '(' || ch === ')' || ch === '{' || ch === '}') { push(); tokens.push(null); continue }
    // 「2>&1」「2>$null」「> 文件」：前面单独的数字是重定向的一部分，丢掉。
    if (ch === '>') { if (/^\d$/.test(word)) { word = ''; started = false } push(); tokens.push(null); continue }
    if (/\s/.test(ch)) { push(); continue }
    word += ch
    started = true
  }
  push()
  return tokens
}

/** 第一段的词：到管道、分号、重定向为止。 */
export function shellWords(text: string): string[] {
  const tokens = shellTokens(text), end = tokens.indexOf(null)
  return (end < 0 ? tokens : tokens.slice(0, end)) as string[]
}

const MODULES = new Set(Object.keys(COMMANDS).map(path => path.split(' ')[0]!))

/**
 * 命令里调用 zju.ts 的那一次，从模块名起的词；不是校园命令就没有。
 * 模块名前面那个词得是脚本本身（以 zju.ts 结尾），或者一个变量：模型有时先把脚本路径存进变量，再在循环里调用。
 */
function zjuWords(command: string): string[] | undefined {
  if (!command.includes('zju.ts')) return undefined
  const tokens = shellTokens(command)
  for (let i = 1; i < tokens.length; i++) {
    const word = tokens[i], before = tokens[i - 1]
    if (typeof word !== 'string' || typeof before !== 'string') continue
    if (!before.endsWith('zju.ts') && !before.startsWith('$')) continue
    if (!MODULES.has(word) && !before.endsWith('zju.ts')) continue
    const end = tokens.indexOf(null, i)
    return tokens.slice(i, end < 0 ? undefined : end) as string[]
  }
  return undefined
}

/** 「--名 值」读成对照表；后面不跟值的是开关。和 core/zju/lib/core/cli.ts 的 parseArgv 一个读法。 */
function readFlags(words: string[]): Record<string, string | true> {
  const flags: Record<string, string | true> = {}
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!
    if (!word.startsWith('--')) continue
    const eq = word.indexOf('=')
    if (eq > 2) flags[word.slice(2, eq)] = word.slice(eq + 1)
    else if (words[i + 1] !== undefined && !words[i + 1]!.startsWith('--')) flags[word.slice(2)] = words[++i]!
    else flags[word.slice(2)] = true
  }
  return flags
}

function campusAction(words: string[], command: string): Action {
  const module = words[0] ?? ''
  // 不访问网站的模块（读文档、看本地档案）不在 MODULE_SITES 里，算本地操作。
  const site = MODULE_SITES[module]
  const path: string[] = []
  for (const word of words.slice(1)) { if (word.startsWith('-')) break; path.push(word) }
  const flags = readFlags(words.slice(1 + path.length))
  // 最长的那条认得的命令；后面多出来的词不管。
  let known: string | undefined
  for (let n = path.length; n > 0 && !known; n--) {
    const candidate = [module, ...path.slice(0, n)].join(' ')
    if (COMMANDS[candidate]) known = candidate
  }
  if (flags.help || !known) {
    return { kind: 'other', output: 'envelope', label: flags.help ? '查看命令用法' : `${site ?? module}：${path.join(' ') || '命令'}`, key: 'other', command }
  }
  const entry = COMMANDS[known]!
  // 值是 shell 变量（循环里的 $d）时不知道实际是什么，纯数字的是帖子、课程的编号，人看不懂，都不显示。
  const values = Object.entries(flags)
    .filter(([name, value]) => typeof value === 'string' && !QUIET_FLAGS.has(name) && !value.startsWith('$') && !/^[\d|,]+$/.test(value))
    .map(([, value]) => value as string)
  const link = typeof flags.url === 'string' && /^https?:\/\//.test(flags.url) ? flags.url.split('|')[0] : undefined
  const about = values.slice(0, 2).map(value => /^https?:\/\//.test(value) ? hostOf(value) ?? value : value).join(' · ')
  const cancel = flags.cancel === true
  const label = stepName(known, cancel, entry.label)
  if (site === undefined) return { kind: 'other', output: 'envelope', label, ...(about ? { about: shorten(about) } : {}), key: 'other', command }
  return {
    kind: 'campus',
    output: 'envelope',
    site,
    label,
    ...(about ? { about: shorten(about) } : {}),
    ...(entry.write ? { write: true } : {}),
    key: `${known}${cancel ? ' --cancel' : ''}`,
    command,
    ...(link ? { link } : {}),
  }
}

/**
 * 一次工具调用是在做什么。
 * @param name 工具名（pwsh、read、web_search……）
 * @param argsRaw 模型给的参数，JSON 字符串
 */
export function describeCall(name: string, argsRaw: string): Action {
  const parsed = parseJson(argsRaw)
  const args = isRecord(parsed) ? parsed : {}
  const text = (key: string) => typeof args[key] === 'string' ? args[key] as string : undefined
  if (SHELL_TOOLS.has(name)) {
    const command = text('command') ?? ''
    const words = zjuWords(command)
    if (words && words.length > 0) return campusAction(words, command)
    const about = text('description') ?? command
    return { kind: 'other', output: 'shell', label: '运行命令', ...(about ? { about: shorten(about) } : {}), key: 'other', command }
  }
  if (name === 'web_search') {
    const query = text('query') ?? ''
    return { kind: 'web', output: 'tool', site: '联网搜索', label: '搜索', ...(query ? { about: shorten(query) } : {}), key: 'web_search', command: query }
  }
  if (name === 'web_fetch') {
    const url = text('url') ?? ''
    const host = hostOf(url)
    return { kind: 'web', output: 'tool', site: host ?? '网页', label: '打开网页', key: `web_fetch ${host ?? ''}`, command: url, ...(host ? { link: url } : {}) }
  }
  const local = LOCAL_TOOLS[name]
  const target = local?.about ? text(local.about) : undefined
  const about = target === undefined ? undefined : /path$/.test(local!.about!) ? baseName(target) : target
  // 不认识的工具不把内部名字摆出来，名字留在「看命令」里。
  return { kind: 'other', output: 'tool', label: local?.label ?? '其他操作', ...(about ? { about: shorten(about) } : {}), key: 'other', command: `${name} ${argsRaw}` }
}

/** 结果里的文字：引擎把工具输出包成 text 块，或者再包一层 tool-result。 */
export function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(resultText).join('')
  if (!isRecord(content)) return ''
  if (typeof content.text === 'string') return content.text
  return resultText(content.content)
}

/** 数据里唯一的那份列表：数据本身是列表，或者只有一个字段是对象的列表。有两份以上就不猜。 */
function onlyList(data: unknown): unknown[] | undefined {
  if (Array.isArray(data)) return data
  if (!isRecord(data)) return undefined
  const lists = Object.values(data).filter((value): value is unknown[] =>
    Array.isArray(value) && value.every(item => isRecord(item)))
  return lists.length === 1 ? lists[0] : undefined
}

const TITLE_KEYS = ['title', 'name', 'subject', 'course', 'courseName', 'course_name', 'filename', 'file', 'teacher']

function titleOf(item: unknown): string | undefined {
  if (typeof item === 'string') return item
  if (!isRecord(item)) return undefined
  for (const key of TITLE_KEYS) if (typeof item[key] === 'string' && item[key]) return item[key] as string
  return undefined
}

/**
 * 校园命令的结果怎么样。命令的输出是一个 JSON（core/zju/lib/core/output.ts 的信封）；
 * 输出太长时引擎只留后半段，开头的 ok 就没了，这时只看引擎的出错标记，不报条数。
 * 末尾的 [exit code: N] 不能用：PowerShell 里命令只要往 stderr 写过东西（进度、警告），成功了也会是 1。
 */
export function readOutcome(text: string, isError: boolean): Outcome {
  const start = text.search(/\{\s*"ok"\s*:\s*(?:true|false)/)
  const end = text.lastIndexOf('}')
  const envelope = start >= 0 && end > start ? parseJson(text.slice(start, end + 1)) : undefined
  if (isRecord(envelope) && typeof envelope.ok === 'boolean') {
    if (!envelope.ok) {
      const error = isRecord(envelope.error) && typeof envelope.error.message === 'string' ? envelope.error.message : undefined
      return { ok: false, ...(error ? { error: shorten(error, 160) } : {}) }
    }
    const list = onlyList(envelope.data)
    const titles = list?.slice(0, 5).map(titleOf).filter((title): title is string => title !== undefined).map(title => shorten(title, 60))
    return {
      ok: true,
      ...(list ? { count: list.length } : {}),
      ...(titles && titles.length > 0 ? { titles } : {}),
      ...(envelope.source === 'cache' ? { cached: true } : {}),
    }
  }
  // 信封不完整：能看到 "ok": false 和原因就用，否则看引擎的出错标记。
  if (/"ok"\s*:\s*false/.test(text)) {
    const message = /"message"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(text)
    const error = message ? parseJson(message[1]!) : undefined
    return { ok: false, ...(typeof error === 'string' ? { error: shorten(error, 160) } : {}) }
  }
  return { ok: !isError }
}

/**
 * 命令行结果末尾的几行标记，一行一条，都排在输出后面（引擎 dsh-tool-pwsh、dsh-tool-bash 的写法）：
 *   [sandbox: file access denied under … mode]   对话的权限不让读写
 *   [sandbox: escalation available — …]          给模型看的提示，不管
 *   [timed out after N ms]、[stopped: …]          没跑完就被停掉
 *   [killed by signal: X] 或 [exit code: N]       怎么结束的；正常结束（0）不写
 */
interface ShellTail {
  /** 去掉这些标记以后的输出。 */
  body: string
  denied: boolean
  /** 等了多少毫秒没跑完。 */
  timedOut?: number
  signal?: string
  exitCode?: number
}

function shellTail(text: string): ShellTail {
  const lines = text.trimEnd().split('\n')
  const tail: ShellTail = { body: '', denied: false }
  for (; lines.length > 0; lines.pop()) {
    const mark = /^\[(sandbox|timed out after|stopped|killed by signal|exit code)\b:? ?([^\]]*)\]$/.exec(lines[lines.length - 1]!.trim())
    if (!mark) break
    const [, name, value = ''] = mark
    if (name === 'sandbox') tail.denied ||= value.includes('denied')
    else if (name === 'timed out after') tail.timedOut = Number.parseInt(value, 10) || 0
    else if (name === 'killed by signal') tail.signal = value
    else if (name === 'exit code') tail.exitCode = Number(value)
  }
  tail.body = lines.join('\n')
  return tail
}

/** 命令自己报的第一句错：写到 stderr 的那一段的第一行；whole 是引擎标了出错，这时整段结果就是原因。 */
function firstComplaint(body: string, whole: boolean): string | undefined {
  const lines = body.split('\n').map(line => line.trim())
  const from = lines.lastIndexOf('[stderr]')
  const said = (from >= 0 ? lines.slice(from + 1) : whole ? lines : []).find(line => line !== '')
  return said?.replace(/^Error:\s*/, '') || undefined
}

/** 没成功的原因，给人看的一句：先说是权限不让还是超时，再跟上命令自己报的那一句；都没有就说它是怎么结束的。 */
function failureText(tail: ShellTail, said: string | undefined): string | undefined {
  const why = tail.denied ? '对话的权限不让读写这个位置'
    : tail.timedOut !== undefined ? `等了 ${String(Math.max(1, Math.round(tail.timedOut / 1000)))} 秒没有跑完，被停掉了`
      : undefined
  const reason = [why, said].filter(Boolean).join('：')
  if (reason) return shorten(reason, 160)
  if (tail.signal !== undefined) return `被中止了（${tail.signal}）`
  return tail.exitCode ? `命令没有成功，退出码 ${String(tail.exitCode)}` : undefined
}

const failed = (error: string | undefined): Outcome => ({ ok: false, ...(error ? { error } : {}) })

/**
 * 别的命令行（不是校园命令）的结果。命令退出码不是 0 时引擎并不算它出错（isError 还是 false），只在输出最后写一行退出码；
 * 这里和对话里那张命令卡片一个看法（引擎 dsh-shell 的 parseExitStatus）：退出码不是 0、被信号杀掉、超时被停掉，都是没成功。
 */
export function readShellOutcome(text: string, isError: boolean): Outcome {
  const tail = shellTail(text)
  if (!isError && tail.signal === undefined && tail.timedOut === undefined && (tail.exitCode ?? 0) === 0) return { ok: true }
  return failed(failureText(tail, firstComplaint(tail.body, isError)))
}

/** 引擎自带工具（读写文件、查找、联网）的结果：只看引擎的出错标记，出错时结果里写的就是原因。 */
export function readToolOutcome(text: string, isError: boolean): Outcome {
  if (!isError) return { ok: true }
  const tail = shellTail(text)
  return failed(failureText(tail, firstComplaint(tail.body, true)))
}

/** 这一步结果怎么样，按它是哪一种调用来读。 */
export function outcomeOf(action: Action, text: string, isError: boolean): Outcome {
  if (action.output === 'shell') return readShellOutcome(text, isError)
  if (action.output === 'tool') return readToolOutcome(text, isError)
  const outcome = readOutcome(text, isError)
  if (!outcome.ok) return outcome
  // 校园命令没等到自己说完就被停掉（超时、被杀掉）：信封不完整，读出来像是成功了，按没成功算。
  // 它自己写到 stderr 的是进度，不是原因，不拿来用。
  const tail = shellTail(text)
  return tail.timedOut === undefined && tail.signal === undefined ? outcome : failed(failureText(tail, undefined))
}
