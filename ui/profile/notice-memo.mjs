/**
 * 把校园事务页右栏的一条通知加进备忘录（同一页左栏下面）。是用户点的，所以照人自己记的那样存（store 的 save），不算助手写的。
 * 两种加法：
 *   直接添加        标题、来源、日期和原文链接，不联网。
 *   AI 总结后添加   先读正文，让模型照固定的几项写出来（讲了什么、要做什么、截止、时间地点、对象、材料），存进正文。
 *                   正文读不到、模型问不成的时候退回直接添加，并说明为什么没总结成。
 * 三种通知读正文的办法不一样：学校通知用 ZJU Core 的 `notice view`，公众号文章用公众号插件读全文，
 * 二课活动没有正文，用 `sztz activity list` 里它的那一条（记点、时间地点、报名办法是平台给的，照原样列；简介和注意事项交给模型概括）。
 * 同一条通知只加一次：备忘的正文里带着原文链接，靠它认。
 */
import { runCore } from './core.mjs'

/** 标题就是文件名（store.mjs 的 noteTitle）：这些符号不能有，换成长得一样的全角符号。 */
const WIDE = { '\\': '＼', '/': '／', ':': '：', '*': '＊', '?': '？', '"': '＂', '<': '〈', '>': '〉', '|': '｜', '[': '［', ']': '］', '#': '＃', '^': '＾' }
const TITLE_MAX = 80
/** 交给模型的正文最多这么多字；再长的通知，要紧的事也在前面。 */
const TEXT_MAX = 12_000
/** 正文不到这么多字的不值得总结（多半是只有一句「见附件」）。 */
const TEXT_MIN = 30
/** 模型写的每一项最多留这么多字。 */
const FIELD_MAX = 400
const text = value => typeof value === 'string' ? value.trim() : ''

/**
 * 通知的标题变成备忘的标题：去掉不能做文件名的符号，太长的截短；已经有同名的备忘就在后面加（2）、（3）。
 * taken(标题) 说这个标题是不是已经有了。
 */
