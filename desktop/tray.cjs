/**
 * 点主窗口的关闭按钮时去哪：直接退出，还是隐藏到系统托盘。开关在 设置 → 通用设置 里，默认开（2026-10-21 起；原来默认关，
 * 可聊天监控、邮箱和 CC98 的后台检查、定时任务都要应用开着才跑，一关窗口就全停了）。只有用户明确关过（文件里写着 false）才是关。
 * 第一次关窗口藏进托盘时，弹一条系统通知说应用还在后台、怎么退出，只弹这一次。
 * 关窗口这件事发生在壳里，所以选择由壳自己存：应用数据目录下的 shell.json。
 * 托盘图标只在开关打开时才有；点它把主窗口叫回来，右键菜单里可以退出。
 *
 * 新消息另外弹一条 Windows 的系统通知（右下角那种），点了打开它说的地方；开关「新消息时弹出系统通知」也在通用设置里，默认开。
 *
 * 有新消息时图标会闪（做法照 QQ：图标和一张空白的图来回换）。消息从引擎那边来（公众号有新文章，监控的聊天、邮箱、CC98 有新消息，
 * 助手用 campus_notify 提醒的事），壳只管攒着、闪、给人看：鼠标放上去的提示里是最近几条，
 * 右键菜单最上面一条一行，点图标或点其中一条就打开它说的那个地方，同时不再闪。
 */
const fs = require('node:fs')

/** 图标和空白各显示多久。 */
const BLINK_MS = 500
/** 最多攒几条；提示里列几条；菜单里列几条。 */
const KEEP = 20, TIP_LINES = 3, MENU_LINES = 5
/** Windows 的托盘提示最多 127 个字，多了会被截掉甚至整条不显示。 */
const TIP_MAX = 127
const LIMIT = { title: 30, text: 80 }

/** 存着的几样选择。文件不在、读不出来时都按默认：藏进托盘、弹系统通知、还没提示过；只有明确写着 false 的才算关。 */
function readShell(file) {
  let value
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
  if (!value || typeof value !== 'object') value = {}
  return { closeToTray: value.closeToTray !== false, notify: value.notify !== false, hinted: value.hinted === true }
}
const readCloseToTray = file => readShell(file).closeToTray

/** 第一次藏进托盘时的那条说明。 */
const HINT = { title: '还在后台运行', text: '新消息会在这里提醒你。要退出，右键托盘图标选「退出」；不想这样，可以在 设置 → 通用设置 里关掉。' }

