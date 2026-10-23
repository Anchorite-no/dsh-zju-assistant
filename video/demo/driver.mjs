/**
 * 截图用的几样手段：注入假接口、定窗口大小、按文字点东西、等元素出现、截 2 倍图并记下关键元素的位置。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setClock } from './clock.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
export const WIDTH = 1600, HEIGHT = 1000, SCALE = 2
/** 存静态快照的页面脚本（snapshot.js）。 */
export const SNAPSHOT = readFileSync(path.join(here, 'snapshot.js'), 'utf8')
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** 页面里用的小工具：找元素、量位置。 */
const PAGE_TOOLS = `
window.__tools = {
  visible(el) {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
  },
  text(el) { return (el.innerText ?? el.textContent ?? '').trim().replace(/\\s+/g, ' ').slice(0, 160) },
  /** 文字正好是 text（或包含，loose 时）的可见元素里最里面的那个。 */
  byText(text, { within = document, loose = false, selector = '*' } = {}) {
    const all = [...within.querySelectorAll(selector)].filter(el => this.visible(el))
    const hit = all.filter(el => { const t = this.text(el); return loose ? t.includes(text) : t === text })
    return hit.find(el => !hit.some(other => other !== el && el.contains(other))) ?? null
  },
  rect(el) { const r = el.getBoundingClientRect(); return { x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 } },
  /** spec：[[名字, 选择器, { text: 取文字的子选择器, all: 不只要可见的 }]]。多个时名字后面加序号。 */
  /**
   * 每个量到的元素在页面上打一个 data-demo-id（「notice-3」「trace-row-5」，类别里的点换成横杠，列表的加序号），
   * 静态快照里靠它找元素；同一个元素被两类量到时，几个编号用空格隔开（用 [data-demo-id~="notice-3"] 选）。
   */
  rects(spec) {
    for (const el of document.querySelectorAll('[data-demo-id]')) el.removeAttribute('data-demo-id')
    const out = []
    for (const [name, selector, opts = {}] of spec) {
      const els = [...document.querySelectorAll(selector)].filter(el => opts.all || this.visible(el))
      els.forEach((el, index) => {
        const source = opts.text ? el.querySelector(opts.text) ?? el : el
        const list = els.length > 1 || opts.list
        const id = name.split('.').join('-') + (list ? '-' + index : '')
        el.setAttribute('data-demo-id', [el.getAttribute('data-demo-id'), id].filter(Boolean).join(' '))
        out.push({ name: list ? name + '[' + index + ']' : name, id, kind: name, text: this.text(source), ...this.rect(el) })
      })
    }
    return out
  },
}
`

export class Driver {
  /** outDir 放截图和坐标，htmlDir 放静态快照，clipsDir 放录的片段。 */
  constructor(cdp, outDir, { htmlDir, clipsDir }) {
    this.cdp = cdp
    this.outDir = outDir
    this.htmlDir = htmlDir
    this.clipsDir = clipsDir
    this.shots = []
    mkdirSync(outDir, { recursive: true })
  }

