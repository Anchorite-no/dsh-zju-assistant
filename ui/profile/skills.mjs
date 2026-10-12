import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

/** 应用自带的 core，均从应用目录加载。 */
export const CORE_ROOT = fileURLToPath(new URL('../../core/', import.meta.url))
const CORES = ['zju', 'learn', 'weread']

/** 应用自带技能的名字；助手学到的技能不能和它们重名。 */
export function coreSkillNames() {
  return CORES.flatMap((name) => {
    try { return load(fs.readFileSync(path.join(CORE_ROOT, name, 'SKILL.md'), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)?.[1] ?? '')?.name ?? [] } catch { return [] }
  })
}

/** 每份 core 归哪个可以关掉的插件；不在这里的始终交给引擎（zju 的各个模块由它自己按开关拒绝）。 */
const CORE_PLUGIN = { learn: 'campus.learn', weread: 'campus.wechat' }

/**
 * 注册校园、学习和公众号技能，以及助手学到的技能（learned，见 learned.mjs）。
 * plugins 是插件开关：关掉的插件对应的那份 core 不交给引擎，助手的技能目录和输入框的 / 菜单里就没有它。
 * flowNotes 是工作流的补充（flow-notes.mjs）：拼在 zju 正文的末尾，助手加载 zju 时一起看到。
 * 返回一个函数，开关变了以后叫它，引擎会重新读目录。
 */
export function installCoreSkills(ctx, learned, plugins, flowNotes) {
  let reload = () => {}
  const provider = 'campus-core-skills'
  ctx.skills.registerProvider((control) => {
    // 学到的技能有增减时让引擎重新读目录，新存的技能在同一个对话里就能用。
    reload = () => { control.invalidate() }
    if (learned) learned.onChange = reload
    if (flowNotes) flowNotes.onChange = reload
    const learnedEntries = () => (learned?.list() ?? []).map(skill => ({
      name: skill.name, description: `${skill.title}：${skill.description}`, path: skill.path, source: 'custom', provider,
      resourceBase: { kind: 'directory', path: learned.dir }, rank: 140, locator: skill.path,
      invocation: { modelInvocable: true, userInvocable: true }, content: skill.body,
    }))
    const off = () => plugins?.disabled() ?? []
    const coreEntries = () => CORES.filter(name => !off().includes(CORE_PLUGIN[name])).flatMap((name) => {
      const directory = path.join(CORE_ROOT, name), file = path.join(directory, 'SKILL.md')
      if (!fs.existsSync(file)) return []
      const raw = fs.readFileSync(file, 'utf8'), match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
      if (!match) return []
      const meta = load(match[1])
      if (!meta?.name || !meta?.description) return []
      return [{ name: meta.name, description: meta.description, path: file, source: 'custom', provider,
        resourceBase: { kind: 'directory', path: directory }, rank: 150, locator: file,
        invocation: { modelInvocable: true, userInvocable: true }, content: raw.slice(match[0].length) + (name === 'zju' ? flowNotes?.section() ?? '' : '') }]
    })
    const entries = () => [...coreEntries(), ...learnedEntries()]
    return {
      name: provider,
      list: async () => entries(),
      get: async candidate => entries().find(entry => entry.locator === candidate.locator),
    }
  })
  return () => { reload() }
}
