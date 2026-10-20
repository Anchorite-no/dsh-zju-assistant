import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { assessHardware, TtsKit } from './tts.mjs'
import { digest, installTts, UV } from './tts-install.mjs'

const GB = 1024 ** 3
const hardware = (overrides = {}) => ({ platform: 'win32', arch: 'x64', ram: 32 * GB, freeDisk: 40 * GB, freeCommit: 24 * GB,
  gpus: [{ index: 0, name: 'RTX 3060', total: 12 * GB, free: 10 * GB, driver: '617.14', compute: 8.6 }], ...overrides })
const room = t => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-tts-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 })); return dir }
const wav = () => { const b = Buffer.alloc(44); b.write('RIFF'); b.write('WAVE', 8); return b.toString('base64') }

test('按能力和资源检查，低于 5060 的兼容显卡可以用；内存不足禁止加载而非硬试', () => {
  assert.equal(assessHardware(hardware()).runnable, true)
  assert.equal(assessHardware(hardware({ gpus: [] })).compatible, false)
  assert.equal(assessHardware(hardware({ gpus: [{ ...hardware().gpus[0], compute: 7.5 }] })).compatible, false)
  const low = assessHardware(hardware({ freeCommit: 10 * GB }))
  assert.equal(low.compatible, true)
  assert.equal(low.runnable, false)
  assert.match(low.runReasons.join(' '), /提交内存/)
  assert.equal(assessHardware(hardware({ freeDisk: 5 * GB })).compatible, false)
})

test('默认不检测、不安装、不启动；不兼容环境不会进入安装，失败后可重试', async t => {
  const dataDir = room(t); let checks = 0, installs = 0, good = false
  const kit = new TtsKit({ dataDir, plugins: { disabled: () => [] }, workspace: async () => dataDir,
    probe: async () => { checks++; return assessHardware(hardware({ gpus: good ? hardware().gpus : [] })) },
    install: async () => { installs++ }, launch: () => assert.fail('must not launch') })
  assert.equal(kit.snapshot().enabled, false)
  assert.deepEqual(await kit.open({ name: '../bad' }), { url: null })
  assert.equal(checks, 0)
  await kit.install(); await kit.done
  assert.equal(installs, 0)
  assert.match(kit.snapshot().error, /NVIDIA/)
  good = true
  await Promise.all([kit.install(), kit.install()]); await kit.done
  assert.equal(installs, 1)
  assert.equal(kit.snapshot().error, '')
  assert.equal(kit.snapshot().enabled, false)
})

test('安装和音色就绪才能开启；卸载只移除运行环境，保留参考音频和成片', async t => {
  const dataDir = room(t)
  const kit = new TtsKit({ dataDir, plugins: { disabled: () => [] }, workspace: async () => dataDir })
  await assert.rejects(() => kit.set({ enabled: true }), /安装配音/)
  kit.installed = () => true
  await assert.rejects(() => kit.voice({ audio: 'bad', text: '测试' }), /WAV/)
  await kit.voice({ audio: wav(), text: '这是一段参考声音。' })
  await kit.set({ enabled: true })
  assert.equal(kit.snapshot().enabled, true)
  fs.mkdirSync(kit.home, { recursive: true }); fs.writeFileSync(path.join(kit.home, 'model'), 'x')
  const film = path.join(dataDir, 'film.html'); fs.writeFileSync(film, 'keep')
  await kit.remove()
  assert.equal(kit.snapshot().enabled, false)
  assert.equal(fs.existsSync(kit.home), false)
  assert.equal(fs.existsSync(kit.voiceFile()), true)
  assert.equal(fs.readFileSync(film, 'utf8'), 'keep')
})

test('运行前重新查内存，不能沿用安装时的检测结果', async t => {
  const dataDir = room(t)
  const kit = new TtsKit({ dataDir, plugins: { disabled: () => [] }, workspace: async () => dataDir,
    probe: async () => assessHardware(hardware({ freeCommit: 3 * GB })), launch: () => assert.fail('memory guard must prevent launch') })
  kit.installed = () => true
  await kit.voice({ audio: wav(), text: '测试' }); await kit.set({ enabled: true })
  fs.mkdirSync(path.join(dataDir, 'dist')); fs.writeFileSync(path.join(dataDir, 'dist/a.html'), 'test')
  await assert.rejects(() => kit.open({ name: '../outside.html' }), /文件名/)
  await assert.rejects(() => kit.open({ name: 'a.html' }), /提交内存/)
})

test('独立环境安装、文件哈希校验和失败重试；所有组件齐备才写安装完成标记', async t => {
  const root = room(t), home = path.join(root, 'runtime'), payload = Buffer.from('synthetic model fixture')
  const sha = createHash('sha256').update(payload).digest('hex')
  const calls = [], model = { repository: 'Qwen/test', files: [{ path: 'model.safetensors', bytes: payload.length, sha256: sha }] }
  let bad = true, downloads = 0
  const tools = { model,
    download: async (_url, file) => fs.writeFileSync(file, 'zip fixture'),
    digest: async file => file.endsWith('uv.zip') ? UV.sha256 : digest(file),
    run: async (command, args, options = {}) => {
      calls.push({ command, args, env: options.env })
      if (command.endsWith('tar.exe')) fs.writeFileSync(path.join(home, 'uv.exe'), 'fixture')
    },
    downloadFile: async (_transfer, _url, { out }) => { downloads++; fs.writeFileSync(out, bad ? Buffer.from('bad') : payload) },
  }
  await assert.rejects(() => installTts(home, () => {}, tools), /校验失败/)
  assert.equal(fs.existsSync(path.join(home, 'installed.json')), false)
  bad = false
  await installTts(home, () => {}, tools)
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, 'installed.json'))).model, model.repository)
  await installTts(home, () => {}, tools)
  assert.equal(downloads, 2, 'verified model is reused on retry')
  assert.ok(calls.some(c => c.args.includes('--managed-python')))
  assert.ok(calls.some(c => c.args.includes('torch==2.8.0')))
  assert.ok(calls.filter(c => path.basename(c.command) === 'uv.exe').every(c => c.env.UV_PYTHON_INSTALL_DIR.startsWith(home)))
})
