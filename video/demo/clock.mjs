/**
 * 引擎进程的钟（fake-clock.cjs）：对话记录里的时间、侧栏「几天前」都按它算。
 * 造历史对话时把钟拨回几天前，一段一段往前走，最后停在演示的「现在」。
 */
import { copyFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEMO_NOW } from './data.mjs'
import { DEMO_ROOT, STAGE } from './stage.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(DEMO_ROOT, 'clock.json')

let last = -Infinity

/** 把引擎的钟拨到「演示的现在」再往前 minutes 分钟；只往前拨，要往回拨时不动。返回拨到的时刻。 */
export function setClock(minutes) {
  const target = Date.parse(DEMO_NOW) - minutes * 60_000
  if (target <= last + 1000) return null
  last = target
  writeFileSync(FILE, JSON.stringify({ offsetMs: target - Date.now() }))
  return target
}

export function clockEnv() {
  const target = path.join(STAGE, 'core', 'demo-clock.cjs')
  copyFileSync(path.join(here, 'fake-clock.cjs'), target)
  return { NODE_OPTIONS: `--require "${target.split(path.sep).join('/')}"`, DEMO_CLOCK_FILE: FILE }
}
