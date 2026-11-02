import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { CHANNELS, installKeyboard } = require('./keyboard.cjs')
// 用引擎自己的协议，和 main.cjs 里取的是同一份。
const protocol = await import('@deepseek-ai/dsh-client-shortcuts/protocol')

const ORIGIN = 'http://127.0.0.1:4173'
/** 引擎页面注册的命令：⌘N 新对话，F、G 一起按的组合。 */
const DEFINITIONS = [
  { id: 'session.new', defaults: { 'desktop:macos': { code: 'KeyN', modifiers: ['primary'] } } },
  { id: 'campus.pair', defaults: { 'desktop:macos': { code: 'KeyF', secondCode: 'KeyG', modifiers: [] } } },
]

/** 假的主窗口和 ipcMain：只记下壳对它们做了什么。 */
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-keyboard-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'nested', 'keybindings.json')
  const mainFrame = { url: `${ORIGIN}/`, parent: null, name: '' }
  const contents = Object.assign(new EventEmitter(), {
    mainFrame, focusedFrame: mainFrame, sent: [], ignoreMenu: false,
    send(channel, value) { this.sent.push({ channel, value }) },
    setIgnoreMenuShortcuts(on) { this.ignoreMenu = on },
  })
  const window = Object.assign(new EventEmitter(), {
    webContents: contents, destroyed: false, focused: true, closed: false,
    isDestroyed() { return this.destroyed }, isFocused() { return this.focused }, isEnabled: () => true,
    close() { this.closed = true },
  })
  const handlers = new Map()
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel) }
  let origin = ORIGIN
  installKeyboard({ window, ipcMain, protocol, file, origin: () => origin })
  const event = { sender: contents, senderFrame: mainFrame }
  const call = (name, ...args) => handlers.get(CHANNELS[name])(event, ...args)
  /** 按一下（或松开）一个键；返回壳有没有把它拦下来。 */
  const key = (props = {}) => {
    const input = { type: 'keyDown', code: 'KeyN', key: 'n', control: false, alt: false, shift: false, meta: true, isAutoRepeat: false, isComposing: false, modifiers: [], ...props }
    const native = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true } }
    contents.emit('before-input-event', native, input)
    return native.defaultPrevented
  }
  const inputs = () => contents.sent.filter(item => item.channel === CHANNELS.input).map(item => item.value)
  return { window, contents, mainFrame, handlers, event, call, key, inputs, file, setOrigin: value => { origin = value } }
}

test('页面取到键位以后，按下 ⌘N 转给页面并拦下；没绑的键、输入法组合、录键位时都放过', async t => {
  const f = fixture(t)
  assert.equal(f.key(), false, '页面还没来取键位时什么都不拦')
  const state = await f.call('get', DEFINITIONS)
  assert.equal(state.status, 'ready')
  assert.equal(f.key({ code: 'KeyX', key: 'x' }), false)
  assert.equal(f.key({ isComposing: true }), false)
  assert.equal(f.key(), true)
  assert.deepEqual(f.inputs().at(-1), {
    kind: 'keyboard', revision: state.revision, frameName: '', code: 'KeyN',
    repeat: false, control: false, alt: false, shift: false, meta: true,
  })
  assert.equal(f.contents.ignoreMenu, true, '拦下的组合不再让菜单接着响')
  // 按住不放：重复的按键照样拦下，告诉页面这是重复的；松开也拦。
  assert.equal(f.key({ isAutoRepeat: true }), true)
  assert.equal(f.inputs().at(-1).repeat, true)
  assert.equal(f.key({ type: 'keyUp' }), true)
  assert.equal(f.key({ type: 'keyUp', code: 'KeyX', key: 'x' }), false)
  await f.call('recording', true)
  const count = f.inputs().length
  assert.equal(f.key(), false)
  assert.equal(f.inputs().length, count)
  await f.call('recording', false)
  assert.equal(f.key(), true)
})

