// 演示用的假 ZJU Core（demo/stage.mjs 把它放到副本的 core/zju/scripts/zju.ts）。数据放在 <副本>/core/demo-data：对话里跑命令的沙箱只让读 core 下面的东西。
// 不联网、不读账号：照命令「模块 对象 动作」到 <副本>/core/demo-data/core.json 里找编好的结果，包成和真 core 一样的 JSON 信封。
// 写得像普通 JS（ESM），Node 直接跑 .ts（类型擦除），不依赖别的文件。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2)
const words = []
for (const word of args) { if (word.startsWith('-')) break; words.push(word) }
const flags = {}
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('--')) continue
  const name = args[i].slice(2)
  if (args[i + 1] !== undefined && !args[i + 1].startsWith('--')) flags[name] = args[++i]
  else flags[name] = true
}

const file = path.join(__dirname, '..', '..', 'demo-data', 'core.json')
let table = {}
try { table = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { /* 没有数据就都按没找到 */ }

/** 最长的那条认得的命令；条目可以按某个参数再分（match: { 参数名: { 值: 结果 } }）。 */
let entry, key
for (let n = words.length; n > 0 && !entry; n--) { key = words.slice(0, n).join(' '); entry = table[key] }

function finish(envelope, delay) {
  setTimeout(() => { process.stdout.write(JSON.stringify(envelope, null, 2) + '\n') }, delay)
}

if (!entry) {
  finish({ ok: false, error: { code: 'DEMO_UNKNOWN', message: `演示数据里没有这条命令：${words.join(' ')}` } }, 200)
} else {
  let result = entry
  if (entry.match) {
    for (const [flag, cases] of Object.entries(entry.match)) {
      const value = flags[flag]
      if (typeof value === 'string') {
        const hit = Object.keys(cases).find(name => value.includes(name) || name.includes(value))
        if (hit) { result = { ...entry, ...cases[hit] }; break }
      }
    }
  }
  const delay = typeof result.delayMs === 'number' ? result.delayMs : 600
  if (result.error) finish({ ok: false, error: result.error }, delay)
  else finish({ ok: true, ...(result.source ? { source: result.source } : {}), data: result.data ?? null }, delay)
}