const clip = (value, limit) => {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

/**
 * 引擎发来的一条消息，只留认得的几项；没有标题的不算。
 * 去哪只有两种：一个对话（sessionId），或者侧栏上的一页（panel）。
 */
function cleanAlert(input) {
  if (!input || typeof input !== 'object') return undefined
  const title = clip(input.title, LIMIT.title)
  if (!title) return undefined
  const id = /^[\w.:-]{1,80}$/
  return {
    title, text: clip(input.text, LIMIT.text),
    ...(typeof input.sessionId === 'string' && id.test(input.sessionId) ? { sessionId: input.sessionId }
      : typeof input.panel === 'string' && id.test(input.panel) ? { panel: input.panel } : {}),
  }
}

const line = alert => alert.text ? `${alert.title}：${alert.text}` : alert.title

/**
 * file 是存选择的文件，icon 是托盘上的图标，blank 是闪的时候换上去的那张空白的图，
 * show 把主窗口叫回来，quit 真正退出应用，open(alert) 打开一条消息说的那个地方（主窗口由它自己叫回来）。
 * Notification 是 Electron 的系统通知（测试里换成假的）；不给、或者系统不支持时不弹。
 * 返回 { enabled(), set(on), notifying(), setNotify(on), hidden(), alert(input), clear(), pending(), dispose() }。
 */
function createTray({ Tray, Menu, Notification, file, title, icon, blank, show, quit, open = show }) {
  let { closeToTray: on, notify, hinted } = readShell(file)
  let tray
  /** 弹出去还没被点、也没关掉的系统通知：留着引用，不然被回收以后点了没反应。 */
  const toasts = new Set()
  /** 弹过一条，被 Windows 的通知设置拦下了。 */
  let blocked = false
  /** 还没看的消息，新的在前。 */
  let alerts = []
  let timer, dark = false

  function menu() {
    const items = alerts.slice(0, MENU_LINES).map(alert => ({ label: line(alert), click: () => { take(alert) } }))
    return Menu.buildFromTemplate([...items, ...(items.length ? [{ type: 'separator' }] : []), { label: '打开主窗口', click: show }, { type: 'separator' }, { label: '退出', click: quit }])
  }
  function tip() {
    if (!alerts.length) return title
    const text = [`${title} · ${alerts.length} 条新消息`, ...alerts.slice(0, TIP_LINES).map(line)].join('\n')
    return text.length > TIP_MAX ? `${text.slice(0, TIP_MAX - 1)}…` : text
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = undefined }
    if (dark && tray) tray.setImage(icon)
    dark = false
  }
  /** 照现在有没有消息，把图标、提示、菜单和闪不闪摆对。 */
  function paint() {
    if (!tray) { stop(); return }
    tray.setToolTip(tip())
    tray.setContextMenu(menu())
    if (!alerts.length || !blank) { stop(); return }
    if (timer) return
    timer = setInterval(() => {
      if (!tray) return
      dark = !dark
      tray.setImage(dark ? blank : icon)
    }, BLINK_MS)
  }
  /** 点了一条（或点了图标）：这些消息算看过了，打开它说的地方。 */
  function take(alert) {
    alerts = []
    paint()
    if (alert) open(alert); else show()
  }
  function save() { fs.writeFileSync(file, JSON.stringify({ closeToTray: on, notify, hinted }) + '\n') }
  /** 弹一条系统通知；给了 alert 的，点它就打开那个地方。 */
  function toast(message, alert) {
    if (!Notification || (typeof Notification.isSupported === 'function' && !Notification.isSupported())) return false
    try {
      const item = new Notification({ title: message.title, body: message.text || '', ...(icon ? { icon } : {}) })
      toasts.add(item)
      const done = () => { toasts.delete(item) }
      item.on('click', () => { done(); if (alert) take(alert); else show() })
      item.on('close', done)
      // Windows 的通知被用户关掉时会走到这里（「Settings prevent the notification type from being delivered」）：记下来，设置页照实说。
      item.on('failed', (_event, error) => { done(); if (/settings prevent|disabled/i.test(String(error))) blocked = true })
      item.show()
      return true
    } catch { return false }
  }
  function sync() {
    if (on && !tray) {
      tray = new Tray(icon)
      tray.on('click', () => { take(alerts[0]) })
    } else if (!on && tray) {
      stop()
      tray.destroy()
      tray = undefined
    }
    paint()
  }
  sync()
  return {
    enabled: () => on,
    set(value) {
      on = value === true
      save()
      sync()
      return on
    },
    notifying: () => notify,
    /** 弹过的通知有没有被 Windows 的通知设置拦下。 */
    blocked: () => blocked,
    setNotify(value) {
      notify = value === true
      save()
      return notify
    },
    /** 主窗口刚藏进托盘。第一次时弹一条说明：应用还在后台，怎么退出。 */
    hidden() {
      if (hinted) return
      hinted = true
      save()
      toast(HINT)
    },
    /** 来了一条新消息。托盘开着就开始闪，系统通知开着就弹一条；返回收下的那一条，认不出来的返回 undefined。 */
    alert(input) {
      const alert = cleanAlert(input)
      if (!alert) return undefined
      // 同一个地方、同一个标题的只留最新一条：半小时查一次的任务不会把菜单占满。
      alerts = [alert, ...alerts.filter(old => !(old.title === alert.title && old.sessionId === alert.sessionId && old.panel === alert.panel))].slice(0, KEEP)
      paint()
      if (notify) toast(alert, alert)
      return alert
    },
    /** 人回到主窗口了：消息算看过，不再闪。 */
    clear() {
      if (!alerts.length) return
      alerts = []
      paint()
    },
    pending: () => alerts.length,
    dispose() {
      stop()
      for (const item of toasts) { try { item.close() } catch {} }
      toasts.clear()
      if (tray) { tray.destroy(); tray = undefined }
    },
  }
}

module.exports = { createTray, readShell, readCloseToTray, cleanAlert, BLINK_MS, HINT }
