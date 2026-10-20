/** Optional Qwen runtime: install only after the plugin's explicit install action. */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { download, run } from './learn.mjs'
import { CORE_ROOT } from './skills.mjs'
import { Transfer, downloadFile } from '../../core/zju/lib/zhiyun/download.ts'

export const UV = {
  url: 'https://github.com/astral-sh/uv/releases/download/0.13.1/uv-x86_64-pc-windows-msvc.zip',
  sha256: '3b2661a463a5baea7f5076ea2b25ab71d77f36a6c0d809e5350651792f80a672',
}
export const MODEL = JSON.parse(fs.readFileSync(path.join(CORE_ROOT, 'learn/tools/tts/model.json'), 'utf8'))
export const MODEL_BYTES = MODEL.files.reduce((sum, f) => sum + f.bytes, 0)
export const RUNTIME_VERSION = 1
export const pythonPath = home => path.join(home, '.venv', 'Scripts', 'python.exe')

export async function digest(file) {
  const hash = createHash('sha256')
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

export async function installTts(home, step, tools = { download, run, digest, downloadFile }) {
  const model = tools.model || MODEL, modelBytes = model.files.reduce((sum, f) => sum + f.bytes, 0)
  fs.mkdirSync(home, { recursive: true })
  const marker = path.join(home, 'installed.json')
  if (fs.existsSync(marker)) fs.rmSync(marker)
  const zip = path.join(home, 'uv.zip'), uv = path.join(home, 'uv.exe')
  if (!fs.existsSync(uv)) {
    step('下载环境管理器', 0)
    await tools.download(UV.url, zip, ({ bytes, total }) => step('下载环境管理器', total ? Math.floor(bytes / total * 5) : null))
    if (await tools.digest(zip) !== UV.sha256) throw new Error('环境管理器下载校验失败，请重试。')
    // Full system path avoids Git's tar interpreting a drive letter as a remote host.
    await tools.run(path.join(process.env.SystemRoot || 'C:/Windows', 'System32/tar.exe'), ['-xf', zip, '-C', home], { timeoutMs: 60_000 })
    if (!fs.existsSync(uv)) throw new Error('环境管理器解压后缺少 uv.exe。')
  }
  const env = { ...process.env, UV_PYTHON_INSTALL_DIR: path.join(home, 'python'), UV_CACHE_DIR: path.join(home, 'cache'), UV_NO_PROGRESS: '1', PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' }
  step('准备独立 Python 环境', 5)
  await tools.run(uv, ['venv', '--python', '3.11.14', '--managed-python', '--allow-existing', path.join(home, '.venv')], { env, cwd: home })
  const python = pythonPath(home)
  step('安装 GPU 运行库', 10)
  await tools.run(uv, ['pip', 'install', '--python', python, '--index-url', 'https://download.pytorch.org/whl/cu128', 'torch==2.8.0', 'torchaudio==2.8.0'], { env, cwd: home })
  step('安装千问 TTS', 30)
  await tools.run(uv, ['pip', 'install', '--python', python, '--index-url', 'https://pypi.org/simple', '-r', path.join(CORE_ROOT, 'learn/tools/tts/requirements.txt')], { env, cwd: home })
  // Importing libraries checks the environment without loading weights or claiming VRAM.
  await tools.run(python, ['-B', '-c', 'import torch, soundfile, faster_qwen3_tts; assert torch.version.cuda == "12.8", "CUDA runtime mismatch"'], { env, cwd: home, timeoutMs: 120_000 })
  const modelDir = path.join(home, 'checkpoints', model.repository.split('/').at(-1))
  let done = 0
  for (const asset of model.files) {
    const file = path.join(modelDir, asset.path)
    let ready = fs.existsSync(file) && fs.statSync(file).size === asset.bytes && await tools.digest(file) === asset.sha256
    if (!ready) {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      if (fs.existsSync(file)) fs.rmSync(file)
      step('下载并校验配音模型', 40 + Math.floor(done / modelBytes * 59))
      const transfer = new Transfer({ threads: 4, retries: 3, timeoutMs: 120_000 })
      let received = 0
      transfer.received = bytes => { received += bytes; step('下载配音模型', Math.min(98, 40 + Math.floor((done + received) / modelBytes * 59))) }
      const url = `https://modelscope.cn/models/${model.repository}/resolve/master/${asset.path}`
      await tools.downloadFile(transfer, url, { out: file })
      if (fs.statSync(file).size !== asset.bytes || await tools.digest(file) !== asset.sha256) {
        fs.rmSync(file)
        throw new Error(`模型文件校验失败：${asset.path}。请重试；若来源已更新，需要更新应用。`)
      }
    }
    done += asset.bytes
  }
  // The marker is written last; an interrupted installation can never appear ready.
  fs.writeFileSync(path.join(home, 'installed.json'), JSON.stringify({ version: RUNTIME_VERSION, model: model.repository, installedAt: new Date().toISOString() }) + '\n')
  step('安装完成', 100)
}
