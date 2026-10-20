/** Optional local narration. The default state performs no installation or model loading. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { CORE_ROOT } from './skills.mjs'
import { installTts, MODEL, MODEL_BYTES, pythonPath, RUNTIME_VERSION } from './tts-install.mjs'

const GB = 1024 ** 3
const exec = promisify(execFile)
const powershell = () => path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
const message = error => error instanceof Error ? error.message : String(error)
const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback } }
const write = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${randomUUID()}.tmp`
  try { fs.writeFileSync(temp, JSON.stringify(data) + '\n'); fs.renameSync(temp, file) }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
}

export function assessHardware({ platform, arch, gpus = [], ram, freeDisk, freeCommit }) {
  const reasons = [], warnings = []
  if (platform !== 'win32' || arch !== 'x64') reasons.push('配音选装目前支持 Windows x64。')
  const gpu = [...gpus].filter(g => g.compute >= 8 && g.total >= 6 * GB && Number.parseFloat(g.driver) >= 570.65).sort((a, b) => b.free - a.free)[0]
  if (!gpu) reasons.push('需要支持 CUDA 12.8 和 BF16、至少 6 GB 显存的 NVIDIA 显卡及兼容驱动。')
  // Windows reserves a small part of installed RAM/VRAM; 32 GB hardware may report 31.8 GB.
  if (!(Math.round(ram / GB) >= 16)) reasons.push('需要至少 16 GB 系统内存。')
  if (!(freeDisk >= 25 * GB)) reasons.push('安装位置需要至少 25 GB 可用空间。')
  if (gpu && Math.round(gpu.total / GB) < 8) warnings.push('显存较紧张，推荐 RTX 5060 级别、8 GB 显存及以上。')
  if (Math.round(ram / GB) < 32) warnings.push('推荐 32 GB 系统内存。')
  const runReasons = [...reasons.filter(x => !x.includes('25 GB'))]
  if (gpu && gpu.free < 5.5 * GB) runReasons.push('空闲显存不足 5.5 GB，请先关闭占用显卡的程序。')
  if (!(freeCommit >= 20 * GB)) runReasons.push('系统提交内存余量不足 20 GB，暂不加载模型。请先关闭占内存的程序。')
  return { compatible: !reasons.length, runnable: !runReasons.length, reasons, runReasons, warnings, gpu: gpu || null, ram, freeDisk, freeCommit }
}

export async function probeHardware(directory) {
  let gpus = [], freeCommit = 0
  if (process.platform === 'win32') {
    try {
      const { stdout } = await exec('nvidia-smi', ['--query-gpu=index,name,memory.total,memory.free,driver_version,compute_cap', '--format=csv,noheader,nounits'], { timeout: 8000, windowsHide: true })
      gpus = stdout.trim().split(/\r?\n/).map(line => {
        const [index, name, total, free, driver, compute] = line.split(',').map(s => s.trim())
        return { index: Number(index), name, total: Number(total) * 1024 ** 2, free: Number(free) * 1024 ** 2, driver, compute: Number(compute) }
      })
    } catch { /* No NVIDIA driver/runtime detected. */ }
    try {
      const { stdout } = await exec(powershell(), ['-NoProfile', '-NonInteractive', '-Command', '$m=Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory; [Console]::Write([string]([double]$m.CommitLimit-[double]$m.CommittedBytes))'], { timeout: 8000, windowsHide: true })
      freeCommit = Number(stdout.trim())
    } catch { /* Unknown memory is not permission to load a large model. */ }
  }
  let parent = directory
  while (!fs.existsSync(parent) && path.dirname(parent) !== parent) parent = path.dirname(parent)
  const disk = fs.statfsSync(parent)
  return assessHardware({ platform: process.platform, arch: process.arch, gpus, ram: os.totalmem(), freeDisk: disk.bavail * disk.bsize, freeCommit })
}

