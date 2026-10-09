import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { APP_PLUGINS } from './catalog.mjs'

/** 可以单独关掉的校园功能。校园账号是各项共用的基础，不在里面，它管的模块始终可用。 */
const SWITCHABLE = Object.fromEntries(APP_PLUGINS.filter(plugin => !plugin.base).map(plugin => [plugin.id, plugin]))

const split = value => (value ?? '').split(',').map(name => name.trim().toLowerCase()).filter(Boolean)

/**
 * 插件页上校园功能的开关。关掉的功能写进 ZJU 技能自带的 ZJU_DISABLED_MODULES，
 * 之后启动的命令会被技能自己拒绝；同时在模型上下文里说明，免得它去试。
 */
export class PluginSwitches {
  constructor(store, env = process.env) {
    this.store = store
    this.env = env
    // 启动环境里原有的禁用项不归我们管，始终保留。
    this.inherited = split(env.ZJU_DISABLED_MODULES)
    this.apply()
  }
  disabled() {
    const file = this.store.file('plugins.json')
    if (!fs.existsSync(file)) return []
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')).disabled
    return Array.isArray(saved) ? saved.filter(id => Object.hasOwn(SWITCHABLE, id)) : []
  }
  snapshot() { return { disabled: this.disabled() } }
  set(input) {
    if (!Object.hasOwn(SWITCHABLE, input?.id) || typeof input.enabled !== 'boolean') throw new Error('无效的插件开关')
    return this.store.locked(() => {
      const disabled = new Set(this.disabled())
      if (input.enabled) disabled.delete(input.id)
      else disabled.add(input.id)
      const file = this.store.file('plugins.json'), temp = `${file}.${randomUUID()}.tmp`
      fs.mkdirSync(path.dirname(file), { recursive: true })
      try { fs.writeFileSync(temp, JSON.stringify({ disabled: [...disabled] }, null, 2) + '\n'); fs.renameSync(temp, file) }
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
  /** 给模型的一句说明；没有关掉的功能时为空。 */
  promptText() {
    const disabled = this.disabled()
    if (!disabled.length) return ''
    const names = disabled.map(id => { const plugin = SWITCHABLE[id]; return plugin.modules ? `${plugin.title}（zju 的 ${plugin.modules.join('、')}）` : `${plugin.title}（独立采集模块）` }).join('；')
    return `用户在「插件」页关闭了这些校园功能：${names}。不要调用对应模块的命令；用户需要时，请他到「插件」页打开。`
  }
}
