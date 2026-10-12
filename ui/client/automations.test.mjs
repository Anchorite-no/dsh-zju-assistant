import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { AUTOMATION_EXAMPLES } from './automations.ts'

const reference = fs.readFileSync(fileURLToPath(new URL('../../core/zju/references/schedule.md', import.meta.url)), 'utf8')
/** schedule.md「常用的几种」那张表：任务名 → 到点要执行的原话。 */
const rows = new Map([...reference.matchAll(/^\| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)].map(([, title, , prompt]) => [title.trim(), prompt.trim()]))

test('页面上的每个示例，助手那边的说明里都有同名的一行，写着到点要做什么', () => {
  assert.ok(AUTOMATION_EXAMPLES.length >= 5)
  for (const example of AUTOMATION_EXAMPLES) {
    const prompt = rows.get(example.title)
    assert.ok(prompt, `schedule.md 里没有「${example.title}」`)
    // 到点只看这一段也要能做：说了用哪个技能，说了查到以后怎么提醒。
    assert.match(prompt, /^用 zju 技能/, example.title)
    assert.match(prompt, /campus_notify/, example.title)
    // 放进输入框的那段话带着任务名，助手才知道照哪一行建。
    assert.ok(example.ask.includes(`「${example.title}」`), example.title)
    // 输入框把 @ 当成「提到一个文件或对话」的开头，放进去的话里带着它会被吃掉（2026-10-12 在隔离的引擎里见到的）。
    assert.doesNotMatch(example.ask, /@/, example.title)
    assert.ok(example.when && example.does)
  }
  assert.equal(new Set(AUTOMATION_EXAMPLES.map(example => example.title)).size, AUTOMATION_EXAMPLES.length)
})

test('示例里没有替用户到点去改学校系统的：只查，查到了提醒', () => {
  for (const example of AUTOMATION_EXAMPLES) {
    assert.doesNotMatch(rows.get(example.title), /ZJU_ALLOW_WRITE|--confirm/, example.title)
  }
})
