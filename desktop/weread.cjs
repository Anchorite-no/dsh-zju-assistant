/** Local authenticated bridge. WeRead cookies stay in an isolated Electron session. */
const http = require('node:http')
const crypto = require('node:crypto')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

async function createWereadBridge({ app, BrowserWindow, session, ipcMain, parent, root, keysFile = path.join(root, 'api-keys.local.yaml') }) {
  const { WereadClient, WereadError, ORIGIN, CAPTCHA_APP_ID } = await import(pathToFileURL(path.join(root, 'core/weread/client.mjs')))
  const { CaptchaWorkflow, VisionRecognizer } = await import(pathToFileURL(path.join(root, 'core/weread/captcha.mjs')))
  const { OfficialWereadClient, OfficialWereadError, OFFICIAL_VERSION } = await import(pathToFileURL(path.join(root, 'core/weread/official.mjs')))
  const apiKey = () => { try { return require('js-yaml').load(fs.readFileSync(keysFile, 'utf8'))?.refs?.WEREAD_API_KEY } catch { return undefined } }
  const official = new OfficialWereadClient({ getApiKey: apiKey })
  const browserSession = session.fromPartition('persist:campus-weread')
  const token = crypto.randomBytes(32).toString('hex'), tasks = new Map(), inflight = new Map()
  let window, stopped = false, blockedUntil = 0
  const stateDir = path.join(app.getPath('userData'), 'weread')
  const configFile = path.join(stateDir, 'recognizer.json')
  const enabled = () => {
    try { return !JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'profile/plugins.json'), 'utf8')).disabled?.includes('campus.wechat') }
    catch { return true }
  }
  const ensureEnabled = () => { if (stopped || !enabled()) throw new WereadError('plugin_disabled', '微信公众号插件已关闭。') }
  async function identity() {
    const cookies = await browserSession.cookies.get({ url: ORIGIN })
    const vid = cookies.find(c => c.name === 'wr_vid')?.value
    const key = cookies.find(c => c.name === 'wr_skey')?.value
    return { connected: !!(vid && key), owner: vid ? crypto.createHash('sha256').update(vid).digest('hex') : null }
  }
  const client = new WereadClient({
    quickLogin: async () => (await browserSession.cookies.get({ url: ORIGIN, name: 'wr_ql' })).some(c => c.value === '1'),
    transport: async ({ method, path: endpoint, query, body, headers, signal }) => {
      ensureEnabled()
      if (Date.now() < blockedUntil) throw new WereadError('rate_limited', '微信读书处于等待恢复状态，当前没有再次请求。', { public: { retryAt: new Date(blockedUntil).toISOString() } })
      if (!endpoint.startsWith('/') || endpoint.startsWith('//')) throw new WereadError('invalid_request', '请求路径不正确。')
      const url = new URL(endpoint, ORIGIN)
      for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, String(value))
      const response = await browserSession.fetch(url.href, { method, credentials: 'include', redirect: 'error',
        headers: { accept: 'application/json, text/plain, */*', referer: `${ORIGIN}/`, origin: ORIGIN, ...headers, ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) })
      const data = await response.text()
      if (data.length > 5 * 1024 * 1024) throw new WereadError('response_too_large', '微信读书返回内容过大，已停止读取。')
      return { status: response.status, body: data, retryAfter: response.headers.get('retry-after') }
    },
  })
  async function openWindow(title = '连接微信读书') {
    ensureEnabled()
    if (window && !window.isDestroyed()) { window.show(); window.focus(); return window }
    window = new BrowserWindow({ width: 1060, height: 800, title, parent, show: false,
      webPreferences: { session: browserSession, preload: path.join(__dirname, 'weread-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event, url) => {
      try { if (!['https://weread.qq.com', 'https://open.weixin.qq.com'].includes(new URL(url).origin)) event.preventDefault() } catch { event.preventDefault() }
    })
    window.on('closed', () => {
      window = undefined
      for (const task of tasks.values()) if (task.state === 'waiting' || task.state === 'prepared') {
        task.state = 'cancelled'; task.message = '验证窗口已关闭，任务没有继续。'; task.workflow?.cancel(); task.resolveProof?.({ status: 'cancelled' })
      }
    })
    await window.loadURL(ORIGIN)
    window.show(); window.focus()
    return window
  }
  function taskFor(id) {
    const task = tasks.get(id)
    if (!task || Date.now() - task.createdAt > 10 * 60 * 1000) throw new WereadError('verification_expired', '验证任务已过期，请重新执行原任务。')
    return task
  }
  function publicTask(task) {
    return { ok: task.state === 'complete', status: task.state === 'complete' ? 'complete' : task.state === 'cancelled' ? 'cancelled' : task.state === 'failed' ? 'verification_failed' : 'verification_required', taskId: task.id, state: task.state,
      message: task.message ?? '请在微信读书验证窗口完成当前验证。', ...(task.result ? { result: task.result } : {}) }
  }
  function recognizerConfig() {
    try { return JSON.parse(fs.readFileSync(configFile, 'utf8')) } catch { return {} }
  }
  function recognizer() {
    const config = recognizerConfig()
    if (!config.endpoint || !config.model || !config.keyRef) return undefined
    // Reuse the app's credential file; API secrets never enter tool outputs.
    const { load } = require('js-yaml')
    let refs
    try { refs = load(fs.readFileSync(keysFile, 'utf8'))?.refs ?? {} } catch { refs = {} }
    if (typeof refs[config.keyRef] !== 'string' || !refs[config.keyRef]) throw new WereadError('recognizer_not_configured', '识别模型的 API Key 尚未在应用凭据中配置。')
    return new VisionRecognizer({ endpoint: config.endpoint, model: config.model, apiKey: refs[config.keyRef] })
  }
  async function captureGrid() {
    if (!window || window.isDestroyed()) throw new WereadError('verification_window_missing', '请先打开当前验证码窗口。')
    const frames = window.webContents.mainFrame.framesInSubtree
    const frame = frames.find(f => /^https:\/\/captcha\.gtimg\.com\/static\/template\//.test(f.url))
    if (!frame) throw new WereadError('verification_not_visible', '当前窗口没有可采集的验证码。')
    const layout = await frame.executeJavaScript(`(() => {
      const area=document.querySelector('#tcImgArea'), prompt=document.querySelector('#instructionText'), button=document.querySelector('#verifyBtn'), heading=document.querySelector('#pHeaderTitle');
      const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
      return area&&prompt&&button?{question:prompt.textContent.trim(),heading:heading?.textContent.replace(/\\s/g,''),area:rect(area),submit:rect(button)}:null;
    })()`)
    const origin = await window.webContents.executeJavaScript(`(() => {const f=document.querySelector('#tcaptcha_iframe_dy');if(!f)return null;const r=f.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`)
    if (!layout || !origin || !layout.heading?.includes('最符合描述') || layout.area.width < 150) throw new WereadError('unsupported_verification', '当前题型尚未适配，请在窗口手动验证。')
    const side = layout.area.width / 3
    if (layout.area.height < side * 2 || layout.area.height > side * 2.5) throw new WereadError('unsupported_verification', '当前验证码布局与六图模板不同，未猜测点击位置。')
    const top = origin.y + layout.area.y + layout.area.height - 2 * side, left = origin.x + layout.area.x
    const choices = []
    for (let index = 0; index < 6; index++) {
      const rect = { x: left + (index % 3) * side + 2, y: top + Math.floor(index / 3) * side + 2, width: side - 4, height: side - 4 }
      const image = await window.webContents.capturePage(Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, Math.round(value)])))
      choices.push({ id: index + 1, rect, image: image.toDataURL() })
    }
    return { kind: 'image-choice', question: layout.question, coordinateSpace: 'page-css-pixels', choices,
      submitRect: { ...layout.submit, x: origin.x + layout.submit.x, y: origin.y + layout.submit.y } }
  }
  async function click(point) {
    if (!window || window.isDestroyed()) throw new WereadError('verification_window_missing', '验证窗口已关闭。')
    window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(point.x), y: Math.round(point.y) })
    window.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: Math.round(point.x), y: Math.round(point.y) })
    window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: Math.round(point.x), y: Math.round(point.y) })
  }
  async function resume(task, proof) {
    if (task.resumePromise) return task.resumePromise
    task.resumePromise = (async () => {
      task.state = 'resuming'
      try {
        ensureEnabled()
        const current = await identity()
        if (current.owner !== task.owner) throw new WereadError('account_changed', '微信读书账号已变化，请重新执行任务。')
        const replay = await client.retryVerified(task, proof, task.controller.signal)
        const result = await business(task.action, task.input, task.controller.signal, replay)
        task.controller.signal.throwIfAborted()
        task.result = result; task.state = 'complete'; task.message = '验证通过，原任务已完成。'
      }
      catch (error) { if (task.state !== 'cancelled') { task.state = 'failed'; task.result = error instanceof WereadError ? error.publicResult() : { ok: false, status: 'failed', message: '原任务未能完成。' }; task.message = task.result.message } }
      finally { task.trace = []; task.request = null }
      return publicTask(task)
    })()
    return task.resumePromise
  }
  const onProof = async (event, input) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url.startsWith(ORIGIN + '/')) return { ok: false }
    let task
    try {
      ensureEnabled(); task = taskFor(input?.taskId)
      if (task.state !== 'waiting' || task.resumePromise) return { ok: false }
      if (input.ret !== 0) { task.message = '验证未完成，原任务保持暂停。'; task.resolveProof?.({ status: 'not_verified' }); return { ok: false } }
      if (typeof input.ticket !== 'string' || !input.ticket || typeof input.randstr !== 'string' || !input.randstr) return { ok: false }
      const proof = { ticket: input.ticket, randstr: input.randstr }
      task.resolveProof?.({ status: 'verified', proof })
      await resume(task, proof)
      return { ok: task.state === 'complete', status: task.state }
    } catch { if (task) task.message = '验证结果未被确认，任务保持暂停。'; return { ok: false } }
  }
  ipcMain.handle('campus:weread-proof', onProof)
  async function openVerification(task) {
    if (task.state === 'complete') return publicTask(task)
    if (task.state === 'cancelled' || task.state === 'failed') throw new WereadError('verification_expired', '请重新执行原任务，获取新的验证。')
    if (task.state === 'resuming') return publicTask(task)
    if (task.state === 'waiting' && window && !window.isDestroyed()) { window.show(); window.focus(); return publicTask(task) }
    const view = await openWindow('微信读书验证')
    if ([...tasks.values()].some(other => other !== task && other.state === 'waiting')) throw new WereadError('verification_busy', '请先完成窗口中的验证。')
    task.proofPromise = new Promise(resolve => { task.resolveProof = resolve })
    task.workflow = new CaptchaWorkflow({ adapter: {
      capture: captureGrid, click,
      submit: async ({ rect }) => click({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }),
      waitForResult: async () => { let timer; try { return await Promise.race([task.proofPromise, new Promise(resolve => { timer = setTimeout(() => resolve({ status: 'timeout' }), 25000) })]) } finally { clearTimeout(timer) } },
    } })
    const taskId = JSON.stringify(task.id)
    const opened = await view.webContents.executeJavaScript(`(async () => {
      if(document.querySelector('#tcaptcha_iframe_dy')) return {status:'existing_verification'};
      if(!window.TencentCaptcha) await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://captcha.gtimg.com/TCaptcha.js';s.onload=resolve;s.onerror=reject;document.head.append(s)});
      const challenge=new window.TencentCaptcha('${CAPTCHA_APP_ID}', result=>window.campusWereadVerification.complete({taskId:${taskId},ret:result.ret,ticket:result.ticket,randstr:result.randstr}),{needFeedBack:true});
      challenge.show();return {status:'opened'};
    })()`)
    if (opened?.status === 'existing_verification') throw new WereadError('existing_verification', '官方窗口已有一个验证，请先完成它，再打开本任务的验证。')
    task.state = 'waiting'
    return publicTask(task)
  }
  async function business(action, input, signal, replay = []) {
    if (action === 'account.status') {
      const current = await identity()
      if (apiKey()) {
        const catalog = await official.capabilities(signal), shelf = await official.publishers('', signal)
        return { ok: true, status: 'connected', connected: true, owner: current.owner, publisherCount: shelf.accounts.length,
          official: { version: OFFICIAL_VERSION, apiCount: catalog.apis.length, articleList: false, articleBody: false, subscribe: false }, browserSessionPresent: current.connected,
          message: current.connected ? '官方 API 已连接，公众号历史与全文使用已保存的网页登录。' : '官方 API 已连接；请通过网页登录启用公众号历史与全文。' }
      }
      if (!current.connected) return { ok: true, status: 'disconnected', connected: false, message: '尚未连接微信读书。' }
      const result = await client.run('publisher.list', {}, signal, replay)
      return { ok: true, status: 'connected', connected: true, owner: current.owner, publisherCount: result.accounts.length }
    }
    if (apiKey() && action === 'publisher.list') return official.publishers('', signal)
    if (apiKey() && action === 'publisher.search') {
      const result = await official.publishers(input.query ?? '', signal)
      if (result.accounts.length || !(await identity()).connected) return result
      return { ...await client.run(action, input, signal, replay), source: 'web_supplement' }
    }
    return client.run(action, input, signal, replay)
  }
  async function execute(action, input = {}, signal) {
    if (action === 'operation.cancel') {
      for (const controller of inflight.values()) controller.abort()
      for (const task of tasks.values()) { task.controller.abort(); task.workflow?.cancel(); task.resolveProof?.({ status: 'cancelled' }); task.state = 'cancelled'; task.trace = []; task.request = null }
      if (window && !window.isDestroyed()) window.close()
      return { ok: true, status: 'cancelled' }
    }
    ensureEnabled()
    if (action === 'account.connect') { await openWindow(); return { ok: true, status: 'waiting_for_login', message: '请在打开的官方微信读书窗口登录，完成后检查连接。' } }
    if (action === 'official.capabilities') return { ok: true, source: 'official', ...await official.capabilities(signal) }
    if (action === 'recognizer.status') { const config = recognizerConfig(); return { ok: true, configured: !!(config.endpoint && config.model && config.keyRef), ...config } }
    if (action === 'recognizer.configure') {
      const endpoint = new URL(input.endpoint)
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || !/^[A-Z][A-Z0-9_]{2,80}$/.test(input.keyRef ?? '') || typeof input.model !== 'string' || !input.model.trim()) throw new WereadError('invalid_config', '请填写 HTTPS 接口、图像模型名称和应用凭据引用。')
      fs.mkdirSync(stateDir, { recursive: true }); fs.writeFileSync(configFile, JSON.stringify({ endpoint: endpoint.href, model: input.model.trim(), keyRef: input.keyRef }, null, 2))
      return { ok: true, status: 'configured' }
    }
    if (action.startsWith('verification.')) {
      const task = taskFor(input.task)
      if (action === 'verification.status') return publicTask(task)
      if (action === 'verification.open') return openVerification(task)
      if (!task.workflow) throw new WereadError('verification_window_missing', '请先打开当前验证窗口。')
      if (action === 'verification.prepare') return task.workflow.prepare(signal)
      if (action === 'verification.recognize') { if (input.confirm !== true) throw new WereadError('verification_approval_required', '需要确认处理当前这次验证码。'); task.workflow.recognizer = recognizer(); return task.workflow.recognize(input.capture, signal) }
      if (action === 'verification.submit' || action === 'verification.solve') {
        if (input.confirm !== true) throw new WereadError('verification_approval_required', '需要确认处理当前这一次验证码。')
        task.workflow.recognizer = recognizer()
        if (action === 'verification.solve') await task.workflow.run({ approved: true, signal })
        else await task.workflow.submit(input.capture, { selected: input.selected, confidence: input.confidence }, { approved: true, signal })
        return task.resumePromise ? await task.resumePromise : publicTask(task)
      }
      throw new WereadError('unknown_action', '不支持的验证操作。')
    }
    const currentIdentity = await identity()
    const usesOfficial = !!apiKey() && ['publisher.list', 'publisher.search'].includes(action)
    if (!currentIdentity.connected && action !== 'account.status' && !usesOfficial) throw new WereadError('login_required', '该能力需要网页登录，请先连接微信读书。')
    if (input._expectedOwner && currentIdentity.owner !== input._expectedOwner) throw new WereadError('account_changed', '微信读书账号与原绑定不同，请切回原账号。')
    try { const result = await business(action, input, signal); return { ...result, source: { provider: typeof result.source === 'string' ? result.source : 'web', owner: currentIdentity.owner } } }
    catch (error) {
      if (error.code === 'rate_limited') blockedUntil = Date.now() + (error.details?.public?.retryAfterSeconds ?? 1800) * 1000
      if (error.code === 'verification_required') {
        const id = crypto.randomUUID(), task = { id, action, input, requestKey: error.details.requestKey, request: error.details.request, trace: error.details.trace ?? [], owner: (await identity()).owner, state: 'required', createdAt: Date.now(), controller: new AbortController() }
        for (const [key, value] of tasks) if (Date.now() - value.createdAt > 600000) tasks.delete(key)
        tasks.set(id, task)
        return { ...error.publicResult(), taskId: id, resumable: true }
      }
      throw error
    }
  }
  const server = http.createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json; charset=utf-8'); response.setHeader('cache-control', 'no-store')
    const supplied = String(request.headers.authorization ?? ''), expected = `Bearer ${token}`
    if (request.method !== 'POST' || request.headers.origin || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) { response.writeHead(403); response.end('{"ok":false,"status":"forbidden"}'); return }
    const id = crypto.randomUUID(), controller = new AbortController(); inflight.set(id, controller)
    request.on('aborted', () => controller.abort())
    try {
      let raw = ''; for await (const chunk of request) { raw += chunk; if (raw.length > 32000) throw new Error('too large') }
      const { action, input } = JSON.parse(raw)
      const result = await execute(action, input, controller.signal)
      response.end(JSON.stringify(result))
    } catch (error) { response.end(JSON.stringify(error instanceof WereadError ? error.publicResult() : error instanceof OfficialWereadError ? { ok: false, status: error.code, message: error.message, remoteCode: error.remoteCode } : { ok: false, status: 'unavailable', message: '微信读书任务未完成，请重试或在官方窗口处理。' })) }
    finally { inflight.delete(id) }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { env: { CAMPUS_WEREAD_BRIDGE_URL: `http://127.0.0.1:${server.address().port}/`, CAMPUS_WEREAD_BRIDGE_TOKEN: token },
    async close() { stopped = true; for (const c of inflight.values()) c.abort(); for (const t of tasks.values()) { t.controller.abort(); t.workflow?.cancel(); t.resolveProof?.({ status: 'cancelled' }) } ipcMain.removeHandler('campus:weread-proof'); if (window && !window.isDestroyed()) window.close(); server.close() } }
}
module.exports = { createWereadBridge }
