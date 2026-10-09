/** 微信公众号插件：应用 API、助手工具与生命周期共用这一个服务。 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { CORE_ROOT } from './skills.mjs'

export const WECHAT_PLUGIN = 'campus.wechat'
const OFF = '微信公众号插件已关闭，请先在「插件」页打开。'
const runtimeError = '未找到可用的 Python 3.14，请安装后重新打开应用。'

/** 只终止本服务创建的进程树；微信是被只读访问的外部进程，不在这棵树里。 */
function stop(child) {
  if (!child.pid || child.exitCode !== null) return
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    killer.on('error', () => { child.kill() })
  } else child.kill()
}

export function execute(executable, args, { signal, timeoutMs = 110_000, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('读取已停止')); return }
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], env })
    let output = '', settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort)
      if (error) reject(error); else resolve(value)
    }
    const abort = () => { stop(child); finish(new Error('读取已停止')) }
    const timer = setTimeout(() => { stop(child); finish(new Error('公众号读取超时，已有文章保留，请稍后重试。')) }, timeoutMs)
    signal?.addEventListener('abort', abort, { once: true })
    child.stdout.setEncoding('utf8').on('data', chunk => {
      output += chunk
      if (output.length > 8 * 1024 * 1024) { stop(child); finish(new Error('公众号返回内容过多，请缩小范围。')) }
    })
    child.once('error', () => finish(new Error(runtimeError)))
    child.once('close', code => finish(null, { code, output }))
  })
}

export function createWechatRunner({ dataDir, env = process.env, exec = execute } = {}) {
  let python
  const resolvePython = async signal => {
    if (python) return python
    const candidates = env.CAMPUS_WECHAT_PYTHON ? [[env.CAMPUS_WECHAT_PYTHON, []]] : [
      ...(env.ProgramFiles && fs.existsSync(path.join(env.ProgramFiles, 'Python314', 'python.exe')) ? [[path.join(env.ProgramFiles, 'Python314', 'python.exe'), []]] : []),
      ['python', []], ['py', ['-3.14']],
    ]
    for (const [command, prefix] of candidates) {
      try {
        const check = await exec(command, [...prefix, '-c', 'import sys; from compression import zstd; print(sys.executable); sys.exit(0 if sys.version_info >= (3,14) else 1)'], { signal, timeoutMs: 8_000, env })
        if (check.code === 0 && check.output.trim()) { python = check.output.trim(); return python }
      } catch { if (signal?.aborted) throw new Error('读取已停止') }
    }
    throw new Error(runtimeError)
  }
  return async (args, { signal, cached = false } = {}) => {
    const command = await resolvePython(signal)
    const childEnv = { ...env }
    // 插件关闭时仅设置页能读订阅状态，不访问微信或文章内容。
    if (cached && args[0] === 'list') delete childEnv.CAMPUS_WECHAT_DISABLED
    const result = await exec(command, [path.join(CORE_ROOT, 'wechat', 'wechat_feed.py'), '--data-dir', dataDir, ...args], { signal, env: childEnv })
    try {
      const parsed = JSON.parse(result.output)
      if (typeof parsed.ok !== 'boolean') throw new Error()
      return parsed
    } catch { throw new Error('公众号模块没有返回有效结果，请重新打开应用后再试。') }
  }
}

const validBiz = value => typeof value === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(value) && /^\d{6,20}$/.test(Buffer.from(value, 'base64').toString('utf8'))
const resultError = result => result.error?.message || '公众号操作未完成，请稍后重试。'

