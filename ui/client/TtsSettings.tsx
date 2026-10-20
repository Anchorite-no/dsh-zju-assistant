import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { errorText, profileApi } from './api.ts'

interface Hardware {
  compatible: boolean; runnable: boolean; reasons: string[]; runReasons: string[]; warnings: string[]
  gpu: { name: string; total: number; free: number; driver: string } | null
  ram: number; freeDisk: number; freeCommit: number
}
interface Snapshot {
  installed: boolean; enabled: boolean; voice: boolean; busy: boolean; step: string; percent: number | null
  error: string; hardware: Hardware | null; running: boolean; downloadHint: string
}
const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`

export function TtsSettings() {
  const [data, setData] = useState<Snapshot | null>(null), [error, setError] = useState(''), [working, setWorking] = useState(false)
  const [audio, setAudio] = useState<File | null>(null), [text, setText] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const apply = useCallback((next: Snapshot) => { if (alive.current) setData(next) }, [])
  const load = useCallback(() => { profileApi<Snapshot>('tts-read').then(apply, e => { if (alive.current) setError(errorText(e)) }) }, [apply])
  useEffect(load, [load])
  useEffect(() => {
    if (!data?.busy) return
    const timer = window.setInterval(load, 1000)
    return () => window.clearInterval(timer)
  }, [data?.busy, load])
  const act = async (action: string, input: unknown = {}) => {
    setWorking(true); setError('')
    try { apply(await profileApi<Snapshot>(action, input)) }
    catch (e) { if (alive.current) setError(errorText(e)) }
    finally { if (alive.current) setWorking(false) }
  }
  const saveVoice = async () => {
    if (!audio) return
    if (audio.size > 20 * 1024 ** 2) { setError('参考音频不能超过 20 MB。'); return }
    try {
      const bytes = new Uint8Array(await audio.arrayBuffer())
      let binary = ''
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
      await act('tts-voice', { audio: btoa(binary), text })
    } catch (e) { setError(errorText(e)) }
  }
  if (!data) return error ? <p className="campus-form-error">{error}</p> : null
  const blocked = working || data.busy, hw = data.hardware
  return <section className="campus-section campus-tts" aria-label="讲解配音">
    <h2 className="campus-section-title">讲解配音 <Tag>可选</Tag></h2>
    <p className="campus-note">千问 Qwen3-TTS · 默认不安装。推荐 RTX 5060 级别、8 GB 显存及以上。</p>
    <dl className="campus-systems campus-parts">
      <div><dt>运行环境</dt><dd>{hw?.gpu ? `${hw.gpu.name} · ${gb(hw.gpu.total)} 显存` : hw ? '未找到兼容显卡' : '尚未检测'}</dd>
        <span className="campus-parts-end"><Button size="sm" variant="outline" disabled={blocked} onClick={() => { void act('tts-check') }}>检测环境</Button></span></div>
      {hw && <div><dt>可用资源</dt><dd>空闲显存 {gb(hw.gpu?.free ?? 0)} · 提交内存余量 {gb(hw.freeCommit)} · 磁盘 {gb(hw.freeDisk)}</dd></div>}
      <div><dt>千问 TTS</dt><dd>{data.busy ? `${data.step}${data.percent === null ? '' : ` ${data.percent}%`}` : data.installed ? '已安装' : '未安装'}</dd>
        <span className="campus-parts-end">{data.installed
          ? <Button size="sm" variant="outline" disabled={blocked} onClick={() => { void act('tts-remove') }}>卸载环境和模型</Button>
          : <Button size="sm" variant="outline" disabled={blocked || !hw?.compatible} onClick={() => { void act('tts-install') }}>安装配音</Button>}</span></div>
      {data.installed && <div><dt>播放时配音</dt><dd>{data.enabled ? '已开启' : '已关闭'}</dd><span className="campus-parts-end">
        <Button size="sm" variant="outline" disabled={blocked || !data.voice} onClick={() => { void act('tts-set', { enabled: !data.enabled }) }}>{data.enabled ? '关闭' : '开启'}</Button>
      </span></div>}
    </dl>
    {!data.installed && <p className="campus-note">{data.downloadHint}</p>}
    {hw && [...new Set([...hw.reasons, ...hw.warnings, ...(hw.compatible ? hw.runReasons : [])])].map(line => <p className="campus-note" key={line}>{line}</p>)}
    {data.installed && <details><summary>{data.voice ? '更换参考音色' : '添加参考音色'}</summary>
      <p className="campus-note">选择有权使用的中文 WAV 音频，建议 5–15 秒，并填写其中的原话。音频只保存在本机。</p>
      <label>参考音频<input type="file" accept=".wav,audio/wav" disabled={blocked} onChange={e => setAudio(e.target.files?.[0] || null)} /></label>
      <label>音频原话<textarea className="campus-input" maxLength={600} value={text} disabled={blocked} onChange={e => setText(e.target.value)} rows={3} /></label>
      <Button size="sm" variant="outline" disabled={blocked || !audio || !text.trim()} onClick={() => { void saveVoice() }}>保存音色</Button>
    </details>}
    {(error || data.error) && <p className="campus-form-error" role="alert">{error || data.error}</p>}
  </section>
}
