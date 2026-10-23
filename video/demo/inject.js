/*
 * 注入到隔离实例页面里的脚本（文档开始时运行，在应用自己的代码之前）：
 * 1. 页面的钟拨到演示里的「现在」（FIXTURES.now），时间照常往前走；
 * 2. 拦下发给 /api/campus/profile 的请求，按动作回编好的数据（fixtures.mjs）；没编的照常交给引擎，并记在 __demo.passed 里。
 * 截图脚本经 window.__demo 改状态（例如让「AI 总结后添加」多等一会儿）。
 * 由 shots.mjs 在前面拼上 `const FIXTURES = {...}` 再注入。
 */
(() => {
  const F = FIXTURES
  // ── 钟 ──
  const RealDate = Date, realNow = RealDate.now.bind(RealDate)
  let offset = RealDate.parse(F.now) - realNow()
  /** 截图脚本把页面的钟和引擎的钟拨到一起。 */
  window.__demoSetNow = (ms) => { offset = ms - realNow() }
  function FakeDate(...args) {
    if (!new.target) return new RealDate(realNow() + offset).toString()
    return args.length ? new RealDate(...args) : new RealDate(realNow() + offset)
  }
  FakeDate.prototype = RealDate.prototype
  FakeDate.now = () => realNow() + offset
  FakeDate.parse = RealDate.parse
  FakeDate.UTC = RealDate.UTC
  Object.defineProperty(FakeDate, 'name', { value: 'Date' })
  window.Date = FakeDate

  // ── 档案服务 ──
  const clone = value => JSON.parse(JSON.stringify(value))
  const state = {
    memos: clone(F.memos),
    /** 加到备忘录：直接添加等多久，AI 总结等多久（截图「整理中」用）。 */
    memoDelay: { plain: 500, summary: 2500 },
    /** 为真时 AI 总结一直不回来，截图脚本截完「整理中」再放开。 */
    holdSummary: false,
    release: null,
    passed: [],
    /** 录「新通知滑进来」用：下一次刷新时读到的新条目。 */
    incoming: [],
  }
  window.__demo = state
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  const memoKey = item => item.kind === 'cc98' || !item.url ? item.id : item.url
  const mark = key => /^https?:\/\//i.test(key) ? `](${key.replace(/\(/g, '%28').replace(/\)/g, '%29')})` : `<!-- notice:${key} -->`

  async function addMemo({ id, summarize }) {
    const item = F.feed.items.find(entry => entry.id === id)
    if (!item) throw new Error('这条通知已经不在了')
    const key = memoKey(item)
    const existing = state.memos.find(note => note.body.includes(mark(key)))
    if (existing) return { title: existing.title, existed: true, summarized: false, reason: '' }
    if (summarize) {
      await sleep(state.memoDelay.summary)
      if (state.holdSummary) await new Promise(resolve => { state.release = resolve })
    } else await sleep(state.memoDelay.plain)
    const note = summarize && F.aiMemo.source === id ? clone(F.aiMemo.note)
      : { title: item.title.slice(0, 30), body: `${item.title}\n\n[原文${mark(key)}`, tags: [], properties: [{ key: '来源', value: item.from }], archived: false, updatedAt: new RealDate(FakeDate.now()).toISOString(), revision: `demo-${state.memos.length}` }
    if (!note.body.includes(mark(key))) note.body += /^https?:\/\//i.test(key) ? `\n\n[原文${mark(key)}` : `\n${mark(key)}`
    note.updatedAt = new RealDate(FakeDate.now()).toISOString()
    state.memos.unshift(note)
    return { title: note.title, existed: false, summarized: !!summarize, reason: '' }
  }

  const lessonKey = input => `${input.course}:${input.lesson}`
  const handlers = {
    'affairs-read': () => F.affairs,
    'affairs-refresh': () => F.affairs,
    'affairs-detail': input => F.details[input.id],
    'affairs-detail-refresh': input => F.details[input.id],
    'feed-read': () => F.feed,
    'feed-refresh': async () => {
      await sleep(300)
      if (state.incoming.length) { F.feed.items = [...state.incoming, ...F.feed.items]; state.incoming = [] }
      return F.feed
    },
    'feed-content': input => F.contents[input.id],
    'feed-memo': addMemo,
    'memo-list': () => ({ notes: state.memos, warnings: [] }),
    'schedule-read': () => F.schedule,
    'schedule-refresh': () => F.schedule,
    'learning-read': () => F.learning,
    'learning-refresh': () => F.learning,
    'learning-course': input => F.coursePages[input.id],
    'learning-course-refresh': input => F.coursePages[input.id],
    'learning-lesson': input => F.lessonPages[lessonKey(input)],
    'learning-lesson-refresh': input => F.lessonPages[lessonKey(input)],
    'learning-downloading': () => ({}),
    'xuezai-files': input => F.xuezai[input.course],
    'xuezai-files-refresh': input => F.xuezai[input.course],
    'chaoxing-read': () => F.chaoxing,
    'chaoxing-refresh': () => F.chaoxing,
    'chaoxing-files': input => F.chaoxingPages[input.id],
    'chaoxing-files-refresh': input => F.chaoxingPages[input.id],
    'chaoxing-downloading': () => ({}),
    snapshot: () => F.profile,
    'account-read': () => F.account,
    'plugins-read': () => ({ disabled: [] }),
    'plugins-set': () => ({ disabled: [] }),
    'mail-status': () => F.mail,
  }
  /** 这几样先问引擎，再把编好的加进去。 */
  const merged = {
    'skills-list': list => [...(Array.isArray(list) ? list : []), ...F.learnedSkills],
  }

  const realFetch = window.fetch.bind(window)
  const reply = value => new Response(JSON.stringify({ value }), { status: 200, headers: { 'content-type': 'application/json' } })
  window.fetch = async (resource, init) => {
    const url = typeof resource === 'string' ? resource : resource instanceof URL ? resource.href : resource?.url
    if (!url || !url.includes('/api/campus/profile') || !init?.body) return realFetch(resource, init)
    let body
    try { body = JSON.parse(init.body) } catch { return realFetch(resource, init) }
    const handler = handlers[body.action]
    if (handler) {
      try {
        const value = await handler(body.input ?? {})
        if (value === undefined) return new Response(JSON.stringify({ error: `演示数据里没有：${body.action}` }), { status: 400 })
        return reply(clone(value))
      } catch (error) { return new Response(JSON.stringify({ error: String(error?.message ?? error) }), { status: 400 }) }
    }
    const response = await realFetch(resource, init)
    if (merged[body.action]) {
      const result = await response.json()
      return reply(merged[body.action](result.value))
    }
    if (!state.passed.includes(body.action)) state.passed.push(body.action)
    return response
  }
})()