  /** 每次加载页面都在应用代码之前跑：假接口、钟、小工具。 */
  async prepare(fixtures) {
    const inject = `const FIXTURES = ${JSON.stringify(fixtures)};\n${readFileSync(path.join(here, 'inject.js'), 'utf8')}\n${PAGE_TOOLS};\n${SNAPSHOT}`
    await this.cdp.send('Page.enable')
    await this.cdp.send('Runtime.enable')
    await this.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: inject })
    await this.cdp.send('Page.bringToFront').catch(() => {})
    await this.cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {})
    await this.viewport()
    await this.cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
    await this.reload()
  }

  async viewport() {
    await this.cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: SCALE, mobile: false })
  }

  async reload() {
    const loaded = new Promise((resolve) => { const off = this.cdp.on((message) => { if (message.method === 'Page.loadEventFired') { off(); resolve() } }) })
    await this.cdp.send('Page.reload', { ignoreCache: true })
    await loaded
    await this.waitFor(`!!window.__tools && document.body.innerText.includes('校园事务')`, 30_000)
    await sleep(1500)
  }

  eval(expression) { return this.cdp.eval(expression) }

  /** 引擎和页面的钟一起拨到「演示的现在」再往前 minutes 分钟（只往前拨）。 */
  async clock(minutes) {
    const target = setClock(minutes)
    if (target !== null) await this.cdp.eval(`window.__demoSetNow(${target})`)
    await sleep(400)
  }

  async waitFor(expression, timeoutMs = 15_000, label = expression) {
    const until = Date.now() + timeoutMs
    for (;;) {
      try { if (await this.cdp.eval(`!!(${expression})`)) return } catch { /* 页面还在换 */ }
      if (Date.now() > until) throw new Error(`等不到：${label}`)
      await sleep(150)
    }
  }

  /** 点一个元素：expression 在页面里算出这个元素。用真的鼠标事件点它的中心。 */
  async clickAt(expression, label = expression) {
    // 先滚到看得见（不用平滑滚动），等一下再量位置，免得点在滚动途中的旧位置上
    const found = await this.cdp.eval(`(() => { const el = ${expression}; if (!el) return false; const r = el.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: 'center', behavior: 'instant' }); return true })()`)
    if (!found) throw new Error(`找不到要点的：${label}`)
    await sleep(250)
    const box = await this.cdp.eval(`(() => { const el = ${expression}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
    if (!box) throw new Error(`找不到要点的：${label}`)
    await this.mouse(box.x, box.y)
  }

  async mouse(x, y) {
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
  }

  async hover(expression) {
    const box = await this.cdp.eval(`(() => { const el = ${expression}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
    if (box) await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y })
  }

  /** 把鼠标挪到不碍事的地方，免得 hover 的样式留在图上。 */
  async park() { await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: WIDTH - 4, y: HEIGHT - 4 }) }

  clickText(text, opts = {}) {
    return this.clickAt(`__tools.byText(${JSON.stringify(text)}, ${JSON.stringify(opts)})`, text)
  }

  /** 侧栏上的一项（插件、日程表、校园事务、学习、设置）。 */
  async nav(text) {
    await this.clickAt(`[...document.querySelectorAll('*')].filter(el => __tools.visible(el) && el.getBoundingClientRect().left < 340 && __tools.text(el) === ${JSON.stringify(text)}).pop()`, `侧栏「${text}」`)
    await sleep(900)
  }

  async type(text) {
    await this.cdp.send('Input.insertText', { text })
  }

  /** 截一张：name.png（3200×2000）和 name.json（关键元素的位置，逻辑像素）。 */
  async shot(name, { spec = [], extra = [], note = '' } = {}) {
    await sleep(250)
    const elements = [...await this.cdp.eval(`__tools.rects(${JSON.stringify([...COMMON, ...spec])})`), ...extra]
    const shot = await this.cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(path.join(this.outDir, `${name}.png`), Buffer.from(shot.data, 'base64'))
    const meta = { image: `${name}.png`, logical: { width: WIDTH, height: HEIGHT }, scale: SCALE, pixels: { width: WIDTH * SCALE, height: HEIGHT * SCALE }, origin: 'top-left, logical px (multiply by scale for image px)', note, elements }
    writeFileSync(path.join(this.outDir, `${name}.json`), JSON.stringify(meta, null, 2) + '\n')
    // 同一时刻的静态 HTML 快照（htmlDir 里的同名.html），关键元素带 data-demo-id
    const html = await this.cdp.eval('__snapshot()')
    mkdirSync(this.htmlDir, { recursive: true })
    writeFileSync(path.join(this.htmlDir, `${name}.html`), html)
    this.shots.push({ name, note, count: elements.length })
    console.log(`shot ${name} (${elements.length} elements)`)
  }

  /** 页面上的文字里有没有报错一类的话。 */
  async problems() {
    return this.cdp.eval(`(() => { const t = document.body.innerText; return ['没读到', '出错', '失败', '没有响应', '读取中', '第一次读', '后台还是旧版本', '演示数据里没有'].filter(word => t.includes(word)) })()`)
  }
}

/** 每张图都记的：侧栏、页面标题。 */
const COMMON = [
  ['page.title', '.campus-page-title'],
]
