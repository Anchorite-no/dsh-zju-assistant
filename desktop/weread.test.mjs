import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { createWereadBridge, visionConfig } = require('./weread.cjs')
const coreRoot = fileURLToPath(new URL('../core/', import.meta.url))

/** 一个临时的数据目录：里面有档案目录和密钥文件。 */
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-weread-'))
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }) })
  const profileDir = path.join(root, 'profile'), keysFile = path.join(root, 'api-keys.local.yaml')
  fs.mkdirSync(profileDir)
  return { root, profileDir, keysFile, dataDir: path.join(root, 'weread') }
}

test('识别模型用密钥文件里对话的 Key；开关关着或没有 Key 时不给', (t) => {
  const { profileDir, keysFile } = fixture(t)
  const config = (env = {}) => visionConfig({ profileDir, keysFile, env })
  assert.equal(config(), undefined, '还没有密钥文件')
  fs.writeFileSync(keysFile, 'version: 1\nrefs:\n  DEEPSEEK_API_KEY: chat-key\n')
  assert.deepEqual([config().apiKey, config().model, new URL(config().endpoint).hostname], ['chat-key', 'deepseek-flash', 'api.deepseek.com'])
  assert.deepEqual([config({ WEREAD_VISION_ENDPOINT: 'https://model.example/chat', WEREAD_VISION_MODEL: 'other' }).endpoint, config({ WEREAD_VISION_MODEL: 'other' }).model], ['https://model.example/chat', 'other'])
  fs.writeFileSync(keysFile, 'version: 1\nrefs:\n  DEEPSEEK_API_KEY: chat-key\n  WEREAD_VISION_API_KEY: vision-key\n')
  assert.equal(config().apiKey, 'vision-key', '单独给识别用的 Key 优先')
  fs.writeFileSync(path.join(profileDir, 'wechat.json'), JSON.stringify({ autoVerify: false }))
  assert.equal(config(), undefined, '「自动完成验证」关着')
})

test('壳把技能的浏览器开在管道上：命令连过来就能用，后台的命令不开窗口，插件关着时一律拒绝', async (t) => {
  const { profileDir, keysFile, dataDir } = fixture(t)
  const handlers = new Map()
  let partition = ''
  const bridge = await createWereadBridge({
    coreRoot, dataDir, profileDir, keysFile,
    // 这里用到的调用都不开窗口。
    BrowserWindow: class { constructor() { assert.fail('不该开窗口') } },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler), removeHandler: name => handlers.delete(name) },
    session: { fromPartition: (name) => { partition = name; return { cookies: { get: async ({ name: wanted }) => wanted === 'wr_vid' ? [{ name: wanted, value: 'vid' }] : [] } } } },
  })
  t.after(() => { bridge.close() })
  assert.equal(bridge.env.WEREAD_DATA_DIR, dataDir)
  assert.equal(partition, 'persist:campus-weread')
  assert.deepEqual([...handlers.keys()], ['weread:captcha-result'])

  // 像技能的命令那样连上去：一行一条 JSON，按 id 对回结果。
  const socket = net.connect(bridge.env.WEREAD_BROWSER_ENDPOINT)
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject) })
  const waiting = new Map()
  createInterface({ input: socket }).on('line', (line) => { const message = JSON.parse(line); waiting.get(message.id)?.(message) })
  let id = 0
  const ask = (action, input, extra = {}) => new Promise((resolve) => { waiting.set(++id, resolve); socket.write(`${JSON.stringify({ id, action, input, ...extra })}\n`) })

  assert.equal((await ask('cookie', 'wr_vid')).result, 'vid')
  assert.equal((await ask('captcha', {}, { interactive: false })).error.code, 'verification_required')
  assert.equal((await ask('login', undefined, { interactive: false })).error.code, 'login_required')
  assert.equal((await ask('quit')).error.code, 'invalid_action')

  fs.writeFileSync(path.join(profileDir, 'plugins.json'), JSON.stringify({ disabled: ['campus.wechat'] }))
  assert.equal((await ask('cookie', 'wr_vid')).error.code, 'plugin_disabled')
  fs.writeFileSync(path.join(profileDir, 'plugins.json'), JSON.stringify({ disabled: [] }))
  assert.equal((await ask('cookie', 'wr_vid')).result, 'vid', '开关改了马上生效')

  const closed = new Promise((resolve) => { socket.once('close', resolve) })
  bridge.close()
  await closed
  assert.equal(handlers.size, 0)
})