export function memoTitle(title, taken = () => false) {
  let base = text(String(title ?? '').replace(/[\x00-\x1f]/g, ' ').replace(/[\\/:*?"<>|[\]#^]/g, char => WIDE[char]).replace(/\s+/g, ' ')).replace(/^\.+|\.+$/g, '').trim() || '通知'
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) base += ' 通知'
  const fit = tail => base.length + tail.length <= TITLE_MAX ? base + tail : `${base.slice(0, TITLE_MAX - tail.length - 1).trimEnd()}…${tail}`
  for (let count = 1; ; count++) {
    const candidate = fit(count === 1 ? '' : `（${count}）`)
    if (!taken(candidate)) return candidate
  }
}

/** 正文里的原文链接。括号换掉，不然 Markdown 的链接会在那里断开。页面认一条通知加没加过用的是同一个写法（ui/client/Memos.tsx）。 */
export const linkOf = url => url.replace(/\(/g, '%28').replace(/\)/g, '%29')
const linkLine = url => `[查看原文](${linkOf(url)})`

/** 带时区的时间写成北京时间的「2026-10-21」或「2026-10-21 17:00」。 */
const beijing = (iso, minutes = false) => new Date(Date.parse(iso) + 8 * 3_600_000).toISOString().replace('T', ' ').slice(0, minutes ? 16 : 10)

/** 备忘的属性：谁发的，哪天发的；二课活动写报名到什么时候。 */
function propertiesOf(item) {
  const from = text(item.from).slice(0, 200)
  return [
    ...(from ? [{ key: '来源', value: from }] : []),
    item.kind === 'sztz' ? { key: '报名截止', value: beijing(item.closes, true) } : { key: '日期', value: beijing(item.at) },
  ]
}

/** 交代模型做什么。输出的几项名字固定，代码照名字取。 */
const SYSTEM = `你在帮一位浙江大学的学生把一条通知记进备忘录。下面给你这条通知的标题、来源和正文。
只根据给你的内容写，没有写到的不要补，也不要推测。用简体中文，每一项一两句话，写要紧的，不写客套话。

只输出一个 JSON 对象，不要别的文字，不要代码块：
{"讲了什么": "", "要做什么": "", "截止": "", "时间地点": "", "对象": "", "材料": "", "其他": ""}

各项的意思：
- 讲了什么：这条通知说的是什么事，一两句话。这一项一定要有。
- 要做什么：需要这位学生做的事（报名、提交、缴费、参加等）和怎么做（在哪个系统、发到哪、找谁），有时间要求的把时间也写上。没有要他做的事就留空字符串。
- 截止：最要紧的一项。正文里要求在某个时间之前做完的事（报名、提交、发送材料、缴费、反映意见等），把那个时间照正文里的原话抄下来（比如「10月21日17:00前」），不要换算、不要改写；后面可以用括号注明是什么事的截止。有几个就用分号隔开，和学生最相关的写在前面。正文里没有这样的时间就留空字符串。
- 时间地点：活动、考试、讲座、办理的时间和地点。没有就留空字符串。
- 对象：面向哪些学生，有什么条件或名额限制。没有就留空字符串。
- 材料：要准备或提交的材料。没有就留空字符串。
- 其他：别的要紧的事，比如联系人、联系方式、费用。没有就留空字符串。

「已知」里列出的内容已经另外记下了，不用再重复。`

const FIELDS = ['讲了什么', '要做什么', '截止', '时间地点', '对象', '材料', '其他']

/** 从模型的回答里取出那几项；不是要的格式就返回 undefined。 */
export function parseSummary(answer) {
  const raw = text(answer), start = raw.indexOf('{'), end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  let parsed
  try { parsed = JSON.parse(raw.slice(start, end + 1)) } catch { return undefined }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  const fields = Object.fromEntries(FIELDS.map(name => [name, text(parsed[name]).replace(/\s*\n+\s*/g, ' ').slice(0, FIELD_MAX)]))
  return FIELDS.some(name => fields[name]) ? fields : undefined
}

/** 比较前把空白去掉、全角的数字和冒号换成半角：正文里的排版五花八门。 */
const plain = value => value.replace(/\s+/g, '').replace(/[０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0)).replace(/：/g, ':')

/**
 * 模型给的一个截止时间是不是正文里真有的：原话在正文里，或者它里面的数字照原来的顺序、挨着出现在正文里
 * （前后不能再连着别的数字：正文写的是 13 日，说成 1 日不算）。截止时间记错了比没记更糟，对不上的就不要。
 */
export function inSource(deadline, source) {
  const claim = plain(deadline), body = plain(source)
  if (!claim) return false
  if (body.includes(claim)) return true
  const numbers = claim.match(/\d+/g)
  return Boolean(numbers && numbers.length >= 2 && new RegExp(`(?<!\\d)${numbers.join('\\D{1,12}')}(?!\\d)`).test(body))
}

/** 模型给的截止时间可能有几个，用分号隔开；一个一个对，留下对得上的。 */
export const deadlinesIn = (deadline, source) => deadline.split(/[；;]/).map(part => part.trim()).filter(part => inSource(part, source)).join('；')

export class NoticeMemo {
  /**
   * store 是档案（备忘录在里面）；feed 是通知那一栏（snapshot 给出现在的全部通知）；ask 问模型一次（{ system, text } → 回答的文字）；
   * article(url) 读一篇公众号文章的全文（返回 { markdown }）；run 跑一条 ZJU Core 命令并返回结果里的 data。
   */
  constructor({ store, feed, ask, article, run = runCore }) {
    Object.assign(this, { store, feed, ask, article, run })
    /** 正在加的：同一条连点两下只加一次。 */
    this.adding = new Map()
  }

  /** 这条通知是不是已经在备忘录里（归档的也算）；在的话返回那一条。 */
  existing(url) {
    const mark = `](${linkOf(url)})`
    return this.store.memos.list().notes.find(note => note.raw.includes(mark))
  }

  /**
   * 把编号是 id 的那条通知加进备忘录；summarize 为真时先总结。
   * 返回 { title 备忘的标题, existed 本来就在, summarized 这一条带着总结, reason 要总结却没总结成的原因 }。
   */
  add(input) {
    const id = text(input?.id), summarize = input?.summarize === true
    if (!id) throw new Error('无效的请求')
    if (!this.adding.has(id)) this.adding.set(id, this.addOnce(id, summarize).finally(() => { this.adding.delete(id) }))
    return this.adding.get(id)
  }

  async addOnce(id, summarize) {
    const item = (await this.feed.snapshot()).items.find(entry => entry.id === id)
    if (!item) throw new Error('这条通知已经不在列表里了，刷新后再试。')
    const before = this.existing(item.url)
    if (before) return { title: before.title, existed: true, summarized: false, reason: '' }

    let summary, reason = ''
    if (summarize) {
      try { summary = await this.summarize(item) }
      catch (error) { reason = text(error?.message).replace(/[。.！!]+$/, '') || '没有总结出来' }
    }
    // 总结要等一阵，这期间可能已经从别处加过了。
    const meanwhile = summary ? this.existing(item.url) : undefined
    if (meanwhile) return { title: meanwhile.title, existed: true, summarized: false, reason: '' }
    const note = this.store.memos.save({
      title: memoTitle(item.title, title => Boolean(this.store.memos.find(title))), tags: [],
      properties: [...propertiesOf(item), ...(summary?.deadline ? [{ key: '截止', value: summary.deadline }] : [])],
      body: summary ? `${summary.body}\n\n${summary.byModel ? 'AI 根据原文总结，以原文为准。' : '以平台上写的为准。'}${linkLine(item.url)}` : linkLine(item.url),
    })
    return { title: note.title, existed: false, summarized: Boolean(summary), reason }
  }

  /**
   * 读正文、问模型，返回 { body 备忘的正文, deadline 截止时间的原话（没有是空的）, byModel 是不是模型写的 }；做不成时抛出原因。
   * 二课活动在平台上没写简介时没有可概括的，只列平台给的那几项，不问模型。
   */
  async summarize(item) {
    const source = item.kind === 'school' ? await this.school(item) : item.kind === 'wechat' ? await this.wechat(item) : await this.activity(item)
    const facts = source.facts.map(([name, value]) => `- ${name}：${value}`)
    if (!source.text) return { body: facts.join('\n'), deadline: '', byModel: false }
    const known = source.facts.map(([name, value]) => `${name}：${value}`).join('\n')
    const answer = await this.ask({
      system: SYSTEM,
      text: [`标题：${item.title}`, `来源：${item.from}`, ...(known ? [`已知：\n${known}`] : []), `正文：\n${source.text.slice(0, TEXT_MAX)}`].join('\n'),
    })
    const fields = parseSummary(answer)
    if (!fields) throw new Error('模型给的不是要的格式')
    // 二课活动的时间地点和报名截止是平台给的，用平台的，不用模型的。
    if (item.kind === 'sztz') fields.截止 = fields.时间地点 = ''
    else fields.截止 = deadlinesIn(fields.截止, source.text)
    const lines = [...facts, ...['截止', '时间地点', '对象', '材料', '其他'].flatMap(name => fields[name] ? [`- ${name}：${fields[name]}`] : [])]
    const body = [fields.讲了什么, fields.要做什么 && `**要做的事**：${fields.要做什么}`, lines.join('\n')].filter(Boolean).join('\n\n')
    if (!body) throw new Error('模型没有总结出内容')
    return { body, deadline: fields.截止, byModel: true }
  }

  /** 学校通知的正文。有的网站读不了，有的通知内容全在附件里。 */
  async school(item) {
    const data = await this.run(['notice', 'view', '--url', item.url], { system: '校园通知', timeoutMs: 60_000 })
    const record = data?.notices?.[0], body = text(record?.text)
    if (record?.contentStatus === 'attachment-only') throw new Error('这条通知的内容在附件里')
    if (!record || record.contentStatus === 'unavailable' || body.length < TEXT_MIN) throw new Error('这条通知的正文读不到')
    const attachments = (Array.isArray(record.attachments) ? record.attachments : []).map(file => text(file?.name ?? file?.text ?? file?.title)).filter(Boolean)
    return { text: attachments.length ? `${body}\n\n附件：${attachments.join('、')}` : body, facts: [] }
  }

  /** 公众号文章的全文，去掉图片。 */
  async wechat(item) {
    if (!this.article) throw new Error('公众号的文章现在读不了')
    const body = text((await this.article(item.url))?.markdown).replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\n{3,}/g, '\n\n')
    if (body.length < TEXT_MIN) throw new Error('这篇文章的正文读不到')
    return { text: body, facts: [] }
  }

  /** 二课活动：平台上按名字找到它，记点、时间地点、报名办法照原样列出来，简介和注意事项交给模型。 */
  async activity(item) {
    const data = await this.run(['sztz', 'activity', 'list', '--keyword', item.title, '--limit', '50'], { system: '素质拓展平台', timeoutMs: 90_000 })
    const same = (Array.isArray(data?.activities) ? data.activities : []).filter(entry => text(entry?.name) === item.title)
    const found = same.find(entry => text(entry.signupCloses) === beijing(item.closes, true)) ?? same[0]
    if (!found) throw new Error('平台上没有找到这个活动')
    const span = [text(found.startTime), text(found.endTime)].filter(Boolean).join(' 至 ')
    const signup = [text(found.signupMethod), text(found.signupOpens) && text(found.signupCloses) ? `${found.signupOpens} 至 ${found.signupCloses}` : '', text(found.signupHow)].filter(Boolean).join('，')
    // 平台上这几项是人手填的，里面常有换行和制表符；每一项要写成一行。
    const facts = [
      ['记点', [text(found.category), text(String(found.points ?? ''))].filter(Boolean).join(' ')], ['活动时间', span], ['地点', text(found.place)], ['报名', signup],
      ['名额', Number.isFinite(found.quota) ? `${found.quota} 人${Number.isFinite(found.signedCount) ? `，已报 ${found.signedCount} 人` : ''}` : ''], ['联系人', text(found.contact)],
    ].map(([name, value]) => [name, value.replace(/\s+/g, ' ')]).filter(([, value]) => value)
    const body = [text(found.intro) && `简介：${found.intro}`, text(found.notes) && `注意事项：${found.notes}`].filter(Boolean).join('\n\n')
    if (body.length < TEXT_MIN && !facts.length) throw new Error('这个活动在平台上没有写详情')
    return { text: body.length < TEXT_MIN ? '' : body, facts }
  }
}
