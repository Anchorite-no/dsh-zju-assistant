/**
 * 校园事务页左栏下面的备忘录：用户自己记的一件件事，像手机上的备忘录。栏里只有列表和「新建」，
 * 点开一条是整页的单条和编辑（和设置里的记忆是同一套界面，见 Notes.tsx、notebook.tsx）。存在档案目录的 notes/ 里。
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import { RESTART, errorText, profileApi } from './api.ts'
import { Alert } from './controls.tsx'
import { MEMO_WORDS, NoteList, type Note } from './Notes.tsx'
import { noteScreen, type NoteScreen, type Notebook, type Run } from './notebook.tsx'

interface Listed { notes: Note[], warnings: string[] }

/** 上一次读到的。再打开这一页时先照它画，不会先空着再跳出来。 */
let last: Listed | null = null

/**
 * 校园事务页用的三样：list 是左栏里的那一块；opened 是点开一条或在编辑时的整页内容（还在列表上时是 null）；
 * toast 是操作成功后窗口顶上闪一下的提示。layer 在换了一层时变，页面拿它回到顶上。
 */
export function useMemos(): { list: ReactNode, opened: ReactNode, toast: ReactNode, layer: string } {
  const [data, setData] = useState<Listed | null>(last)
  const [screen, setScreen] = useState<NoteScreen>({ name: 'list' })
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{ text: string, seq: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    const next = await profileApi<Listed>('memo-list')
    // 后台还是旧版本时回来的不是备忘。不当成「没有备忘」，直接说要重新打开应用。
    if (!Array.isArray(next?.notes)) throw new Error(RESTART)
    last = next
    setData(next)
  }, [])
  useEffect(() => {
    // 助手按用户说的随时可能记一条，回到窗口时和每隔十秒各读一次。
    const refresh = () => { reload().catch((reason) => { setError(errorText(reason)) }) }
    refresh()
    window.addEventListener('focus', refresh)
    const interval = window.setInterval(refresh, 10000)
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(interval) }
  }, [reload])

  const notify = (text: string) => { setToast(old => ({ text, seq: (old?.seq ?? 0) + 1 })) }
  const run: Run = async (task) => {
    setBusy(true); setError('')
    try { await task() } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  const go = (next: NoteScreen) => { setScreen(next); setError('') }
  const notebook: Notebook = { words: MEMO_WORDS, prefix: 'memo-', busy, run, reload, notify }
  const problem = error ? <Alert>{error}</Alert> : null
  const opened = data ? noteScreen({ ...notebook, notes: data.notes, screen, go, problem }) : null

  return {
    opened,
    layer: opened ? `${screen.name}:${screen.name === 'list' ? '' : screen.title ?? ''}` : '',
    list: (
      <>
        {data && (
          <NoteList compact words={MEMO_WORDS} notes={data.notes} busy={busy}
            onOpen={(note) => { go({ name: 'note', title: note.title }) }} onNew={() => { go({ name: 'edit', title: null }) }} />
        )}
        {!opened && error && <p className="campus-note campus-task-note"><span>{error}</span></p>}
        {data && data.warnings.length > 0 && <p className="campus-note campus-task-note"><span>{data.warnings.join(' ')}</span></p>}
      </>
    ),
    toast: toast && <Toast key={toast.seq} tone="success" text={toast.text} holdMs={Math.min(4000, 1200 + toast.text.length * 80)} onDone={() => { setToast(null) }} />,
  }
}
