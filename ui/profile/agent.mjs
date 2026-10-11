/**
 * 助手的底层说明。引擎的系统提示原本是给编程助手写的：开头是「You are an AI agent powered by DeepSeek Harness.」
 * 和「You are a coding agent powered by … model.」，后面还有引擎源码在哪、网页界面怎么开发两段。
 * 这里把它换成我们的：人设一句话，接着是 core/AGENT.md 整篇（你在哪、对面是谁、手里有什么、东西放哪、什么事要先问）。
 *
 * 人设不能只写在 app.patch.yml 的 system-prompt 那一行：引擎的每个 Agent 预设（standard 等）自己带一条人设，
 * 会把那一行的盖掉。2026-10-07 的一份真实对话日志里，模型收到的就是引擎那两句英文，自我介绍是「DeepSeek Harness 中的编码智能体」。
 * 所以在每次拼系统提示的最后一步改（system-prompt/assemble，没挂在哪个 Agent 上的监听对所有 Agent 都生效）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { CORE_ROOT } from './skills.mjs'

export const AGENT_FILE = path.join(CORE_ROOT, 'AGENT.md')

/** 人设那一段在引擎里的名字。 */
const PERSONA = 'deployment:persona-prefix'
/** 引擎给编程助手写的人设都是这个开头；子智能体用的也是它。别的人设（以后自己加的预设）不动。 */
const ENGINE_PERSONA = /^You are a coding agent powered by /
/** 模型的名字只有这一段能带上（{{model}} 由引擎填），AGENT.md 里的花括号不做替换。 */
export const PERSONA_TEXT = '你是「校园智能体」里的助手，帮浙江大学的学生处理校园事务和学习，由 {{model}} 模型驱动。'
/** 这三段是写给改引擎的人看的：引擎是谁、它的源码在哪（指到的是我们的安装目录）、它的网页界面怎么开发。 */
const DROPPED = new Set(['harness:identity', 'harness:source', 'app:web-surface'])

/** AGENT.md 的正文。每次拼系统提示时现读，开发时改完下一轮对话就生效；读不到时这一段就没有，不让对话跟着坏。 */
export function agentText(file = AGENT_FILE) {
  try { return fs.readFileSync(file, 'utf8').trim() } catch { return '' }
}

/** 拼好的系统提示各段：去掉引擎那三段，把编程助手的人设换成我们的。 */
export function rewriteSections(sections) {
  return sections.filter(section => !DROPPED.has(section.name))
    .map(section => section.name === PERSONA && ENGINE_PERSONA.test(section.text) ? { ...section, text: PERSONA_TEXT } : section)
}

export function installAgent(ctx) {
  // 排在人设（0）后面、引擎讲各个工具怎么用的那些段（1000 起）前面。
  ctx.systemPrompt.section({ name: 'campus-agent', order: 10, interpolate: false, text: () => agentText() })
  ctx.on?.('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembly = await next()
    return { ...assembly, sections: rewriteSections(assembly.sections) }
  })
}
