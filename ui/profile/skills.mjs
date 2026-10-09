import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

/** 应用自带的 core，均从应用目录加载。 */
export const CORE_ROOT = fileURLToPath(new URL('../../core/', import.meta.url))
const CORES = ['zju', 'learn', 'weread', 'weread-skills']

/** 应用自带技能的名字；助手学到的技能不能和它们重名。 */
export function coreSkillNames() {
  return CORES.flatMap((name) => {
    try { return load(fs.readFileSync(path.join(CORE_ROOT, name, 'SKILL.md'), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)?.[1] ?? '')?.name ?? [] } catch { return [] }
  })
}

/** 注册校园、学习和微信读书技能，以及助手学到的技能（learned，见 learned.mjs）。 */
export function installCoreSkills(ctx, learned) {
  const provider = 'campus-core-skills'
  ctx.skills.registerProvider((control) => {
    // 学到的技能有增减时让引擎重新读目录，新存的技能在同一个对话里就能用。
    if (learned) learned.onChange = () => { control.invalidate() }
    const learnedEntries = () => (learned?.list() ?? []).map(skill => ({
      name: skill.name, description: `${skill.title}：${skill.description}`, path: skill.path, source: 'custom', provider,
      resourceBase: { kind: 'directory', path: learned.dir }, rank: 140, locator: skill.path,
      invocation: { modelInvocable: true, userInvocable: true }, content: skill.body,
    }))
    const coreEntries = () => CORES.flatMap((name) => {
      const directory = path.join(CORE_ROOT, name), file = path.join(directory, 'SKILL.md')
      if (!fs.existsSync(file)) return []
      const raw = fs.readFileSync(file, 'utf8'), match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
      if (!match) return []
      const meta = load(match[1])
      if (!meta?.name || !meta?.description) return []
      return [{ name: meta.name, description: meta.description, path: file, source: 'custom', provider,
        resourceBase: { kind: 'directory', path: directory }, rank: 150, locator: file,
        invocation: { modelInvocable: true, userInvocable: true }, content: (name === 'weread-skills' ? `应用适配说明（非腾讯原文）：官方 API Key 已由应用凭据文件管理。执行接口时使用 node "${path.join(CORE_ROOT, 'weread', 'official-cli.mjs')}" /接口名 'JSON业务参数'；它会读取凭据、报告版本并检查插件开关。不要要求用户重新提供 Key，不要将 Key 写入命令，不直接改用 curl 或猜测未开放接口。正文、公众号历史列表及添加不在官方开放清单内时，使用应用的 weread Skill。下文是腾讯官方能力说明，参数及字段含义以它为准。\n\n` : '') + raw.slice(match[0].length) }]
    })
    const entries = () => [...coreEntries(), ...learnedEntries()]
    return {
      name: provider,
      list: async () => entries(),
      get: async candidate => entries().find(entry => entry.locator === candidate.locator),
    }
  })
}
