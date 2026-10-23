/**
 * 一条命令重截全部演示截图：
 *   node video/demo/run.mjs                 全部重来（搭副本、清数据、起实例、造对话、截图）
 *   node video/demo/run.mjs --only affairs,schedule   只截这几组（组名见下面 GROUPS）
 *   node video/demo/run.mjs --keep           截完不关实例，方便手动看
 * 截图输出在 video/assets/shots/，片段在 video/assets/clips/，静态快照在 video/out/shots-html/（不进仓库）。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stage, STAGE } from './stage.mjs'
import { launch, resetData, DATA } from './instance.mjs'
import { buildFixtures } from './fixtures.mjs'
import { coreTable } from './core-data.mjs'
import { startModelServer } from './model-server.mjs'
import { SCENARIOS, HISTORY, helpers } from './chats.mjs'
import { Driver } from './driver.mjs'
import * as pages from './shots-pages.mjs'
import * as chats from './shots-chats.mjs'
import { clips } from './clips.mjs'
import { schedules } from './shots-schedule.mjs'
import { setClock, clockEnv } from './clock.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const VIDEO = path.resolve(here, '..')
// 截图和片段直接放进片子用的 assets/；静态快照只给核对用，放在不进仓库的 out/ 里
const OUT = path.join(VIDEO, 'assets', 'shots')
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null
const keep = args.includes('--keep')

const GROUPS = [
  ['history', chats.history],
  ['trace', chats.trace],
  ['confirm', chats.confirm],
  ['now', d => d.clock(0)],
  ['affairs', pages.affairs],
  ['memo', pages.memoAi],
  ['schedule', pages.schedule],
  ['learning', pages.learning],
  ['plugins', pages.plugins],
  ['profile', pages.profile],
  ['newchat', chats.newChat],
  // 讲解窗口放最后：它关掉以后主窗口有时不再出画面，后面的截图会等不到
  ['film', chats.film],
  ['tray', chats.tray],
  // 录片段，只在 --only 里点名时跑
  ['clips', clips, { optional: true }],
  // 定时任务那几张：时间线和历史对话穿插，单独跑（--only schedules），不和上面的混在一起
  ['schedules', schedules, { optional: true }],
]

// 录片段用调试协议的 screencast，离屏渲染时它按真实窗口的大小出画面（和 1600×1000 对不上），所以录片段时照常开窗口。
if (only?.includes('clips')) process.env.CAMPUS_DEMO_OFFSCREEN = '0'
console.log('stage ->', stage())
resetData()
mkdirSync(path.join(STAGE, 'core', 'demo-data'), { recursive: true })
writeFileSync(path.join(STAGE, 'core', 'demo-data', 'core.json'), JSON.stringify(coreTable(), null, 1))
const fixtures = await buildFixtures(STAGE)
await chats.seedFiles()

const gates = new Map(), finished = new Set(), started = new Set()
const model = await startModelServer({
  scenarios: SCENARIOS, helpers, logFile: path.join(DATA, 'model.log'),
  gate: async (scenario, step) => { const wait = gates.get(`${scenario}:${step}`); if (wait) await wait() },
  onServe: ({ scenario, final }) => { if (scenario) started.add(scenario); if (final && scenario) finished.add(scenario) },
})
// 引擎的钟从最早那段历史对话之前起步，之后只往前拨
setClock(Math.max(...HISTORY.map(item => item.ago)) + 30)
const app = await launch({ modelUrl: model.url, env: clockEnv() })
const driver = new Driver(app.cdp, OUT, { htmlDir: path.join(VIDEO, 'out', 'shots-html'), clipsDir: path.join(VIDEO, 'assets', 'clips') })
driver.gates = gates
driver.finished = finished
driver.started = started
driver.app = app
/** 把应用关掉重开（同一个数据目录），钟拨到「现在」往前 minutes 分钟；引擎的定时任务只在启动时重新算下一次。 */
driver.relaunch = async (minutes) => {
  await driver.app.close()
  setClock(minutes)
  const next = await launch({ modelUrl: model.url, env: clockEnv() })
  driver.cdp = next.cdp
  driver.app = next
  await driver.prepare(fixtures)
  await driver.clock(minutes - 0.05)
}
await driver.prepare(fixtures)

const failures = []
for (const [name, run, { optional = false } = {}] of GROUPS) {
  if (only ? !only.includes(name) : optional) continue
  console.log(`== ${name}`)
  try { await run(driver) } catch (error) { failures.push(`${name}: ${error.message}`); console.error(`!! ${name}: ${error.stack}`) }
}
console.log('passed through to the real engine:', await driver.eval('JSON.stringify(__demo.passed)'))
// 只截了几组时，和上一次的清单合起来
let previous = []
try { previous = only ? JSON.parse(readFileSync(path.join(OUT, 'shots.json'), 'utf8')) : [] } catch { /* 第一次 */ }
const names = new Set(driver.shots.map(shot => shot.name))
writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify([...previous.filter(shot => !names.has(shot.name)), ...driver.shots], null, 2) + '\n')
if (failures.length) console.log('FAILED:\n' + failures.join('\n'))
if (!keep) { await driver.app.close(); await model.close() }
else console.log(`instance kept open (debug port ${app.port}); Ctrl+C to quit`)
