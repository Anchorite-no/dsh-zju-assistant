/**
 * 对话那一边：造历史对话、「大物最近有什么要做的」一步步长出来的执行过程、交作业前请求确认、新会话首页、讲解播放窗口。
 * 对话是真的：在页面里打字发出去，引擎去问本机的假模型（chats.mjs 的剧本），再真的跑工具（副本里的假 core）。
 */
import { mkdirSync, utimesSync, writeFileSync, copyFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dump } from '../../../node_modules/js-yaml/dist/js-yaml.mjs'
import { MEMOS } from './data.mjs'
import { MEMORY, FILMS, filmId } from './learning.mjs'
import { HISTORY, PHYS, CONFIRM } from './chats.mjs'
import { DATA, DOCS } from './instance.mjs'
import { REPO } from './stage.mjs'
import { sleep, SNAPSHOT } from './driver.mjs'
import { Cdp, targets } from './cdp.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

/** 档案里的备忘和记忆也写一份进隔离实例，助手在对话里读到的和页面上一致。讲解成品放进假的「文档」。 */
export async function seedFiles() {
  const write = (folder, note) => {
    const dir = path.join(DATA, 'profile', folder)
    mkdirSync(dir, { recursive: true })
    const meta = {}
    if (note.tags.length) meta.tags = note.tags
    for (const item of note.properties) meta[item.key] = item.value
    const front = Object.keys(meta).length ? `---\n${dump(meta, { lineWidth: -1, flowLevel: 1 })}---\n` : ''
    const file = path.join(dir, `${note.title}.md`)
    writeFileSync(file, `${front}${note.body}\n`)
    const when = new Date(note.updatedAt)
    utimesSync(file, when, when)
  }
  for (const note of MEMOS) write('notes', note)
  for (const note of MEMORY) write('memory', note)
  const films = path.join(DOCS, '讲解', 'dist')
  mkdirSync(films, { recursive: true })
  // 讲解用应用自带的讲解引擎现打一集（film/avl），三条做好的讲解都放这一份。
  const built = spawnSync(process.execPath, [path.join(REPO, 'core', 'learn', 'engine', 'build.mjs'), path.join(here, 'film', 'avl')], { encoding: 'utf8' })
  if (built.status !== 0) throw new Error(`讲解打包失败：${built.stderr}`)
  for (const film of FILMS.filter(item => item.state === 'done')) copyFileSync(path.join(here, 'film', 'avl', 'build', 'avl.html'), path.join(films, filmId(film)))
}

/** 等模型把这一段的最后一步（正文）发完，页面也停下来。 */
export async function settle(d, scenario, timeoutMs = 90_000) {
  const until = Date.now() + timeoutMs
  while (!d.finished.has(scenario)) {
    if (Date.now() > until) throw new Error(`对话「${scenario}」一直没有说完`)
    await sleep(200)
  }
  await sleep(2500)
}

async function newChat(d) {
  await d.clickAt(`[...document.querySelectorAll('button')].find(el => __tools.visible(el) && el.getBoundingClientRect().top < 200 && el.innerText.includes('新会话'))`, '新会话按钮')
  await d.waitFor(`document.querySelector('[contenteditable=true], textarea')`)
  await sleep(800)
}

/** 发出去：打字、回车；模型那边没收到就再点一次发送按钮。id 是剧本的编号，用来确认请求到了。 */
async function send(d, text, id) {
  d.started.delete(id)
  await d.eval(`(() => { const el = [...document.querySelectorAll('[contenteditable=true], textarea')].filter(el => __tools.visible(el)).pop(); el.focus(); return true })()`)
  await d.type(text)
  await sleep(300)
  await d.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
  await d.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  for (let attempt = 0; attempt < 3; attempt++) {
    const until = Date.now() + 6000
    while (Date.now() < until) { if (d.started.has(id)) return; await sleep(200) }
    await d.clickAt(`document.querySelector('button[aria-label="发送消息"]')`, '发送按钮').catch(() => {})
  }
  throw new Error(`「${id}」发不出去`)
}

/** 历史对话：从几天前开始一段一段造，引擎的钟跟着往前拨。 */
export async function history(d) {
  for (const scenario of [...HISTORY].sort((a, b) => b.ago - a.ago)) await askChat(d, scenario)
}

/** 一段对话：钟拨到它的时间，开新会话，问，等说完。 */
export async function askChat(d, scenario) {
  await d.clock(scenario.ago)
  await newChat(d)
  await send(d, scenario.prompt, scenario.id)
  await settle(d, scenario.id)
  console.log(`  chat ${scenario.title}`)
}