export class WechatFeeds {
  constructor({ plugins, dataDir, run = createWechatRunner({ dataDir }), schedule = setInterval, cancel = clearInterval, isSelected = () => true }) {
    this.plugins = plugins; this.run = run; this.schedule = schedule; this.cancel = cancel
    this.isSelected = isSelected
    this.queue = Promise.resolve(); this.controllers = new Set(); this.inflight = new Map()
    this.last = { accounts: [], runtime: null }; this.connection = null; this.error = null; this.disposed = false
  }
  enabled() { return this.isSelected() && !this.plugins.disabled().includes(WECHAT_PLUGIN) }
  requireEnabled() { if (!this.enabled() || this.disposed) throw new Error(OFF) }
  async call(args, options = {}) {
    const controller = new AbortController(); this.controllers.add(controller)
    try { return await this.run(args, { ...options, signal: controller.signal }) }
    finally { this.controllers.delete(controller) }
  }
  serial(key, operation) {
    if (this.inflight.has(key)) return this.inflight.get(key)
    const work = this.queue.then(() => { this.requireEnabled(); return operation() })
    this.queue = work.catch(() => {})
    this.inflight.set(key, work)
    work.finally(() => { this.inflight.delete(key) }).catch(() => {})
    return work
  }
  async snapshot() {
    const result = await this.call(['list'], { cached: true })
    if (result.ok) this.last = result
    else this.error = resultError(result)
    return { accounts: this.last.accounts, runtime: this.last.runtime, connection: this.connection,
      enabled: this.enabled(), busy: this.controllers.size > 0, error: this.error, completeAccountFeed: false }
  }
  async check() {
    return this.serial('check', async () => {
      const result = await this.call(['doctor'])
      this.connection = { running: result.ok, version: result.source?.wechatVersion ?? null, message: result.ok ? '微信已运行' : resultError(result) }
      return this.snapshot()
    })
  }
  async discover() {
    return this.serial('discover', async () => {
      const result = await this.call(['discover'])
      if (!result.ok) throw new Error(resultError(result))
      this.connection = { running: true, version: result.source.wechatVersion, message: '本地读取成功' }
      return { accounts: result.accounts, checkedAt: result.checkedAt }
    })
  }
  async add(input) {
    const args = ['add']
    if (validBiz(input?.biz)) {
      args.push('--biz', input.biz)
      if (typeof input.name === 'string' && input.name.trim() && input.name.length <= 200) args.push('--label', input.name.trim())
    } else if (typeof input?.articleUrl === 'string' && input.articleUrl.length <= 2048) {
      let url
      try { url = new URL(input.articleUrl) } catch { throw new Error('请填写微信公众号文章链接') }
      if (url.protocol !== 'https:' || url.hostname !== 'mp.weixin.qq.com' || url.username || url.password) throw new Error('请填写微信公众号文章链接')
      args.push('--article-url', url.href)
    } else throw new Error('请选择一个公众号')
    return this.serial(`add:${args.join(':')}`, async () => {
      const added = await this.call(args)
      if (!added.ok) throw new Error(resultError(added))
      // 登记已成功，即使微信暂时不可读也保留订阅，并让状态说明原因。
      await this.synchronize(added.account.biz, false)
      return this.snapshot()
    })
  }
  async set(input) {
    if (!validBiz(input?.biz) || typeof input.enabled !== 'boolean') throw new Error('无效的公众号开关')
    return this.serial(`set:${input.biz}:${input.enabled}`, async () => {
      const result = await this.call([input.enabled ? 'resume' : 'pause', '--biz', input.biz])
      if (!result.ok) throw new Error(resultError(result))
      return this.snapshot()
    })
  }
  async synchronize(biz, due) {
    this.requireEnabled()
    const args = ['sync', ...(biz ? ['--biz', biz] : []), ...(due ? ['--due'] : [])]
    const result = await this.call(args)
    this.error = result.ok ? null : resultError(result)
    if (result.source?.wechatVersion) this.connection = { running: true, version: result.source.wechatVersion, message: '本地读取成功' }
    if (result.error?.code === 'wechat_not_running') this.connection = { running: false, version: this.connection?.version ?? null, message: resultError(result) }
    return result
  }
  async refresh(input = {}) {
    if (input.biz !== undefined && !validBiz(input.biz)) throw new Error('无效的公众号')
    return this.serial(`refresh:${input.biz ?? 'all'}`, async () => { await this.synchronize(input.biz, false); return this.snapshot() })
  }
  async articles(input = {}) {
    this.requireEnabled()
    const status = await this.snapshot()
    let biz = input.biz
    if (input.account) {
      const found = status.accounts.filter(a => a.name === input.account || a.biz === input.account)
      if (found.length !== 1) throw new Error('没有找到唯一的已添加公众号，请先在插件页选择。')
      biz = found[0].biz
    }
    if (biz !== undefined && (!validBiz(biz) || !status.accounts.some(a => a.biz === biz))) throw new Error('这个公众号还没有添加')
    const limit = Number.isInteger(input.limit) ? Math.min(200, Math.max(1, input.limit)) : 50
    this.requireEnabled()
    const result = await this.call(['articles', ...(biz ? ['--biz', biz] : []), '--limit', String(limit)])
    if (!result.ok) throw new Error(resultError(result))
    this.requireEnabled()
    return { ...result, accounts: status.accounts.filter(a => !biz || a.biz === biz), completeAccountFeed: false }
  }
  changed() {
    if (!this.enabled()) { for (const controller of this.controllers) controller.abort(); this.error = null }
    else void this.tick()
  }
  async tick() {
    if (this.disposed || !this.enabled() || this.inflight.size) return
    try { await this.serial('timer', () => this.synchronize(undefined, true)) }
    catch (error) { if (!this.disposed && this.enabled()) this.error = error.message }
  }
  start() {
    this.timer = this.schedule(() => { void this.tick() }, 60_000)
    this.timer?.unref?.()
    void this.tick()
    return () => this.dispose()
  }
  dispose() {
    this.disposed = true
    if (this.timer !== undefined) this.cancel(this.timer)
    for (const controller of this.controllers) controller.abort()
  }
}
