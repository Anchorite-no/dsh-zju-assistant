import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EventEmitter } from 'node:events'
import bridgeModule from './weread.cjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const bookId = 'MP_WXS_1234567890'
async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weread-bridge-'))
  const w = { owner: 'synthetic-owner', calls: [], windows: [], opened: 0, handlers: new Map() }
  class Window extends EventEmitter {
    constructor() {
      super(); w.windows.push(this)
      this.webContents = { mainFrame: { url: 'https://weread.qq.com/' }, setWindowOpenHandler() {}, on() {}, executeJavaScript: async () => { w.opened++; return { status: 'opened' } } }
    }
    isDestroyed() { return !!this.closed }
    show() {} focus() {} async loadURL() {}
    close() { this.closed = true; this.emit('closed') }
  }
  const bridge = await bridgeModule.createWereadBridge({ root, app: { getPath: () => dir }, BrowserWindow: Window,
    ipcMain: { handle: (name, fn) => w.handlers.set(name, fn), removeHandler: name => w.handlers.delete(name) },
    session: { fromPartition: () => ({ cookies: { get: async () => [{ name: 'wr_vid', value: w.owner }, { name: 'wr_skey', value: 'synthetic-cookie' }] }, fetch: async (url, options) => {
      w.calls.push({ url, options })
      const body = options.headers['x-wr-ticket'] ? { reviews: [] } : { errCode: -2041 }
      return new Response(JSON.stringify(body), { status: 200 })
    } }) } })
  w.rpc = async (action, input = {}, headers = {}) => (await fetch(bridge.env.CAMPUS_WEREAD_BRIDGE_URL, { method: 'POST', headers: { authorization: `Bearer ${bridge.env.CAMPUS_WEREAD_BRIDGE_TOKEN}`, ...headers }, body: JSON.stringify({ action, input }) })).json()
  w.proof = taskId => {
    const sender = w.windows[0].webContents
    return w.handlers.get('campus:weread-proof')({ sender, senderFrame: sender.mainFrame }, { taskId, ret: 0, ticket: 'synthetic-ticket', randstr: 'synthetic-randstr' })
  }
  w.challenge = () => w.rpc('article.list', { account: bookId, limit: 1 })
  t.after(async () => { await bridge.close(); fs.rmSync(dir, { recursive: true, force: true }) })
  return w
}

test('bridge rejects unauthenticated and browser-origin requests before touching the session', async t => {
  const w = await setup(t)
  assert.equal((await w.rpc('article.list', {}, { authorization: 'wrong' })).status, 'forbidden')
  assert.equal((await w.rpc('article.list', {}, { origin: 'https://example.com' })).status, 'forbidden')
  assert.equal(w.calls.length, 0)
})

test('owned verification resumes exact request once and never returns the proof', async t => {
  const w = await setup(t), task = await w.challenge()
  assert.equal(task.status, 'verification_required')
  await w.rpc('verification.open', { task: task.taskId })
  await w.rpc('verification.open', { task: task.taskId })
  assert.equal(w.opened, 1)
  assert.equal((await w.proof(task.taskId)).ok, true)
  const result = await w.rpc('verification.status', { task: task.taskId })
  assert.equal(result.state, 'complete'); assert.equal(result.result.articles.length, 0)
  assert.equal(w.calls.length, 2)
  assert.doesNotMatch(JSON.stringify(result), /synthetic-ticket|synthetic-randstr|synthetic-cookie/)
  assert.equal((await w.proof(task.taskId)).ok, false)
})

test('account changes fail a verified task before retrying any business request', async t => {
  const w = await setup(t), task = await w.challenge()
  await w.rpc('verification.open', { task: task.taskId }); w.owner = 'another-owner'
  await w.proof(task.taskId)
  const result = await w.rpc('verification.status', { task: task.taskId })
  assert.equal(result.state, 'failed'); assert.equal(result.result.status, 'account_changed'); assert.equal(w.calls.length, 1)
})

test('cancellation closes the owned window and rejects late proof', async t => {
  const w = await setup(t), task = await w.challenge()
  await w.rpc('verification.open', { task: task.taskId })
  await w.rpc('operation.cancel')
  assert.equal((await w.rpc('verification.status', { task: task.taskId })).state, 'cancelled')
  assert.equal(w.windows[0].closed, true); assert.equal((await w.proof(task.taskId)).ok, false); assert.equal(w.calls.length, 1)
})
