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

/** 工作流单独当技能加载时，正文前面的一句：它的命令是 zju 的，没加载 zju 就不知道怎么执行。 */
const FLOW_LEAD = '这是 zju 技能里的一个工作流，写的是几步连起来怎么走。里面的命令（`zdbk …`、`xuezai …`、`cc98 …` 这样的）都由 zju 技能执行：还没加载 zju 的先加载它，照它开头写的办法运行命令，再按下面的顺序走。'

/**
 * 注册校园、学习和公众号技能，应用自带的工作流（core/zju/flows/，每个也是一个技能），以及助手学到的技能（learned，见 learned.mjs）。
 * plugins 是插件开关：关掉的插件对应的那份 core 不交给引擎，助手的技能目录和输入框的 / 菜单里就没有它。
 * flowNotes 管工作流和它们的补充（flow-notes.mjs）：补充拼在 zju 正文的末尾，也接在各个工作流自己的正文后面，从哪边加载都看得到。
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
    // 工作流：名字是文件名，说明是「给人看的名字：什么时候用」。它里面的链接是相对它自己那个文件夹写的。没写什么时候用的不单独列。
    const flowEntries = () => (flowNotes?.flows() ?? []).filter(flow => flow.description).map(flow => ({
      name: flow.name, description: `${flow.label}：${flow.description}`, path: flow.file, source: 'custom', provider,
      resourceBase: { kind: 'directory', path: path.dirname(flow.file) }, rank: 145, locator: flow.file,
      invocation: { modelInvocable: true, userInvocable: true }, content: `${`${FLOW_LEAD}\n\n${flow.text}${flowNotes.notesSection(flow.name)}`.trimEnd()}\n`,
    }))
    // 和工作流重名的不交给引擎（存的时候就不让重名，这里挡的是早先存下的）。
    const learnedEntries = () => (learned?.list() ?? []).filter(skill => !flowEntries().some(flow => flow.name === skill.name)).map(skill => ({
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
    const entries = () => [...coreEntries(), ...flowEntries(), ...learnedEntries()]
    return {
      name: provider,
      list: async () => entries(),
      get: async candidate => entries().find(entry => entry.locator === candidate.locator),
    }
  })
  return () => { reload() }
}