/** 对话页上要记位置的：执行过程的每一行和线路上的节点、对话正文、输入框。 */
const TRACE = [
  ['composer', '[contenteditable=true], textarea'],
  ['trace.pane', '.campus-trace'],
  ['trace.summary', '.campus-trace-summary'],
  ['trace.graph', '.campus-trace-graph'],
  ['trace.node', '.campus-trace-graph circle', { list: true }],
  ['trace.row', '.campus-trace-row', { list: true }],
  ['trace.site', '.campus-trace-site', { list: true }],
  ['trace.what', '.campus-trace-what', { list: true }],
  ['trace.result', '.campus-trace-result', { list: true }],
  ['trace.detail', '.campus-trace-detail'],
  ['chat.table', '[class*=markdown] table, table', { list: true }],
  ['chat.list', '[class*=markdown] ol', { list: true }],
  ['sidebar.session', 'a[href*="session"], [data-session-id]', { list: true }],
]

/** 「大物最近有什么要做的」：发出去以后每隔两步停一下截一张，最后截说完的样子。 */
export async function trace(d) {
  await d.clock(6)
  const stops = [1, 2, 4, 6, 7]
  const waiting = new Map()
  for (const step of stops) d.gates.set(`phys:${step}`, () => new Promise((resolve) => { waiting.set(step, resolve) }))
  await newChat(d)
  await d.eval(`(() => { const el = [...document.querySelectorAll('[contenteditable=true], textarea')].filter(el => __tools.visible(el)).pop(); el.focus(); return true })()`)
  await d.type(PHYS.prompt)
  await d.park()
  await d.shot('chat-trace-0', { spec: TRACE, note: '新会话里打好了问题，还没发' })
  await d.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
  await d.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  let index = 1
  for (const step of stops) {
    const until = Date.now() + 60_000
    while (!waiting.has(step)) { if (Date.now() > until) throw new Error(`执行过程停不到第 ${step} 步`); await sleep(150) }
    await sleep(1800)
    await d.park()
    await d.shot(`chat-trace-${index++}`, { spec: TRACE, note: `执行过程长到第 ${step} 步之前（前面的工具都跑完了，模型在想下一步）` })
    waiting.get(step)()
  }
  await settle(d, 'phys')
  await d.park()
  await d.shot(`chat-trace-${index++}`, { spec: TRACE, note: '说完了：正文是按时间排的表，右边执行过程是完整的一条线' })
  // 点开执行过程里「学在浙大 · 汇总还没交的作业和测验」那一行：看到这一步读到的前几条
  await d.clickAt(`[...document.querySelectorAll('.campus-trace-line')].find(el => el.innerText.includes('汇总还没交'))`, '学在浙大那一行')
  await sleep(800)
  await d.park()
  await d.shot(`chat-trace-${index++}`, { spec: TRACE, note: '点开执行过程里学在浙大那一行：这一步读到的作业标题和「看命令」' })
  for (const step of stops) d.gates.delete(`phys:${step}`)
}

/** 交作业前请求确认：模型读完要求和文件以后，用「向你提问」请用户确认。 */
export async function confirm(d) {
  await d.clock(3)
  await newChat(d)
  await send(d, CONFIRM.prompt, CONFIRM.id)
  await d.waitFor(`[...document.querySelectorAll('button')].some(el => __tools.visible(el) && el.innerText.includes('确认提交'))`, 60_000, '确认提交的选项')
  await sleep(1500)
  await d.park()
  await d.shot('write-confirm', { spec: [...TRACE, ['question.button', 'button', { list: true }]], note: '提交作业前，助手用「向你提问」请用户确认：提交哪个文件、交到哪、截止时间，两个选项' })
  await d.clickAt(`[...document.querySelectorAll('button')].find(el => __tools.visible(el) && el.innerText.includes('确认提交'))`, '确认提交')
  await sleep(600)
  const submit = await d.eval(`[...document.querySelectorAll('button')].find(el => __tools.visible(el) && /^(提交|发送|确定|确认)$/.test(el.innerText.trim()))?.innerText ?? ''`)
  if (submit) await d.clickAt(`[...document.querySelectorAll('button')].find(el => __tools.visible(el) && /^(提交|发送|确定|确认)$/.test(el.innerText.trim()))`, '提交答案')
  await settle(d, 'confirm')
  await d.park()
  await d.shot('write-confirm-done', { spec: TRACE, note: '用户点了「确认提交」以后：执行过程里多了一步带写操作标记的「提交个人作业」，回答里是回查到的提交记录' })
}

/** 新会话首页。 */
export async function newChatShot(d) {
  await d.clock(1)
  await newChat(d)
  await d.park()
  await d.shot('new-chat', { spec: [['composer', '[contenteditable=true], textarea'], ['sidebar.session', 'a[href*="session"], [data-session-id]', { list: true }]], note: '新会话首页，左边侧栏里是之前的十几段对话' })
}
export { newChatShot as newChat }

