/**
 * 给壳的提醒：公众号有新文章、助手用 campus_notify 提醒的事。引擎进程是壳起的子进程（desktop/main.cjs 的 fork），
 * 这里把一条消息经进程之间的通道发给它，壳让托盘图标闪起来、把内容放进托盘的提示和右键菜单（desktop/tray.cjs）。
 * 这里不攒、不存：看没看过由壳管，人回到主窗口就算看过。
 * 不在壳里跑（测试、只起引擎在浏览器里看）时没有这条通道，发了没人收，sent 是 false。
 */

/** 标题和内容各最多几个字。壳那边还会再截一次，这里先截是为了工具的结果里看得到实际发出去的是什么。 */
const LIMIT = { title: 30, text: 80 }

const clip = (value, limit) => {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

/** 经进程之间的通道交给壳；没有这条通道（不是壳起的）就是没交出去。 */
function toShell(message) {
  if (!process.connected || typeof process.send !== 'function') return false
  process.send(message)
  return true
}

export class Alerts {
  /** send 把一条消息交给壳，交出去了返回真；默认走进程之间的通道。 */
  constructor({ send = toShell } = {}) {
    this.send = send
  }

  /**
   * 发一条。title 是谁的消息（任务名、「公众号有新文章」），text 是一句话的内容；
   * 点了去哪：sessionId 是一个对话，panel 是侧栏上的一页，只给一种。
   */
  push({ title, text, sessionId, panel } = {}) {
    const alert = { title: clip(title, LIMIT.title), text: clip(text, LIMIT.text), ...(sessionId ? { sessionId: String(sessionId) } : panel ? { panel: String(panel) } : {}) }
    if (!alert.title) throw new Error('提醒要有标题：谁的消息，几个字')
    let sent = false
    try { sent = this.send({ type: 'alert', alert }) === true } catch { sent = false }
    return { ...alert, sent }
  }
}

/** 公众号这一次检查新出现的文章，说成一条提醒：一篇时是「号名：标题」，多篇时带上一共几篇。 */
export function articlesAlert(articles) {
  if (!articles?.length) return undefined
  const [first] = articles
  return { title: '公众号有新文章', text: `${first.from}：${first.title}${articles.length > 1 ? ` 等 ${articles.length} 篇` : ''}`, panel: 'campus.affairs' }
}
