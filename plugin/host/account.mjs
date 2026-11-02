import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { TRANSPORT, accountKeys, isAccountKey } from '../accounts.mjs'

const FIELDS = accountKeys()
const TRANSPORTS = TRANSPORT.options.map(option => option.value)
const revision = raw => createHash('sha256').update(raw).digest('hex')

/**
 * 各校园系统的账号、密码和校内站点的访问方式，存在档案目录的 accounts.json，ZJU Core 直接读这份文件。照 ui/profile/account.mjs 搬过来。
 * 只有插件页的配置读写它，密码原样给页面（页面默认遮住）；不进个人档案，也不给模型工具。
 */
export class AccountSettings {
  constructor(store) { this.store = store }
  file() { return this.store.file('accounts.json') }
  read() {
    const raw = fs.existsSync(this.file()) ? fs.readFileSync(this.file(), 'utf8') : ''
    let data = {}
    try { if (raw.trim()) data = JSON.parse(raw) } catch { throw new Error('账号文件 accounts.json 的内容读不了，请检查它是不是完整的 JSON。') }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('账号文件 accounts.json 的格式不对。')
    return { raw, data }
  }
  snapshot() {
    const { raw, data } = this.read()
    const value = key => typeof data[key] === 'string' && data[key] ? data[key] : key === TRANSPORT.key ? TRANSPORTS[0] : ''
    // 每个账号第一份的键总给出来（没填是空的），追加的那几份（CC98 第二个账号）有才给。
    const keys = [...FIELDS, ...Object.keys(data).filter(key => !FIELDS.includes(key) && isAccountKey(key) && value(key))]
    return { values: Object.fromEntries(keys.map(key => [key, value(key)])), revision: revision(raw) }
  }
  save(input) {
    return this.store.locked(() => {
      const { raw, data } = this.read()
      if (input?.revision !== revision(raw)) throw new Error('账号已在别处改过，请重新读取后再保存。')
      if (!input.values || typeof input.values !== 'object' || Array.isArray(input.values)) throw new Error('账号配置格式不正确')
      // 页面上没有的键（第二位场馆同伴）原样留着。
      const next = { ...data }
      for (const [key, value] of Object.entries(input.values)) {
        if (!isAccountKey(key) || typeof value !== 'string' || value.length > 1000 || /[\x00-\x1f\x7f]/.test(value)) throw new Error('账号字段格式不正确')
        const clean = /password(_\d)?$/.test(key) ? value : value.trim()
        if (clean) next[key] = clean
        else delete next[key]
      }
      if (next[TRANSPORT.key] && !TRANSPORTS.includes(next[TRANSPORT.key])) throw new Error('访问方式只能是 WebVPN 或校园网直连')
      if (next.zju_username && !/^\d{8,12}$/.test(next.zju_username)) throw new Error('统一认证学号应为 8–12 位数字')
      const file = this.file(), temp = `${file}.${randomUUID()}.tmp`
      fs.mkdirSync(path.dirname(file), { recursive: true })
      try { fs.writeFileSync(temp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(temp, file) }
      finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
      return this.snapshot()
    })
  }
}
