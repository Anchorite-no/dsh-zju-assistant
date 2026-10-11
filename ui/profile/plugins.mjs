import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { APP_PLUGINS } from './catalog.mjs'

/** 可以单独关掉的校园功能。校园账号是各项共用的基础，不在里面，它管的模块始终可用。 */
const SWITCHABLE = Object.fromEntries(APP_PLUGINS.filter(plugin => !plugin.base).map(plugin => [plugin.id, plugin]))

/** 默认关着、要用户自己打开的那几项（接入表里标了 optIn）。 */
const OPT_IN = Object.keys(SWITCHABLE).filter(id => SWITCHABLE[id].optIn)

const split = value => (value ?? '').split(',').map(name => name.trim().toLowerCase()).filter(Boolean)

/**
 * 插件页上校园功能的开关。关掉的功能写进 ZJU 技能自带的 ZJU_DISABLED_MODULES，
 * 之后启动的命令会被技能自己拒绝；同时在模型上下文里说明，免得它去试。
 * 存在档案目录的 plugins.json 里，两张单子：disabled 是默认开着、被用户关掉的；enabled 是默认关着、被用户打开的。
 * 对外只给一张「现在关着的」（disabled()），用的地方不用管哪一项默认是什么。
 */
export class PluginSwitches {
  constructor(store, env = process.env) {
    this.store = store
    this.env = env
    // 启动环境里原有的禁用项不归我们管，始终保留。
    this.inherited = split(env.ZJU_DISABLED_MODULES)
    this.apply()
  }
  /** 文件里记着的两张单子，不认识的和放错单子的不要。 */
  saved() {
    const file = this.store.file('plugins.json')
    const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
    const ids = (value, keep) => Array.isArray(value) ? value.filter(id => Object.hasOwn(SWITCHABLE, id) && keep(id)) : []
    return { disabled: ids(data.disabled, id => !OPT_IN.includes(id)), enabled: ids(data.enabled, id => OPT_IN.includes(id)) }
  }
  /** 现在关着的：用户关掉的，加上默认关着而用户没打开的。 */
  disabled() {
    const { disabled, enabled } = this.saved()
    return [...disabled, ...OPT_IN.filter(id => !enabled.includes(id))]
  }
  snapshot() { return { disabled: this.disabled() } }
  set(input) {
    if (!Object.hasOwn(SWITCHABLE, input?.id) || typeof input.enabled !== 'boolean') throw new Error('无效的插件开关')
    return this.store.locked(() => {
      const saved = this.saved(), disabled = new Set(saved.disabled), enabled = new Set(saved.enabled)
      // 默认关着的一项记在 enabled 里，别的记在 disabled 里。
      if (OPT_IN.includes(input.id)) { if (input.enabled) enabled.add(input.id); else enabled.delete(input.id) }
      else if (input.enabled) disabled.delete(input.id)
      else disabled.add(input.id)
      const file = this.store.file('plugins.json'), temp = `${file}.${randomUUID()}.tmp`
      fs.mkdirSync(path.dirname(file), { recursive: true })
      try { fs.writeFileSync(temp, JSON.stringify({ disabled: [...disabled], enabled: [...enabled] }, null, 2) + '\n'); fs.renameSync(temp, file) }
      finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
      this.apply()
      return this.snapshot()
    })
  }
  apply() {
    const modules = [...new Set([...this.inherited, ...this.disabled().flatMap(id => SWITCHABLE[id].modules ?? [])])]
    if (modules.length) this.env.ZJU_DISABLED_MODULES = modules.join(',')
    else delete this.env.ZJU_DISABLED_MODULES
    if (this.disabled().includes('campus.wechat')) this.env.CAMPUS_WECHAT_DISABLED = '1'
    else delete this.env.CAMPUS_WECHAT_DISABLED
  }
  /** 给模型的一句说明；没有关着的功能时为空。默认关着、用户还没打开的也在里面，所以不说是用户关的。 */
  promptText() {
    const disabled = this.disabled()
    if (!disabled.length) return ''
    const names = disabled.map((id) => {
      const plugin = SWITCHABLE[id]
      return plugin.modules ? `${plugin.title}（zju 的 ${plugin.modules.join('、')}）` : plugin.backend === 'learn' ? `${plugin.title}（learn 技能，做讲解）` : `${plugin.title}（独立采集模块）`
    }).join('；')
    return `这些功能在「插件」页关着：${names}。不要调用对应模块的命令，也不要绕过去自己做；用户需要时，请他到「插件」页打开。`
  }
}
