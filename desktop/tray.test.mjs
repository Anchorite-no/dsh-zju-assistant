import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createTray, readShell, readCloseToTray, cleanAlert, BLINK_MS, HINT } = require('./tray.cjs')

/** 假的托盘和菜单：只记下壳对它们做了什么。icons 是现在还在托盘上的那些。 */
function fakes() {
  const icons = []
  class Tray {
    constructor(icon) { this.icon = icon; this.handlers = {}; icons.push(this) }
    setToolTip(text) { this.tip = text }
    setImage(image) { this.icon = image }
    setContextMenu(menu) { this.menu = menu }
    on(name, handler) { this.handlers[name] = handler }
    destroy() { icons.splice(icons.indexOf(this), 1) }
  }
  return { Tray, Menu: { buildFromTemplate: items => items }, icons }
}

async function fixture(t) {
  const tempRoot = resolve(tmpdir())
  const root = await mkdtemp(join(tempRoot, 'campus-tray-'))
  t.after(async () => {
    // 递归清理只允许作用于本测试创建的临时目录。
    assert.ok(resolve(root).startsWith(tempRoot + sep))
    await rm(root, { recursive: true, force: true })
  })
  const file = join(root, 'shell.json')
  const calls = []
  const f = fakes()
  const create = () => createTray({
    Tray: f.Tray, Menu: f.Menu, file, title: '校园智能体', icon: 'icon', blank: 'blank',
    show: () => { calls.push('show') }, quit: () => { calls.push('quit') }, open: (alert) => { calls.push(['open', alert]) },
  })
  return { file, calls, icons: f.icons, create }
}

test('默认藏进托盘：没存过、文件坏了、写的不是 false，都按开算；只有明确关过的才直接退出', async (t) => {
  const f = await fixture(t)
  assert.equal(readCloseToTray(f.file), true)
  for (const text of ['不是 JSON', '{"closeToTray":"yes"}', '{}', 'null']) {
    await writeFile(f.file, text)
    assert.equal(readCloseToTray(f.file), true, text)
  }
  assert.deepEqual(readShell(f.file), { closeToTray: true, notify: true, hinted: false })
  assert.equal(f.create().enabled(), true)
  assert.equal(f.icons.length, 1)
  // 0.1.6 以前关过的人，文件里写着 false：照旧直接退出，托盘上没有图标。
  await writeFile(f.file, '{"closeToTray":false}')
  f.icons.splice(0)
  assert.equal(f.create().enabled(), false)
  assert.equal(f.icons.length, 0)
})

test('新消息弹一条系统通知，点了打开它说的地方；关掉开关就不弹；系统不支持时只闪托盘', async (t) => {
  const f = await fixture(t)
  const shown = []
  class Notification {
    static isSupported() { return Notification.supported }
    constructor(options) { this.options = options; this.handlers = {} }
    on(name, handler) { this.handlers[name] = handler }
    show() { shown.push(this) }
    close() { this.closed = true }
  }
  Notification.supported = true
  const tray = createTray({ Tray: fakes().Tray, Menu: { buildFromTemplate: items => items }, Notification, file: f.file, title: '校园智能体', icon: 'icon', blank: 'blank', show: () => { f.calls.push('show') }, quit: () => {}, open: (alert) => { f.calls.push(['open', alert]) } })
  assert.equal(tray.notifying(), true)
  tray.alert({ title: '钉钉聊天有新消息', text: '比赛群 · 3 条通知', panel: 'campus.affairs' })
  assert.equal(shown.length, 1)
  assert.deepEqual(shown[0].options, { title: '钉钉聊天有新消息', body: '比赛群 · 3 条通知', icon: 'icon' })
  shown[0].handlers.click()
  assert.deepEqual(f.calls, [['open', { title: '钉钉聊天有新消息', text: '比赛群 · 3 条通知', panel: 'campus.affairs' }]])
  assert.equal(tray.pending(), 0)
  // 关掉以后不弹，托盘照样攒着；下次启动还记得。
  assert.equal(tray.setNotify(false), false)
  tray.alert({ title: '成绩出了', text: '高等数学' })
  assert.equal(shown.length, 1)
  assert.equal(tray.pending(), 1)
  assert.deepEqual(readShell(f.file), { closeToTray: true, notify: false, hinted: false })
  tray.setNotify(true)
  Notification.supported = false
  tray.alert({ title: '作业快截止', text: '数据结构' })
  assert.equal(shown.length, 1)
  // 退出时把没点的通知收掉。
  Notification.supported = true
  tray.alert({ title: '作业快截止', text: '数据结构' })
  // Windows 的通知被用户关掉时，弹出去的会失败；记下来，设置页照实说。
  assert.equal(tray.blocked(), false)
  shown.at(-1).handlers.failed({}, 'Notification failed - Settings prevent the notification type from being delivered. (HRESULT: -2143420140)')
  assert.equal(tray.blocked(), true)
  tray.alert({ title: '作业快截止', text: '数据结构' })
  tray.dispose()
  assert.equal(shown.at(-1).closed, true)
})