/** 讲解播放窗口：学习页上点「播放」，壳另开一个窗口放讲解，截那个窗口。 */
export async function film(d) {
  // 学习页停在上一组截完的地方：数据结构基础最近一次课，右栏「讲解」那一节有「播放」
  await d.nav('学习')
  const play = `[...document.querySelectorAll('button')].some(el => el.innerText.trim() === '播放')`
  if (!await d.eval(play)) {
    // 不在那一次课上：从课程点进数据结构基础，再点最近一次课
    await d.waitFor(`[...document.querySelectorAll('.campus-notice-open, button')].some(el => el.innerText.includes('数据结构基础'))`, 15_000, '数据结构基础')
    await d.clickAt(`[...document.querySelectorAll('.campus-learn-a .campus-notice-open')].find(el => el.innerText.includes('数据结构基础'))`, '数据结构基础').catch(() => {})
    await sleep(1200)
    await d.clickAt(`[...document.querySelectorAll('button')].find(el => __tools.visible(el) && el.getBoundingClientRect().left > 900 && /第\\s*\\d+\\s*次/.test(el.innerText))`, '最近一次课')
  }
  await d.waitFor(play, 15_000, '播放按钮')
  // 这一次课的内容刚读完时版面还会动一下，等它停稳再点；没开出窗口就再点一次
  await sleep(1500)
  const before = new Set((await targets(d.app.port)).map(target => target.id))
  let page
  for (let attempt = 0; attempt < 3 && !page; attempt++) {
    await d.clickAt(`[...document.querySelectorAll('button')].find(el => el.innerText.trim() === '播放')`, '播放讲解')
    const until = Date.now() + 6000
    while (!page && Date.now() < until) {
      page = (await targets(d.app.port)).find(target => target.type === 'page' && !before.has(target.id))
      if (!page) await sleep(300)
    }
  }
  if (!page) throw new Error('讲解窗口没有打开')
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl)
  // 讲解窗口被主窗口挡着时截不到画面，先把它提到前面。
  await cdp.send('Page.bringToFront', {}, 10_000).catch(() => {})
  await cdp.send('Page.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 2, mobile: false })
  await sleep(3000)
  // 跳到「以 20 为轴向右旋转」那一句的中间（播放器：→ 往后 5 秒，Shift+→ 往后 1 秒）
  const key = async (shift) => {
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, modifiers: shift ? 8 : 0 })
  }
  await cdp.eval(`document.body.focus(), true`)
  for (let i = 0; i < 4; i++) await key(false)
  await sleep(1200)
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, 20_000)
  writeFileSync(path.join(d.outDir, 'film.png'), Buffer.from(shot.data, 'base64'))
  const elements = await cdp.eval(`(() => { const out = []; for (const el of document.querySelectorAll('canvas, svg, h1, h2, [class*=sub], [class*=caption], [class*=control], button')) { const r = el.getBoundingClientRect(); if (r.width && r.height) { const kind = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''); const id = kind.replace(/[^a-z0-9]+/gi, '-') + '-' + out.length; el.setAttribute('data-demo-id', id); out.push({ name: kind + '[' + out.length + ']', id, kind, text: (el.innerText ?? '').trim().slice(0, 80), x: r.left, y: r.top, w: r.width, h: r.height }) } } return out })()`)
  writeFileSync(path.join(d.outDir, 'film.json'), JSON.stringify({ image: 'film.png', logical: { width: 1600, height: 1000 }, scale: 2, pixels: { width: 3200, height: 2000 }, origin: 'top-left, logical px (multiply by scale for image px)', note: '学习页点「播放」以后另开的讲解窗口：数据结构基础「AVL 树的四种旋转」', elements }, null, 2) + '\n')
  // 讲解窗口的静态快照（画布换成当时的画面）
  await cdp.eval(`${SNAPSHOT}
;true`)
  mkdirSync(path.join(d.outDir, 'html'), { recursive: true })
  writeFileSync(path.join(d.outDir, 'html', 'film.html'), await cdp.eval('__snapshot()'))
  d.shots.push({ name: 'film', count: elements.length })
  console.log(`shot film (${elements.length} elements)`)
  // 关掉讲解窗口，主窗口回到前面
  await cdp.eval('window.close(), true').catch(() => {})
  cdp.close()
  await d.cdp.send('Page.bringToFront', {}, 10_000).catch(() => {})
}

/** 托盘提醒是系统的托盘气泡，不在页面里，截不到（见 README）。 */
export async function tray() {}
