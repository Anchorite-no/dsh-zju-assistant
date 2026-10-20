import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load, JSON_SCHEMA } from 'js-yaml'

/** 应用自带的 core，均从应用目录加载。 */
export const CORE_ROOT = fileURLToPath(new URL('../../core/', import.meta.url))
const CORES = ['zju', 'learn', 'weread', 'wechat', 'dingtalk', 'mail', 'initialize']
// 底层能力说明供模型查阅；用户的技能入口保留给真正的多步骤工作流。
const WORKFLOWS = new Map([['initialize', '初始化'], ['learn', '课程讲解']])
const FRONT = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/** 界面和引擎使用同一份工作流名单与插件开关。能力说明不单独占用户技能入口。 */
export function coreWorkflowSkills(plugins) {
  return [...WORKFLOWS].filter(([name]) => !(plugins?.disabled() ?? []).includes(CORE_PLUGIN[name])).map(([name, title]) => {
    const file = path.join(CORE_ROOT, name, 'SKILL.md'), raw = fs.readFileSync(file, 'utf8')
    const match = raw.match(FRONT), meta = load(match?.[1] ?? '', { schema: JSON_SCHEMA })
    return { name: `core:${name}`, title, description: meta.description, builtin: true, notes: 0, updatedAt: fs.statSync(file).mtime.toISOString(), body: raw.slice(match[0].length) }
  })
}

const localLinks = /\[([^\]]+)\]\((?![a-z][a-z\d+.-]*:|#)([^)]+)\)/gi
const displayBody = body => body.replace(localLinks, '$1')
const inside = (root, file) => { const relative = path.relative(root, file); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) }

/** 只提供技能正文实际链接的 Markdown，不能借参考文档接口读取任意用户文件。 */
export function skillDetail(input = {}, { plugins, flowNotes, learned }) {
  let skill, file, root, source
  if (input.name?.startsWith('core:')) {
    skill = coreWorkflowSkills(plugins).find(item => item.name === input.name)
    if (!skill) throw new Error('没有这个技能，或对应插件尚未开启')
    root = path.join(CORE_ROOT, input.name.slice(5)); file = path.join(root, 'SKILL.md'); source = skill.body
  } else if (input.name?.startsWith('flow:')) {
    skill = flowNotes.group(input)
    const flow = flowNotes.flows().find(item => `flow:${item.name}` === input.name)
    // 自带技能的正文会链到别的 core 的参考文档（../../zju/references/…），所以能读的范围是整个 core。
    root = CORE_ROOT; file = flow.file; source = flow.text
  } else {
    skill = learned.read(input); root = skill.root; file = skill.path; source = skill.body
  }
  const references = [], targets = new Map(), realRoot = fs.realpathSync(root)
  for (const [, title, link] of source.matchAll(localLinks)) {
    let target
    try { target = path.resolve(path.dirname(file), decodeURIComponent(link.split('#')[0])) } catch { continue }
    if (!inside(root, target) || path.extname(target).toLowerCase() !== '.md') continue
    try { if (!inside(realRoot, fs.realpathSync(target)) || !fs.statSync(target).isFile()) continue } catch { continue }
    const reference = path.relative(root, target).split(path.sep).join('/')
    if (targets.has(reference)) continue
    targets.set(reference, target); references.push({ path: reference, title })
  }
  let body = skill.body, reference = null
  if (input.reference !== undefined) {
    const target = targets.get(input.reference)
    if (!target) throw new Error('这份文档不在该技能的参考资料中')
    reference = references.find(item => item.path === input.reference)
    body = fs.readFileSync(target, 'utf8').replace(FRONT, '').replaceAll('\r\n', '\n')
  }
  return { ...skill, body: displayBody(body), references, reference }
}

/** 应用自带技能的名字；助手学到的技能不能和它们重名。 */
export function coreSkillNames() {
  return CORES.flatMap((name) => {
    try { return load(fs.readFileSync(path.join(CORE_ROOT, name, 'SKILL.md'), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)?.[1] ?? '')?.name ?? [] } catch { return [] }
  })
}

/** 每份 core 归哪个可以关掉的插件；不在这里的始终交给引擎（zju 的各个模块由它自己按开关拒绝）。 */
const CORE_PLUGIN = { learn: 'campus.learn', weread: 'campus.wechat', wechat: 'campus.wechat-chat', dingtalk: 'campus.dingtalk', mail: 'campus.mail' }

/** 自带技能交给引擎时正文前面的一句：里面的校园命令是 zju 的，没加载 zju 就不知道怎么执行。 */
const FLOW_LEAD = '这是应用自带的技能。正文里的校园命令（`zdbk …`、`xuezai …`、`zhiyun …`、`cc98 …` 这样的）由 zju 技能执行：还没加载 zju 的先加载它，照它开头写的办法运行命令；`campus_*`、`schedule_*` 是直接可用的工具。正文链到的 references/、templates/ 按需读。'

/**
 * 注册校园、学习和公众号技能，应用自带的技能（core/skills/，一个文件夹一个），以及助手学到的技能（learned，见 learned.mjs）。
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
    // 自带技能（core/skills/）：名字是文件夹名，说明是「给人看的名字：什么时候用」。它里面的链接是相对它自己那个文件夹写的。没写什么时候用的不单独列。
    const flowEntries = () => (flowNotes?.flows() ?? []).filter(flow => !flow.parent && flow.description).map(flow => ({
      name: flow.name, description: `${flow.label}：${flow.description}`, path: flow.file, source: 'custom', provider,
      resourceBase: { kind: 'directory', path: flow.dir }, rank: 145, locator: flow.file,
      invocation: { modelInvocable: true, userInvocable: true }, content: `${`${FLOW_LEAD}\n\n${flow.text}${flowNotes.notesSection(flow.name)}`.trimEnd()}\n`,
    }))
    // 和工作流重名的不交给引擎（存的时候就不让重名，这里挡的是早先存下的）。
    const learnedEntries = () => (learned?.list() ?? []).filter(skill => !coreSkillNames().includes(skill.name) && !(flowNotes?.flows() ?? []).some(flow => flow.name === skill.name)).map(skill => ({
      name: skill.name, description: `${skill.title}：${skill.description}`, path: skill.path, source: 'custom', provider,
      resourceBase: { kind: 'directory', path: skill.root }, rank: 140, locator: skill.path,
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
        invocation: { modelInvocable: true, userInvocable: WORKFLOWS.has(name) }, content: raw.slice(match[0].length) + (name === 'zju' ? flowNotes?.section() ?? '' : '') }]
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