test('第一次藏进托盘时弹一条说明，只弹这一次，重启以后也不再弹', async (t) => {
  const f = await fixture(t)
  const shown = []
  class Notification {
    constructor(options) { this.options = options; this.handlers = {} }
    on(name, handler) { this.handlers[name] = handler }
    show() { shown.push(this) }
  }
  const make = () => createTray({ Tray: fakes().Tray, Menu: { buildFromTemplate: items => items }, Notification, file: f.file, title: '校园智能体', icon: 'icon', blank: 'blank', show: () => { f.calls.push('show') }, quit: () => {} })
  const tray = make()
  tray.hidden()
  tray.hidden()
  assert.equal(shown.length, 1)
  assert.equal(shown[0].options.title, HINT.title)
  shown[0].handlers.click()
  assert.deepEqual(f.calls, ['show'])
  assert.equal(readShell(f.file).hinted, true)
  make().hidden()
  assert.equal(shown.length, 1)
  // 弹过说明不影响别的选择。
  assert.deepEqual(readShell(f.file), { closeToTray: true, notify: true, hinted: true })
})

test('打开后托盘上出现图标：点它叫回主窗口，右键菜单能打开和退出；下次启动还记得', async (t) => {
  const f = await fixture(t)
  const tray = f.create()
  assert.equal(tray.set(true), true)
  assert.deepEqual(JSON.parse(await readFile(f.file, 'utf8')), { closeToTray: true, notify: true, hinted: false })
  assert.equal(f.icons.length, 1)
  const icon = f.icons[0]
  assert.equal(icon.tip, '校园智能体')
  icon.handlers.click()
  icon.menu.find(item => item.label === '打开主窗口').click()
  icon.menu.find(item => item.label === '退出').click()
  assert.deepEqual(f.calls, ['show', 'show', 'quit'])
  // 重复打开不会多出一个图标。
  tray.set(true)
  assert.equal(f.icons.length, 1)
  tray.dispose()
  assert.equal(f.icons.length, 0)
  // 下次启动：读到存着的选择，图标直接就在。
  assert.equal(f.create().enabled(), true)
  assert.equal(f.icons.length, 1)
})

test('关掉后图标撤走，选择也存下来', async (t) => {
  const f = await fixture(t)
  const tray = f.create()
  tray.set(true)
  assert.equal(tray.set(false), false)
  assert.equal(f.icons.length, 0)
  assert.equal(readCloseToTray(f.file), false)
  assert.equal(f.create().enabled(), false)
})

test('来了新消息图标就闪：和空白图来回换，提示和右键菜单里看得到是什么；点图标打开最新的那一条，不再闪', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const f = await fixture(t)
  const tray = f.create()
  tray.set(true)
  const icon = f.icons[0]
  assert.deepEqual(tray.alert({ title: 'CC98 新消息', text: '  老王 回复了你：\n周六打球吗  ', sessionId: 'ses_1', extra: 'x' }), { title: 'CC98 新消息', text: '老王 回复了你： 周六打球吗', sessionId: 'ses_1' })
  tray.alert({ title: '公众号有新文章', text: '浙大体艺：羽毛球赛报名', panel: 'campus.affairs' })
  assert.equal(tray.pending(), 2)
  assert.equal(icon.tip, '校园智能体 · 2 条新消息\n公众号有新文章：浙大体艺：羽毛球赛报名\nCC98 新消息：老王 回复了你： 周六打球吗')
  assert.deepEqual(icon.menu.map(item => item.label ?? item.type), ['公众号有新文章：浙大体艺：羽毛球赛报名', 'CC98 新消息：老王 回复了你： 周六打球吗', 'separator', '打开主窗口', 'separator', '退出'])
  // 半秒换一次。
  assert.equal(icon.icon, 'icon')
  t.mock.timers.tick(BLINK_MS)
  assert.equal(icon.icon, 'blank')
  t.mock.timers.tick(BLINK_MS)
  assert.equal(icon.icon, 'icon')
  t.mock.timers.tick(BLINK_MS)
  assert.equal(icon.icon, 'blank')
  // 点图标：打开最新的一条，图标换回来，之后不再闪，提示和菜单也回到原样。
  icon.handlers.click()
  assert.deepEqual(f.calls, [['open', { title: '公众号有新文章', text: '浙大体艺：羽毛球赛报名', panel: 'campus.affairs' }]])
  assert.equal(icon.icon, 'icon')
  assert.equal(tray.pending(), 0)
  t.mock.timers.tick(BLINK_MS * 4)
  assert.equal(icon.icon, 'icon')
  assert.equal(icon.tip, '校园智能体')
  assert.deepEqual(icon.menu.map(item => item.label ?? item.type), ['打开主窗口', 'separator', '退出'])
})

