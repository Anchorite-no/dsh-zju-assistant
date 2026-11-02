import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { installShortcuts } from './shortcuts.mjs'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-shortcuts-'))
  const file = path.join(root, 'keybindings.json'), handlers = new Map(), sent = []
  const window = new EventEmitter(), webContents = new EventEmitter()
  Object.assign(window, { webContents, isDestroyed: () => false, close: () => { window.closed = true } })
  Object.assign(webContents, { mainFrame: { url: 'http://127.0.0.1:1234/' }, send: (channel, value) => sent.push({ channel, value }) })
  webContents.focusedFrame = webContents.mainFrame
  const event = { sender: webContents, senderFrame: webContents.mainFrame }
  installShortcuts({ window, file, origin: () => 'http://127.0.0.1:1234', platform: 'darwin',
    ipcMain: { handle: (name, fn) => handlers.set(name, fn), removeHandler: name => handlers.delete(name) } })
  t.after(() => { window.emit('closed'); fs.rmSync(root, { recursive: true, force: true }) })
  const call = (name, ...args) => handlers.get('campus:' + name)(event, ...args)
  const input = props => {
    let stopped = false
    webContents.emit('before-input-event', { preventDefault: () => { stopped = true } }, { type: 'keyDown', code: 'KeyN', meta: true, ...props })
    return stopped
  }
  return { window, webContents, event, handlers, sent, file, call, input }
}
const defs = [{ id: 'campus.new', defaults: { 'desktop:macos': { code: 'KeyN', modifiers: ['primary'] } } }]

test('native startup, bindings, IME, recording and unbound keys', async t => {
  const f = fixture(t)
  const state = await f.call('shortcuts:get', defs)
  assert.equal(state.status, 'ready')
  assert.equal(f.input({ code: 'KeyX' }), false)
  assert.equal(f.input({ isComposing: true }), false)
  await f.call('shortcuts:recording', true)
  assert.equal(f.input({}), false)
  await f.call('shortcuts:recording', false)
  assert.equal(f.input({}), true)
  assert.equal(f.sent.at(-1).value.kind, 'keyboard')
  assert.equal(f.sent.at(-1).value.revision, state.revision)
  const count = f.sent.length
  assert.equal(f.input({ isAutoRepeat: true }), true)
  assert.equal(f.sent.length, count)
  assert.equal(f.input({ type: 'keyUp' }), true)
  assert.equal(f.input({ type: 'keyUp', code: 'KeyX' }), false)
})

test('persistence, stale revisions and close validation use engine protocol', async t => {
  const f = fixture(t)
  const state = await f.call('shortcuts:get', defs)
  const saved = await f.call('shortcuts:edit', { type: 'set', id: 'campus.new', binding: { code: 'KeyK', modifiers: ['primary'] } }, state.revision)
  assert.equal(saved.status, 'saved')
  assert.ok(JSON.parse(fs.readFileSync(f.file, 'utf8')).profiles['desktop:macos']['campus.new'])
  assert.equal(f.input({}), false)
  assert.equal(f.input({ code: 'KeyK' }), true)
  assert.equal((await f.call('shortcuts:edit', { type: 'reset-all' }, state.revision)).status, 'stale')
  assert.throws(() => f.call('keyboard:close', state.revision), /Stale/)
  await f.call('keyboard:close', saved.snapshot.revision)
  assert.equal(f.window.closed, true)
})

test('untrusted windows, frames, origins and malformed catalogs cannot use IPC', async t => {
  const f = fixture(t)
  const get = f.handlers.get('campus:shortcuts:get')
  await assert.rejects(get({ ...f.event, sender: {} }, defs), /Untrusted/)
  await assert.rejects(get({ ...f.event, senderFrame: {} }, defs), /Untrusted/)
  f.webContents.mainFrame.url = 'https://example.com/'
  await assert.rejects(get(f.event, defs), /Untrusted/)
  f.webContents.mainFrame.url = 'http://127.0.0.1:1234/'
  await assert.rejects(get(f.event, [{ id: 'invalid', defaults: { 'desktop:macos': { code: 'bogus', modifiers: [] } } }]))
  await f.call('shortcuts:get', defs)
  f.webContents.focusedFrame = {}
  assert.equal(f.input({}), false)
})

test('two-key chords reset on blur; corrupt preferences are not overwritten', async t => {
  const f = fixture(t)
  await f.call('shortcuts:get', [{ id: 'campus.pair', defaults: { 'desktop:macos': { code: 'KeyF', secondCode: 'KeyG', modifiers: [] } } }])
  assert.equal(f.input({ code: 'KeyF', meta: false }), false)
  f.window.emit('blur')
  assert.equal(f.input({ code: 'KeyG', meta: false }), false)
  assert.equal(f.input({ code: 'KeyF', meta: false }), true)
  fs.writeFileSync(f.file, 'not json')
  const state = await f.call('shortcuts:get', defs)
  assert.equal(state.status, 'unreadable')
  assert.equal((await f.call('shortcuts:edit', { type: 'reset-all' }, state.revision)).status, 'unreadable')
  assert.equal(fs.readFileSync(f.file, 'utf8'), 'not json')
  f.window.emit('closed')
  assert.equal(f.handlers.size, 0)
})

test('only full main-frame navigation revokes the active catalog', async t => {
  const f = fixture(t)
  await f.call('shortcuts:get', defs)
  f.webContents.emit('did-start-navigation', {}, 'https://example.com', false, false)
  assert.equal(f.input({}), true)
  f.input({ type: 'keyUp' })
  f.webContents.emit('did-start-navigation', {}, 'http://127.0.0.1:1234/#page', true, true)
  assert.equal(f.input({}), true)
  f.input({ type: 'keyUp' })
  f.webContents.emit('did-start-navigation', {}, 'http://127.0.0.1:1234/', false, true)
  assert.equal(f.input({}), false)
})
