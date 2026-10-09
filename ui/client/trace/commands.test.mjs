import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildCommands, renderCommands, shortLabel } from './gen-commands.mjs'
import { MODULE_SITES } from './sites.ts'

test('commands.gen.ts 和 ZJU Core 现在的命令树一致', async () => {
  const committed = fs.readFileSync(new URL('./commands.gen.ts', import.meta.url), 'utf8')
  assert.equal(committed, await renderCommands(), 'core 的命令变了，重新运行 node ui/client/trace/gen-commands.mjs')
})

test('每条命令都有给人看的名字，访问网站的模块都有网站名', async () => {
  const commands = await buildCommands()
  const modules = new Set()
  for (const [path, entry] of Object.entries(commands)) {
    assert.ok(entry.label.length > 0, `${path} 没有名字`)
    modules.add(path.split(' ')[0])
  }
  const unnamed = [...modules].filter(name => MODULE_SITES[name] === undefined).sort()
  assert.deepEqual(unnamed, ['doc', 'profile'], '不在 MODULE_SITES 里的只该是不访问网站的模块')
  for (const name of Object.keys(MODULE_SITES)) assert.ok(modules.has(name), `MODULE_SITES 里的 ${name} 不是 ZJU Core 的模块`)
})

test('名字取说明的第一句', () => {
  assert.equal(shortLabel('完整课表：每门课的教师、星期、节次'), '完整课表')
  assert.equal(shortLabel('本人（或指定专业）的培养方案：学分、学位'), '本人的培养方案')
  assert.equal(shortLabel('搜帖子标题。服务端只做子串匹配'), '搜帖子标题')
  assert.equal(shortLabel('报名一个活动并回查，加 --cancel 是取消报名'), '报名一个活动')
})