test('右键菜单里点哪条开哪条；人回到主窗口就算看过；同一个任务反复提醒只留最新一条', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const f = await fixture(t)
  const tray = f.create()
  tray.set(true)
  const icon = f.icons[0]
  tray.alert({ title: '成绩出了', text: '数据结构基础 92', sessionId: 'ses_grades' })
  tray.alert({ title: 'CC98 新消息', text: '第一次', sessionId: 'ses_cc98' })
  tray.alert({ title: 'CC98 新消息', text: '第二次', sessionId: 'ses_cc98' })
  assert.equal(tray.pending(), 2)
  assert.deepEqual(icon.menu.slice(0, 2).map(item => item.label), ['CC98 新消息：第二次', '成绩出了：数据结构基础 92'])
  icon.menu[1].click()
  assert.deepEqual(f.calls, [['open', { title: '成绩出了', text: '数据结构基础 92', sessionId: 'ses_grades' }]])
  assert.equal(tray.pending(), 0)
  // 回到主窗口：正在闪的停下，停在原来的图标上。
  tray.alert({ title: '提醒', text: '三点去实验室' })
  t.mock.timers.tick(BLINK_MS)
  assert.equal(icon.icon, 'blank')
  tray.clear()
  assert.equal(icon.icon, 'icon')
  assert.equal(tray.pending(), 0)
  t.mock.timers.tick(BLINK_MS * 2)
  assert.equal(icon.icon, 'icon')
  // 没有消息时点图标只是把主窗口叫回来。
  icon.handlers.click()
  assert.equal(f.calls.at(-1), 'show')
})

test('认不出来的消息不收；太长的截短；去处只认对话和侧栏上的一页；托盘关着时只是攒着', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  for (const input of [undefined, null, 'text', {}, { title: '   ' }, { text: '只有内容' }]) assert.equal(cleanAlert(input), undefined)
  const long = cleanAlert({ title: '题'.repeat(50), text: '字'.repeat(200), sessionId: '../etc', panel: 'campus.affairs' })
  assert.equal(long.title.length, 30)
  assert.equal(long.text.length, 80)
  assert.ok(long.title.endsWith('…') && long.text.endsWith('…'))
  // 写得不像编号的对话不认，退到侧栏上的那一页。
  assert.equal(long.sessionId, undefined)
  assert.equal(long.panel, 'campus.affairs')
  assert.equal(cleanAlert({ title: '邮箱有新邮件', panel: 'campus.affairs:personal' }).panel, 'campus.affairs:personal')
  const f = await fixture(t)
  // 用户关过托盘：消息只是攒着，没有图标。
  await writeFile(f.file, '{"closeToTray":false}')
  const tray = f.create()
  assert.equal(tray.alert({ title: '提醒' }).title, '提醒')
  assert.equal(tray.pending(), 1)
  assert.equal(f.icons.length, 0)
  // 这时打开托盘：图标出来就带着这条消息，并且在闪。
  tray.set(true)
  assert.equal(f.icons[0].tip, '校园智能体 · 1 条新消息\n提醒')
  t.mock.timers.tick(BLINK_MS)
  assert.equal(f.icons[0].icon, 'blank')
  // 提示再长也不超过系统的上限。
  for (let index = 0; index < 5; index++) tray.alert({ title: `很长的标题很长的标题很长的标题 ${index}`, text: '字'.repeat(80) })
  assert.ok(f.icons[0].tip.length <= 127)
  tray.dispose()
  assert.equal(f.icons.length, 0)
})
