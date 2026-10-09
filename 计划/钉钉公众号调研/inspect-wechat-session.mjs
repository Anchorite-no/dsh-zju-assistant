// Read-only metadata inspection. Cookie values are deliberately never selected.
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const root = path.join(process.env.APPDATA, 'Tencent', 'xwechat', 'radium', 'web')
const profiles = path.join(root, 'profiles')
const domains = ['mp.weixin.qq.com', '.mp.weixin.qq.com', 'weixin.qq.com', '.weixin.qq.com']
const results = []
if (fs.existsSync(profiles)) {
  for (const entry of fs.readdirSync(profiles, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const file = path.join(profiles, entry.name, 'Network', 'Cookies')
    if (!fs.existsSync(file)) continue
    let db
    try {
      db = new DatabaseSync(file, { readOnly: true })
      const cookies = db.prepare(`SELECT host_key, name, path, expires_utc, is_persistent,
        length(value) AS plaintextBytes, length(encrypted_value) AS encryptedBytes
        FROM cookies WHERE host_key IN (?, ?, ?, ?)`).all(...domains)
      results.push({ profile: entry.name.split('_')[0], readable: true, cookies })
    } catch (error) {
      // Do not treat a busy database as absence of a session.
      results.push({ profile: entry.name.split('_')[0], readable: false, error: error.code || error.message })
    } finally { db?.close() }
  }
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), valueInspection: false,
  sessionValidated: false, profiles: results }, null, 2))