test('改键位写进 keybindings.json；旧版本号改不了，也关不了窗口', async t => {
  const f = fixture(t)
  const state = await f.call('get', DEFINITIONS)
  const saved = await f.call('edit', { type: 'set', id: 'session.new', binding: { code: 'KeyK', modifiers: ['primary'] } }, state.revision)
  assert.equal(saved.status, 'saved')
  assert.deepEqual(JSON.parse(fs.readFileSync(f.file, 'utf8')).profiles['desktop:macos']['session.new'], { code: 'KeyK', modifiers: ['primary'] })
  assert.equal(f.key(), false, '⌘N 改成 ⌘K 以后就不拦了')
  assert.equal(f.key({ code: 'KeyK', key: 'k' }), true)
  assert.equal((await f.call('edit', { type: 'reset-all' }, state.revision)).status, 'stale')
  await f.call('close', state.revision)
  assert.equal(f.window.closed, false)
  f.window.focused = false
  await f.call('close', saved.snapshot.revision)
  assert.equal(f.window.closed, false, '窗口不在前台时不关')
  f.window.focused = true
  await f.call('close', saved.snapshot.revision)
  assert.equal(f.window.closed, true)
})

test('只接受主窗口里引擎页面的请求；引擎起来以前谁都不接', async t => {
  const f = fixture(t)
  const get = f.handlers.get(CHANNELS.get)
  await assert.rejects(get({ ...f.event, sender: {} }, DEFINITIONS), /只接受主窗口/)
  await assert.rejects(get({ ...f.event, senderFrame: { url: `${ORIGIN}/` } }, DEFINITIONS), /只接受主窗口/)
  f.mainFrame.url = 'https://example.com/'
  await assert.rejects(get(f.event, DEFINITIONS), /只接受主窗口/)
  f.mainFrame.url = `${ORIGIN}/`
  f.setOrigin('')
  await assert.rejects(get(f.event, DEFINITIONS), /只接受主窗口/)
  f.setOrigin(ORIGIN)
  await assert.rejects(get(f.event, [{ id: 'bad', defaults: { 'desktop:macos': { code: 'bogus', modifiers: [] } } }]))
  assert.equal((await get(f.event, DEFINITIONS)).status, 'ready')
})

test('两个普通键一起按才算组合；窗口失焦就重来；偏好文件坏了不去覆盖', async t => {
  const f = fixture(t)
  await f.call('get', DEFINITIONS)
  const plain = { meta: false }
  assert.equal(f.key({ ...plain, code: 'KeyF', key: 'f' }), false, '第一个键照常给页面')
  assert.equal(f.key({ ...plain, code: 'KeyG', key: 'g' }), true)
  assert.deepEqual([f.inputs().at(-1).code, f.inputs().at(-1).secondCode], ['KeyF', 'KeyG'])
  f.key({ ...plain, type: 'keyUp', code: 'KeyF', key: 'f' })
  f.key({ ...plain, type: 'keyUp', code: 'KeyG', key: 'g' })
  assert.equal(f.key({ ...plain, code: 'KeyF', key: 'f' }), false)
  f.window.emit('blur')
  assert.equal(f.key({ ...plain, code: 'KeyG', key: 'g' }), false, '失焦以后按住的键不算数')
  fs.mkdirSync(path.dirname(f.file), { recursive: true })
  fs.writeFileSync(f.file, 'not json')
  const state = await f.call('get', DEFINITIONS)
  assert.equal(state.status, 'unreadable')
  assert.equal((await f.call('edit', { type: 'reset-all' }, state.revision)).status, 'unreadable')
  assert.equal(fs.readFileSync(f.file, 'utf8'), 'not json')
})

test('焦点在 iframe 里时报最外层 iframe 的名字', async t => {
  const f = fixture(t)
  await f.call('get', DEFINITIONS)
  const outer = { url: 'https://example.com/', parent: f.mainFrame, name: 'campus-preview' }
  f.contents.focusedFrame = { url: 'https://example.com/inner', parent: outer, name: 'inner' }
  assert.equal(f.key(), true)
  assert.deepEqual([f.inputs().at(-1).kind, f.inputs().at(-1).frameName], ['iframe', 'campus-preview'])
})

test('页面整个换掉才收回命令，同一页里跳转不算；窗口关了撤掉所有通道', async t => {
  const f = fixture(t)
  await f.call('get', DEFINITIONS)
  f.contents.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false })
  assert.equal(f.key(), true)
  f.key({ type: 'keyUp' })
  f.contents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
  assert.equal(f.key(), true)
  f.key({ type: 'keyUp' })
  f.contents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
  assert.equal(f.key(), false)
  f.window.destroyed = true
  f.window.emit('closed')
  assert.equal(f.handlers.size, 0)
  assert.equal(f.contents.listenerCount('before-input-event'), 0)
})