export class TtsKit {
  constructor({ dataDir, plugins, workspace, probe = probeHardware, install = installTts, launch = spawn }) {
    this.plugins = plugins
    this.workspace = workspace
    this.probe = probe
    this.installer = install
    this.launch = launch
    this.home = path.join(dataDir, 'tools', 'qwen-tts')
    this.data = path.join(dataDir, 'tts')
    this.file = path.join(dataDir, 'profile', 'tts.json')
    this.job = null
    this.hardware = null
    this.error = ''
    this.process = null
    this.endpoint = null
    this.starting = null
    this.generation = 0
  }
  settings() { return read(this.file, { enabled: false }) }
  voiceFile() { return path.join(this.data, 'voices', 'my-voice', 'voice.wav') }
  installed() {
    const marker = read(path.join(this.home, 'installed.json'), {})
    return marker.version === RUNTIME_VERSION && marker.model === MODEL.repository && fs.existsSync(pythonPath(this.home)) && MODEL.files.every(f => {
      try { return fs.statSync(path.join(this.home, 'checkpoints', MODEL.repository.split('/').at(-1), f.path)).size === f.bytes } catch { return false }
    })
  }
  snapshot() {
    return { installed: this.installed(), enabled: this.settings().enabled === true, voice: fs.existsSync(this.voiceFile()), busy: !!this.job,
      step: this.job?.step || '', percent: this.job?.percent ?? null, error: this.error, hardware: this.hardware, running: !!this.process,
      modelBytes: MODEL_BYTES, downloadHint: '运行环境和模型约 8 GB 下载，安装时预留 25 GB；来源为 Astral、PyTorch、PyPI 和魔搭。' }
  }
  async check() { this.hardware = await this.probe(this.home); return this.snapshot() }
  async install() {
    if (this.plugins.disabled().includes('campus.learn')) throw new Error('请先打开「课程讲解」插件。')
    if (this.job) return this.snapshot()
    // Set busy before the first await so concurrent clicks cannot start two installers.
    this.job = { step: '检查运行环境', percent: null }
    this.error = ''
    this.done = (async () => {
      this.hardware = await this.probe(this.home)
      if (!this.hardware.compatible) throw new Error(this.hardware.reasons.join(' '))
      await this.close()
      await this.installer(this.home, (step, percent) => { this.job = { step, percent } })
    })().catch(error => { this.error = message(error) }).finally(() => { this.job = null })
    return this.snapshot()
  }
  async set(input) {
    if (typeof input?.enabled !== 'boolean') throw new Error('配音开关格式不正确。')
    if (input.enabled && (!this.installed() || !fs.existsSync(this.voiceFile()))) throw new Error('请先安装配音并添加参考音频。')
    write(this.file, { enabled: input.enabled })
    if (!input.enabled) await this.close()
    return this.snapshot()
  }
  async voice(input) {
    if (this.job) throw new Error('安装完成后再添加参考音频。')
    if (typeof input?.audio !== 'string' || input.audio.length > 28_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.audio)) throw new Error('参考音频格式不正确或超过 20 MB。')
    const bytes = Buffer.from(input.audio, 'base64')
    if (bytes.length > 20 * 1024 ** 2 || bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error('请提供 WAV 格式的参考音频，最长建议 5–15 秒。')
    const text = typeof input.text === 'string' ? input.text.trim() : ''
    if (!text || text.length > 600) throw new Error('请填写参考音频中说的原话（最多 600 字）。')
    await this.close()
    fs.mkdirSync(path.dirname(this.voiceFile()), { recursive: true })
    fs.writeFileSync(this.voiceFile(), bytes)
    write(path.join(path.dirname(this.voiceFile()), 'voice.json'), { lang: 'zh', text, group: '我的音色' })
    return this.snapshot()
  }
  async remove() {
    if (this.job) throw new Error('正在安装，请等安装结束后再卸载。')
    write(this.file, { enabled: false })
    await this.close()
    // Fixed application-owned path; audio and the user's reference remain in this.data.
    fs.rmSync(this.home, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 })
    write(this.file, { enabled: false })
    this.error = ''
    return this.snapshot()
  }
  async close() {
    this.generation++
    const child = this.process
    this.process = null
    this.endpoint = null
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 5000)
        child.once('close', () => { clearTimeout(timer); resolve() })
        child.kill()
      })
    }
  }
  async open(input) {
    if (!this.settings().enabled || this.plugins.disabled().includes('campus.learn')) return { url: null }
    if (this.job || !this.installed()) throw new Error('配音尚未安装完成，请到「课程讲解」插件检查。')
    if (!fs.existsSync(this.voiceFile())) throw new Error('请先在「课程讲解」插件添加参考音频。')
    const name = input?.name
    if (typeof name !== 'string' || name !== path.basename(name) || /[\\/:*?"<>|]/.test(name) || !name.toLowerCase().endsWith('.html')) throw new Error('讲解文件名不正确。')
    const workspace = await this.workspace(), file = path.join(workspace, 'dist', name)
    if (!fs.existsSync(file)) throw new Error('这条讲解已经不在原来的位置了。')
    if (!this.endpoint) {
      if (!this.starting) this.starting = this.start(workspace).finally(() => { this.starting = null })
      await this.starting
    }
    const endpoint = this.endpoint
    if (!endpoint) throw new Error('配音服务已停止。')
    const response = await fetch(`${endpoint.origin}/campus/open`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-campus-tts': endpoint.token }, body: JSON.stringify({ name }), signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error('配音窗口未能打开讲解。')
    return { url: `${endpoint.origin}/?token=${encodeURIComponent(endpoint.token)}` }
  }
  async start(workspace) {
    const generation = this.generation
    this.hardware = await this.probe(this.home)
    if (generation !== this.generation) throw new Error('配音启动已取消。')
    if (!this.hardware.runnable) throw new Error(this.hardware.runReasons.join(' '))
    if (!this.settings().enabled) throw new Error('配音已关闭。')
    const token = randomBytes(32).toString('hex')
    const env = { ...process.env, PYTHONUTF8: '1', PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1', LEARN_WORKSPACE: workspace,
      LEARN_TTS_HOME: this.home, LEARN_TTS_DATA: this.data, LEARN_TTS_TOKEN: token, LEARN_DEFAULT_VOICE: 'my-voice',
      CUDA_VISIBLE_DEVICES: String(this.hardware.gpu.index), HF_HUB_OFFLINE: '1' }
    fs.mkdirSync(this.data, { recursive: true })
    const child = this.process = this.launch(pythonPath(this.home), ['-B', '-u', path.join(CORE_ROOT, 'learn/tools/tts/desktop_host.py')], { cwd: this.data, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let tail = ''
    child.stderr.setEncoding('utf8').on('data', text => { tail = (tail + text).slice(-4000) })
    await new Promise((resolve, reject) => {
      let rest = '', settled = false
      const finish = (error) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve() }
      const timer = setTimeout(() => { child.kill(); finish(new Error('配音服务启动超时。')) }, 30_000)
      child.once('error', error => { if (this.process === child) this.process = null; finish(error) })
      child.once('exit', code => {
        if (this.process === child) { this.process = null; this.endpoint = null; this.error = code ? `配音服务退出：${tail.trim().slice(-300) || code}` : '' }
        finish(new Error(this.error || '配音服务已停止。'))
      })
      child.stdout.setEncoding('utf8').on('data', chunk => {
        const lines = (rest + chunk).split('\n'); rest = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('CAMPUS_TTS_READY ')) continue
          const port = Number(line.slice('CAMPUS_TTS_READY '.length))
          if (Number.isInteger(port) && port > 0 && port < 65536 && this.process === child) {
            this.endpoint = { origin: `http://127.0.0.1:${port}`, token }
            finish()
          }
        }
      })
    })
  }
}
