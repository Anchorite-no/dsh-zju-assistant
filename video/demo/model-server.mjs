/**
 * 本机的假模型服务，说 Anthropic Messages 的话（引擎的 DeepSeek 接口就是这种，地址由 DEEPSEEK_BASE_URL 指过来）。
 * 回答是照剧本放的（chats.mjs）：按这一轮用户说的话认出是哪一段对话，按这一轮里助手已经说过几次认出走到第几步。
 * 一步可以带思考、正文和几次工具调用；工具真的由引擎去跑（跑的是副本里的假 core），所以「执行过程」是引擎自己记下来的。
 * 引擎起标题、应用自己问模型（通知加到备忘录时的总结、通知筛选）也到这里来，各有各的回答。
 */
import { createServer } from 'node:http'
import { appendFileSync } from 'node:fs'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const textOf = content => typeof content === 'string' ? content : Array.isArray(content) ? content.map(block => block.type === 'text' ? block.text : '').join('') : ''
const systemText = system => typeof system === 'string' ? system : Array.isArray(system) ? system.map(block => block.text ?? '').join('\n') : ''

/**
 * scenarios：[{ match(text) → bool, steps: [{ think?, text?, tools?: [{ name, input }], delayMs? }], title? }]
 * helpers：{ title(text), ask(system, user) } 处理起标题和应用自己的提问。
 * gate：可选，async (scenario, step) => void，截图脚本用它把对话停在某一步，截完再放行。
 */
export function startModelServer({ scenarios, helpers, gate, logFile, onRequest, onServe, port = 0 }) {
  let seq = 0
  const log = (line) => { if (logFile) appendFileSync(logFile, line + '\n') }

  function pick(body) {
    const messages = body.messages ?? []
    // 这一轮：最后一条用户自己说的话（不是工具结果）。
    let at = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      if (message.role !== 'user') continue
      const blocks = Array.isArray(message.content) ? message.content : [{ type: 'text', text: message.content }]
      if (blocks.some(block => block.type === 'text' && block.text?.trim() && !block.text.startsWith('<system-reminder>'))) { at = i; break }
    }
    const said = at >= 0 ? textOf(messages[at].content) : ''
    const step = messages.slice(at + 1).filter(message => message.role === 'assistant').length
    return { said, step }
  }

  function reply(body) {
    const system = systemText(body.system)
    const tools = (body.tools ?? []).map(tool => tool.name)
    const { said, step } = pick(body)
    // 没有工具的请求是起标题或者应用自己问的。
    if (!tools.length) {
      const user = (body.messages ?? []).map(message => textOf(message.content)).join('\n')
      const text = /title|标题/i.test(system) ? helpers.title(user, system) : helpers.ask(system, user)
      return { kind: 'helper', said: said.slice(0, 40), steps: [{ text }], step: 0 }
    }
    const scenario = scenarios.find(item => item.match ? item.match(said) : said.includes(item.prompt.slice(0, 12)))
    if (!scenario) return { kind: 'chat', scenario: null, said, steps: [{ text: '好的，我看一下。' }], step: 0 }
    return { kind: 'chat', scenario, said, steps: scenario.steps, step: Math.min(step, scenario.steps.length - 1) }
  }

  function blocksOf(step) {
    const blocks = []
    if (step.think) blocks.push({ type: 'thinking', thinking: step.think, signature: 'demo' })
    if (step.text) blocks.push({ type: 'text', text: step.text })
    for (const tool of step.tools ?? []) blocks.push({ type: 'tool_use', id: `toolu_demo_${++seq}`, name: tool.name, input: tool.input })
    return blocks
  }

  async function stream(res, model, blocks, stop, pace) {
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`)
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
    send('message_start', { message: { id: `msg_demo_${++seq}`, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 18000 + seq * 7, output_tokens: 1, cache_read_input_tokens: 16000 } } })
    let output = 0
    for (const [index, block] of blocks.entries()) {
      if (block.type === 'thinking') {
        send('content_block_start', { index, content_block: { type: 'thinking', thinking: '' } })
        for (const piece of chunks(block.thinking, 12)) { send('content_block_delta', { index, delta: { type: 'thinking_delta', thinking: piece } }); await sleep(pace) }
        send('content_block_delta', { index, delta: { type: 'signature_delta', signature: block.signature } })
      } else if (block.type === 'text') {
        send('content_block_start', { index, content_block: { type: 'text', text: '' } })
        for (const piece of chunks(block.text, 8)) { send('content_block_delta', { index, delta: { type: 'text_delta', text: piece } }); await sleep(pace) }
      } else {
        send('content_block_start', { index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } })
        send('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } })
      }
      send('content_block_stop', { index })
      output += JSON.stringify(block).length / 3
    }
    send('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: Math.round(output) } })
    send('message_stop', {})
    res.end()
  }

  const server = createServer(async (req, res) => {
    let raw = ''
    req.setEncoding('utf8')
    for await (const chunk of req) raw += chunk
    if (req.method !== 'POST' || !/\/messages(\?|$)/.test(req.url)) {
      log(`${req.method} ${req.url} (not messages)`)
      if (/count_tokens/.test(req.url)) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ input_tokens: 1200 })); return }
      res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'demo' } })); return
    }
    let body
    try { body = JSON.parse(raw) } catch { res.writeHead(400); res.end(); return }
    onRequest?.(body)
    const plan = reply(body)
    const current = plan.steps[plan.step]
    const lastUser = (body.messages ?? []).at(-1), results = Array.isArray(lastUser?.content) ? lastUser.content.filter(block => block.type === 'tool_result') : []
    for (const result of results) log(`  result ${result.is_error ? 'ERROR ' : ''}${JSON.stringify(textOf(result.content)).slice(0, 400)}`)
    log(`${new Date().toISOString()} ${plan.kind} ${plan.scenario?.id ?? '-'} step=${plan.step} said=${JSON.stringify(plan.said.slice(0, 60))} tools=${(body.tools ?? []).length} stream=${!!body.stream}`)
    if (plan.kind === 'chat' && gate) await gate(plan.scenario?.id ?? null, plan.step)
    if (current.delayMs) await sleep(current.delayMs)
    const blocks = blocksOf(current)
    const stop = blocks.some(block => block.type === 'tool_use') ? 'tool_use' : 'end_turn'
    if (plan.kind === 'chat') onServe?.({ scenario: plan.scenario?.id ?? null, step: plan.step, final: stop === 'end_turn' })
    const model = body.model ?? 'deepseek-demo'
    if (body.stream) { await stream(res, model, blocks, stop, plan.kind === 'helper' ? 0 : (current.pace ?? 12)); return }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ id: `msg_demo_${++seq}`, type: 'message', role: 'assistant', model, content: blocks, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 200 } }))
  })
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(done => server.close(done)) }))
  })
}

function* chunks(text, size) {
  const chars = [...text]
  for (let i = 0; i < chars.length; i += size) yield chars.slice(i, i + size).join('')
}
