/**
 * 把一次会话的事件压成给复盘看的摘要：用户说的话、助手的回答、每次工具调用和成没成。
 * 系统提示、思考过程、流式片段都不要；工具的结果只留开头一段。
 *
 * 同一个对话可能复盘不止一次（聊完一段，过后又接着聊）。since 是上一次看到哪：之后的几轮完整给，
 * 之前的只留用户说过的话，够它看出「前面说了、后面又收回」就行。
 * 事件的样子照引擎的会话日志（@deepseek-ai/dsh-session），引擎升级后要对一遍。
 */

/** 一句话最多留多少字：用户的、助手的、调用的参数、成功的结果、失败的结果、前面几轮里用户的话。 */
const CLIP = { user: 2500, assistant: 1800, call: 320, ok: 260, failed: 420, earlier: 300 }
/** 摘要的总长。超了先把助手的话和工具结果压短，还超就只留最后几轮。 */
const BUDGET = 14000
/** 应用自带的校园命令：整条命令里有这两个脚本之一。 */
const CAMPUS = /[\\/]+(?:zju|weread)[\\/]+scripts[\\/]+(?:zju|weread)\.ts\b/

const clip = (value, limit) => {
  const flat = String(value ?? '').replace(/\r/g, '').trim()
  return flat.length > limit ? `${flat.slice(0, limit)}…（共 ${flat.length} 字）` : flat
}
const textOf = content => (Array.isArray(content) ? content : []).filter(block => block?.type === 'text').map(block => block.text).join('\n')
const oneLine = value => String(value ?? '').replace(/\s+/g, ' ').trim()

/** 一次调用的参数怎么写：命令行只留命令本身，别的照原样。 */
function briefCall(raw) {
  let args
  try { args = JSON.parse(raw) } catch { return clip(oneLine(raw), CLIP.call) }
  if (typeof args?.command === 'string') return clip(oneLine(args.command), CLIP.call)
  return clip(JSON.stringify(args), CLIP.call)
}

/** 一条校园命令里脚本后面的那一段：模块、对象、动作和参数。 */
function commandTail(raw) {
  let command = String(raw ?? '')
  try { command = String(JSON.parse(raw)?.command ?? command) } catch { /* 参数不是 JSON 时照原样找 */ }
  return oneLine(/(?:zju|weread)\.ts["']?\s+(.*)$/s.exec(command)?.[1] ?? '')
}

/**
 * 一次调用成没成。校园命令看它输出的 JSON 信封（ok），别的命令看退出码；被对话的权限拦住的另算。
 * PowerShell 里校园命令往 stderr 写过进度以后退出码不一定是 0，所以有信封时不看退出码。
 */
export function failed(message) {
  const text = textOf(message?.content)
  if (message?.isError || /\[sandbox: [a-z ]*denied/.test(text)) return true
  const envelope = /^\s*\{\s*"ok"\s*:\s*(true|false)/.exec(text)
  if (envelope) return envelope[1] === 'false'
  const exit = /\[exit code: (\d+)\]/.exec(text.slice(-200))
  return exit ? exit[1] !== '0' : false
}

/**
 * events 是会话的全部事件。返回：
 *   text       摘要
 *   said       用户在这次对话里说过的每一句（核对「依据」是不是用户原话用）
 *   fresh      since 之后用户说了几次；是 0 就没有新东西可看
 *   ran        since 之后成功的校园命令，每条是脚本后面的那一段（「zdbk selection select --course …」）
 *   lastSeq    看到了哪（下次从这之后算新的）
 */
export function digest(events, { since = -1, title = '', budget = BUDGET } = {}) {
  const rounds = []
  let current = null, lastSeq = since, sessionTitle = title
  const calls = new Map()
  for (const event of events ?? []) {
    const data = event?.data ?? {}
    if (typeof event?.seq === 'number' && event.seq > lastSeq) lastSeq = event.seq
    if (event?.type === 'session/title' && typeof data.title === 'string') sessionTitle = data.title
    else if (event?.type === 'user/message') {
      // 引擎自己塞进来的上下文（运行环境、技能目录、时间）也是「用户消息」，只有 kind 是 user 的才是人说的。
      if (data.source?.kind !== 'user') continue
      current = { seq: event.seq ?? 0, user: textOf(data.content), lines: [], ran: [] }
      rounds.push(current)
    } else if (!current) continue
    else if (event.type === 'assistant/message') {
      const text = textOf(data.message?.content)
      if (text.trim()) current.lines.push({ kind: 'assistant', text })
    } else if (event.type === 'tool/call') {
      calls.set(data.callId, { name: data.name, args: data.arguments })
      current.lines.push({ kind: 'call', name: data.name, text: briefCall(data.arguments) })
    } else if (event.type === 'tool/result') {
      const message = data.message ?? {}, bad = failed(message), call = calls.get(message.toolCallId ?? message.source?.callId)
      if (!bad && call && CAMPUS.test(String(call.args ?? ''))) current.ran.push(commandTail(call.args))
      current.lines.push({ kind: 'result', bad, text: oneLine(textOf(message.content)) })
    }
  }

  const fresh = rounds.filter(round => round.seq > since)
  const earlier = rounds.filter(round => round.seq <= since)
  const render = (round, tight) => [
    `[用户] ${clip(round.user, CLIP.user)}`,
    ...round.lines.map(line => line.kind === 'assistant' ? `[助手] ${clip(line.text, tight ? 600 : CLIP.assistant)}`
      : line.kind === 'call' ? `[调用 ${line.name}] ${line.text}`
        : `  → ${line.bad ? '失败' : '成功'}：${clip(line.text, tight ? 120 : line.bad ? CLIP.failed : CLIP.ok)}`),
  ].join('\n')
  const before = earlier.length
    ? `（这次对话前面还有 ${earlier.length} 轮，上次已经看过，该记的那时已经记了，不要再从里面取东西。那时用户说的是：）\n${earlier.map(round => `[用户] ${clip(round.user, CLIP.earlier)}`).join('\n')}\n\n（下面是这次要看的：）\n`
    : ''
  let body = fresh.map(round => render(round, false)).join('\n\n')
  if (before.length + body.length > budget) body = fresh.map(round => render(round, true)).join('\n\n')
  if (before.length + body.length > budget) {
    // 还是太长：从最后一轮往前留，留到放不下为止，至少留一轮。
    const kept = []
    let size = before.length
    for (const round of [...fresh].reverse()) {
      const text = render(round, true)
      if (kept.length && size + text.length > budget) break
      kept.unshift(text)
      size += text.length + 2
    }
    const skipped = fresh.length - kept.length
    // 略去的那几轮里用户说的话还是要给：前面说了后面收回的，靠它看出来。
    const gap = skipped ? `${fresh.slice(0, skipped).map(round => `[用户] ${clip(round.user, CLIP.earlier)}`).join('\n')}\n（以上 ${skipped} 轮只留了用户的话）\n\n` : ''
    body = gap + kept.join('\n\n')
  }
  const head = `# 对话：${sessionTitle || '（没有标题）'}\n用户这次说了 ${fresh.length} 次，工具调用 ${fresh.reduce((sum, round) => sum + round.lines.filter(line => line.kind === 'call').length, 0)} 次\n\n`
  return {
    text: `${head}${before}${body}\n`,
    said: rounds.map(round => round.user),
    fresh: fresh.length,
    ran: fresh.flatMap(round => round.ran),
    lastSeq,
    title: sessionTitle,
  }
}
