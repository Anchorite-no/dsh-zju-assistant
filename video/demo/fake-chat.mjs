// 演示用的假聊天读取器（demo/stage.mjs 把它放成副本里的 dingtalk.mjs / dingtalk.ts / wechat.mjs）。
// 不碰本机的钉钉、微信：照「平台 操作」到 <副本>/core/demo-data/core.json 里找编好的结果（键是「dingtalk read」这样）。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const platform = path.basename(here) === 'scripts' && path.basename(path.dirname(here)) === 'wechat' ? 'wechat' : 'dingtalk'
const args = process.argv.slice(2)
const operation = args[0] === 'chat' ? args[1] : args[0]
let table = {}
try { table = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'demo-data', 'core.json'), 'utf8')) } catch { /* 没有数据 */ }
const entry = table[`${platform} ${operation}`]
const delay = typeof entry?.delayMs === 'number' ? entry.delayMs : 500
setTimeout(() => {
  const envelope = entry ? { ok: true, ...(entry.data ?? {}) } : { ok: false, status: 'demo_unknown', message: `演示数据里没有：${platform} ${operation}` }
  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n')
}, delay)
