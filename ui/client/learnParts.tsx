/** 学习页两边（智云的 LearningPage.tsx、超星的 LearningChaoxing.tsx）共用的几样小东西。 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { CAMPUS_PLUGINS } from '../profile/catalog.mjs'
import { profileApi } from './api.ts'
import { agoText, dateText, mixed } from './when.ts'

export const pluginTitle = (id: string) => CAMPUS_PLUGINS.find(plugin => plugin.id === id)?.title ?? '插件'

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
/** 「2026-10-08」这样的北京时间日期：写成几月几日加星期。 */
export function dayText(date: string | null, now: number): string {
  if (!date) return '时间待定'
  const at = new Date(`${date}T00:00:00`).getTime()
  return `${dateText(at, now)} ${WEEKDAYS[new Date(at).getDay()]}`
}

export function Arrow() {
  return <span className="campus-learn-arrow" aria-hidden="true"><IconChevronRightOutlineRegular size={14} /></span>
}

/** 列表下面的小字说明，可以带一个去处理的入口。 */
export function Note({ text, action, onAction }: { text: string, action?: string, onAction?: () => void }) {
  return (
    <p className="campus-note campus-task-note">
      <span>{text}</span>
      {action && <button type="button" className="campus-textlink" onClick={onAction}>{action}</button>}
    </p>
  )
}

/** 没读到时的那句话。冒号后面的原因是系统给的原话，不动它。 */
export const failure = (what: string, fetchedAt: string | null, error: string, now: number) =>
  `${mixed(fetchedAt ? `${what}这次没读到，上面的还是${agoText(Date.parse(fetchedAt), now)}读到的：` : `${what}没读到：`)}${error.replace(/[。.]$/, '')}。`

// ── 下载进度 ───────────────────────────────────────────────

/** 后台给的一项下载下到哪了：已经收到的字节数和总字节数（总量还估不出来时是 0）。 */
interface Progress { bytes: number, total: number }
/** 多久问一次后台。 */
const ASK_MS = 500

/**
 * 正在下的那几项各下到百分之几。active 为真（页面上有一行在下）时每隔半秒问后台一次，action 和 input 是问哪一个接口、问谁的；
 * 回来的结果里少了一项，就是那一项下完了或者没下成，叫 onDone 让页面重读（离开页面再回来时，下载是后台在做，靠这个知道它完了）。
 * 给出的百分数在 0–99 之间，总量还不知道时是 null；只升不降：分片的回放总量是估出来的，会来回晃。没下完之前不写 100。
 */
export function useDownloading(action: string, input: object, active: boolean, onDone: () => void): Readonly<Record<string, number | null>> {
  const [percents, setPercents] = useState<Record<string, number | null>>({})
  const done = useRef(onDone)
  done.current = onDone
  const key = JSON.stringify(input)
  useEffect(() => {
    if (!active) { setPercents({}); return }
    let live = true, asking = false, before: string[] = []
    const high: Record<string, number | null> = {}
    const ask = async () => {
      if (asking) return
      asking = true
      try {
        const states = await profileApi<Record<string, Progress>>(action, JSON.parse(key))
        if (!live) return
        const next: Record<string, number | null> = {}
        for (const [id, state] of Object.entries(states)) {
          const now = state.total > 0 ? Math.min(99, Math.floor(state.bytes / state.total * 100)) : null
          next[id] = high[id] = now === null ? high[id] ?? null : Math.max(now, high[id] ?? 0)
        }
        if (before.some(id => !(id in states))) done.current()
        before = Object.keys(states)
        setPercents(next)
      } catch { /* 这一次没问到，下一次再问 */ } finally { asking = false }
    }
    void ask()
    const timer = window.setInterval(() => { void ask() }, ASK_MS)
    return () => { live = false; window.clearInterval(timer) }
  }, [action, key, active])
  return percents
}

/** 一行底边上的进度线：压在行与行之间那根细线的位置，不占高度，出现和消失时别的行不会跟着跳。还不知道下到多少时不画。 */
export function ProgressLine({ percent }: { percent: number | null | undefined }) {
  if (percent == null) return null
  return (
    <span className="campus-learn-progress" role="progressbar" aria-label="下载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
      style={{ '--campus-progress': `${percent}%` } as CSSProperties} />
  )
}
