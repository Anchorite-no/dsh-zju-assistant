/**
 * 应用自己（不是对话里的助手）要模型帮着判断一件小事时，从这里问一次。
 * 走的是引擎的模型服务，用的是用户现在选的那个模型：填的是 DeepSeek Key 还是登录的 ChatGPT 账号，这里都不用管。
 * 做法照引擎给对话起标题的那个包（@deepseek-ai/dsh-session-title-llm）。这几个服务不在本包的依赖里声明，用的时候再取；
 * 没有挂载、或者还没配好模型时抛错，调用的地方当作这一次问不了。
 */
import { rmSync } from 'node:fs'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'

/**
 * 问模型一次，返回它回答的文字。system 是交代它做什么，text 是这一次的内容。
 * image 是要它看的一张图（{ data, mediaType, name }，data 是图的字节）。引擎的模型服务不直接收图，
 * 要先存进它的附件库再引用。这张图不属于哪个对话，问完就从库里拿掉，不然问一次攒一张（场馆的验证码一张两百多 KB）。
 * reasoningEffort 是让它想多深。不给的话 DeepSeek 默认想得很深：筛四十条通知，光思考就把 4000 个 token 用完了，
 * 一个字没答（2026-10-12 实测）。小事给 'low'。各家模型认的写法不一样，这一家不认、或者这样没答成，就照它默认的再问一次。
 */
export async function askModel(ctx, { system, text, image, reasoningEffort, maxTokens = 8000, timeoutMs = 90_000 }) {
  const llm = ctx.get?.('llm'), selection = ctx.get?.('agentDefaultModel')?.currentSelection()
  if (!llm || !selection?.provider || !selection.model) throw new Error('模型现在用不了。')
  const content = [{ type: 'text', text }]
  let forget = () => {}
  if (image) {
    const attachments = ctx.get?.('attachments')
    if (!attachments) throw new Error('这个版本的引擎收不了图片。')
    const attachment = await attachments.saveImage(image)
    content.push({ type: 'image', attachment })
    // 附件库不在本机文件里时给不出位置，那就留着。
    forget = () => { try { const file = attachments.imageHostPath?.(attachment); if (file) rmSync(file, { force: true }) } catch { /* 删不掉不影响这一次的回答 */ } }
  }
  const once = async (extra) => {
    const assembler = new BlockAssembler()
    const request = { provider: selection.provider, model: selection.model, ...(system ? { system } : {}), maxTokens, signal: AbortSignal.timeout(timeoutMs), messages: [{ role: 'user', content }], ...extra }
    for await (const chunk of llm.stream(request)) assembler.push(chunk)
    const finish = assembler.finish
    if (finish?.kind !== 'stop') throw new Error(finish?.failure?.message ?? `模型没有答完（${finish?.kind ?? '没有结束标记'}）。`)
    return assembler.blocks().filter(block => block.type === 'text').map(block => block.text).join('')
  }
  try {
    if (reasoningEffort) {
      try { return await once({ reasoningEffort }) } catch { /* 照默认的再问一次 */ }
    }
    return await once({})
  } finally { forget() }
}
