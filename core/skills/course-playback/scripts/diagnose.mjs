// SPDX-License-Identifier: GPL-3.0-only
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Diagnose actual media observations only; never return unrecognized input fields. */
export function diagnose(input) {
  const samples = input?.samples
  if (!Array.isArray(samples) || !samples.length || samples.length > 100) throw new Error('samples 必须为含 1 至 100 个实际采样的数组。')
  for (const sample of samples) {
    if (!sample || !Number.isFinite(sample.atMs) || !Number.isFinite(sample.currentTime) || sample.currentTime < 0 || typeof sample.paused !== 'boolean')
      throw new Error('样本必须包含有限数值 atMs/currentTime 和布尔值 paused。')
    for (const key of ['ended', 'recentInput']) if (sample[key] != null && typeof sample[key] !== 'boolean') throw new Error(`${key} 必须为布尔值。`)
    if (sample.readyState != null && (!Number.isInteger(sample.readyState) || sample.readyState < 0 || sample.readyState > 4)) throw new Error('readyState 必须为 0 至 4。')
    if (sample.duration != null && (!Number.isFinite(sample.duration) || sample.duration < 0)) throw new Error('duration 必须为非负有限数值，未知时省略。')
    if (sample.errorCode != null && (!Number.isInteger(sample.errorCode) || sample.errorCode < 0 || sample.errorCode > 4)) throw new Error('errorCode 必须为 0 至 4。')
  }
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].atMs < samples[i - 1].atMs || samples[i].currentTime < samples[i - 1].currentTime - 0.1)
      throw new Error('采样时间或播放位置倒退；请将不同视频或跳转前后的样本分开诊断。')
  }
  const first = samples[0], last = samples.at(-1)
  const observationMs = last.atMs - first.atMs, positionDelta = last.currentTime - first.currentTime
  const result = (kind, message) => ({ status: 'ok', kind, message, sampleCount: samples.length, observationMs, positionDelta,
    playbackRate: Number.isFinite(last.playbackRate) ? last.playbackRate : null })
  if (last.errorCode) return result('media-error', {
    1: '媒体加载已中止。', 2: '媒体报告网络错误；尚不能定位具体连接或服务器。',
    3: '媒体报告解码错误。', 4: '媒体报告不支持的资源。',
  }[last.errorCode])
  if (last.event === 'play-blocked') return result('play-blocked', '播放请求被拒绝，请手动点击播放并检查播放器提示，不循环重试。')
  if (last.ended) return result('ended', '播放器报告视频结束。')
  if (last.paused && last.recentInput === true) return result('manual-pause-evidence', '近期输入后暂停，保持暂停。')
  if (last.paused && Number.isFinite(last.duration) && last.duration > 0 && last.duration - last.currentTime <= 1)
    return result('near-end-paused', '暂停在末尾附近，可能是历史位置；没有足够证据表明异常中断。')
  if (observationMs > 0 && positionDelta > 0.1 && !last.paused) return result('advancing', '位置增加，当前正在播放；这不证明平台完成度已更新。')
  if (observationMs >= 12000 && Math.abs(positionDelta) <= 0.1 &&
      ((typeof last.readyState === 'number' && last.readyState < 3) || ['waiting', 'stalled'].includes(last.event)))
    return result('buffering-evidence', '至少 12 秒未推进且有缓冲证据，具体根因尚未确定。')
  if (last.paused && last.readyState >= 3) return result('paused-without-error-evidence', '当前暂停但媒体已就绪，没有网络或解码错误证据，不强制续播。')
  return result('insufficient-evidence', '样本不足以判断，请保留实际事件与前后采样。')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n')
  try {
    const args = process.argv.slice(2)
    if (args.length !== 2 || args[0] !== '--file' || !args[1]) throw new Error('用法：diagnose.mjs --file <samples.json>')
    output(diagnose(JSON.parse(fs.readFileSync(args[1], 'utf8'))))
  } catch (error) {
    // JSON parsing errors can contain excerpts from the input file; never echo them.
    output({ status: 'error', message: error instanceof SyntaxError ? '样本文件不是有效 JSON。' : error.message })
    process.exitCode = 1
  }
}
