/**
 * 很小的 Chrome DevTools Protocol 客户端：连上 Electron 开的调试端口，发命令、等事件。
 * 用 Node 自带的 WebSocket，不依赖别的包。
 */
export async function targets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  return response.json()
}

export async function waitForPage(port, test = () => true, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs
  for (;;) {
    try {
      const page = (await targets(port)).find(target => target.type === 'page' && test(target))
      if (page) return page
    } catch { /* 端口还没开 */ }
    if (Date.now() > until) throw new Error(`等不到调试端口 ${port} 上的页面`)
    await new Promise(resolve => setTimeout(resolve, 300))
  }
}

export class Cdp {
  static async connect(url) {
    const socket = new WebSocket(url)
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(new Error(`连不上 ${url}`)) })
    return new Cdp(socket)
  }

  constructor(socket) {
    this.socket = socket
    this.seq = 0
    this.pending = new Map()
    this.listeners = new Set()
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id !== undefined) {
        const waiter = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error) waiter?.reject(new Error(`${waiter.method}: ${message.error.message}`))
        else waiter?.resolve(message.result)
      } else for (const listener of [...this.listeners]) listener(message)
    }
  }

  /** 发一条命令；timeoutMs 内没回就报错，不让整个脚本卡住。 */
  send(method, params = {}, timeoutMs = 60_000) {
    const id = ++this.seq
    this.socket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} 等了 ${timeoutMs / 1000} 秒没有回应`)) }, timeoutMs)
      this.pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value) }, reject: (error) => { clearTimeout(timer); reject(error) }, method })
    })
  }

  on(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener) }

  /** 在页面里算一个表达式，拿回 JSON 能表示的值；表达式可以是 async 的。 */
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(`页面里出错：${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`)
    return result.result.value
  }

  close() { this.socket.close() }
}
