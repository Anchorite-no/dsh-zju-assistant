/**
 * 「个人档案」里记忆上面的一块：对话后的自动整理（引擎侧 ui/profile/review.mjs）。
 * 对话聊完过一阵，应用回看一遍，把用户说到的背景、偏好、打算和学到哪了整理进记忆，把照工作流办事时学到的一条补在工作流旁边。
 * 这里是它的开关，和最近整理了什么：哪一条、加了哪几行、去掉了哪一行，整理错了的能撤销。
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { errorText, profileApi } from './api.ts'
import { Alert } from './controls.tsx'
import { day } from './Notes.tsx'

/** fixed 是这条记忆后来又被改过，撤不回去了。 */
interface Entry { id: string, at: string, kind: 'memory' | 'flow', title: string, created?: boolean, added: string[], removed: string[], undone?: boolean, fixed?: boolean }
interface Snapshot { enabled: boolean, idleMinutes: number, entries: Entry[] }

/** 先露出最近几条，多的点开再看。 */
const SHOWN = 5

/** reload 是整页重读（撤销以后记忆的列表要跟着变），notify 是窗口顶上闪一下的提示。 */
export function ReviewSettings({ reload, notify }: { reload: () => Promise<void>, notify: (text: string) => void }) {
  const [data, setData] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const read = useCallback(async () => {
    // 后台还是旧版本时没有这个接口：这一块就不显示，页面别的部分照常。
    try { setData(await profileApi<Snapshot>('review-read')) } catch { /* 见上 */ }
  }, [])
  useEffect(() => {
    // 整理是在后台做的，回到窗口时和每隔十秒各读一次。
    const refresh = () => { void read() }
    refresh()
    window.addEventListener('focus', refresh)
    const interval = window.setInterval(refresh, 10000)
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(interval) }
  }, [read])

  const change = async (task: () => Promise<Snapshot>, done?: string) => {
    setBusy(true); setError('')
    try { setData(await task()); if (done) notify(done) } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  const undo = (entry: Entry) => change(async () => {
    const next = await profileApi<Snapshot>('review-undo', { id: entry.id })
    await reload().catch(() => {})
    return next
  }, '已撤销')

  if (!data) return null
  const listed = expanded ? data.entries : data.entries.slice(0, SHOWN)
  const hidden = data.entries.length - SHOWN
  return (
    <section className="campus-section" aria-label="自动整理">
      <div className="campus-section-head">
        <h2 className="campus-section-title">自动整理</h2>
        <Switch label="对话后自动整理" checked={data.enabled} disabled={busy} onChange={(enabled) => { void change(() => profileApi<Snapshot>('review-set', { enabled })) }} />
      </div>
      <p className="campus-field-hint">
        一次对话聊完 {data.idleMinutes} 分钟后，助手会回看一遍，把你说到的背景、偏好、打算和哪里学会了、哪里还没懂整理进下面的记忆；照工作流办事时学到的一条，补在工作流旁边（在「插件」页的技能里）。整理得不对的可以撤销。
      </p>
      {error && <Alert>{error}</Alert>}
      {listed.length > 0 && (
        <ul className="campus-note-list" aria-label="最近整理的">
          {listed.map(entry => (
            <li className="campus-review-row" key={entry.id} data-undone={entry.undone || undefined}>
              <div className="campus-review-what">
                <span className="campus-review-title">{entry.kind === 'flow' ? `${entry.title}的补充` : entry.title}{entry.created ? '（新建）' : ''}</span>
                {entry.added.map(line => <span key={`+${line}`}>加了：{line}</span>)}
                {entry.removed.map(line => <span key={`-${line}`}>去掉：{line}</span>)}
              </div>
              <time dateTime={entry.at}>{day(entry.at)}</time>
              {entry.undone
                ? <span className="campus-review-done">已撤销</span>
                : entry.fixed
                  ? <span className="campus-review-done">后来改过</span>
                  : <button type="button" className="campus-textlink" disabled={busy} onClick={() => { void undo(entry) }}>撤销</button>}
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <Button className="campus-more" variant="ghost" size="sm" aria-expanded={expanded}
          icon={expanded ? <IconChevronUpOutlineRegular size={14} /> : <IconChevronDownOutlineRegular size={14} />} onClick={() => { setExpanded(old => !old) }}>
          {expanded ? '收起' : `展开其余 ${hidden} 条`}
        </Button>
      )}
    </section>
  )
}
