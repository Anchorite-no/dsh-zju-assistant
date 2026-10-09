/**
 * 「返回」认哪些输入。页面顶上那一行返回（controls.tsx 的 Crumb）在场时，鼠标侧键的后退、键盘上的 Alt+←
 * 和后退键也算点了它。引擎不用浏览器的历史记录，壳也不替页面后退，所以在这里直接认这几种输入。
 * 鼠标侧键有两条路进来：页面自己收到的鼠标事件（button 是 3），和壳转来的系统「浏览器后退」命令
 * （desktop/main.cjs 的 app-command，经 preload.cjs 变成窗口上的 campus:back 事件）。
 * 同一下按键两条路可能都到，所以很短时间内的第二次不算。
 */
import { useEffect, useRef, type RefObject } from 'react'

interface Entry { run: () => void, element: () => HTMLElement | null }

/** 现在在场的几个返回，后出现的在上面：设置面板盖在页面上时，认的是面板里的那个。 */
const entries: Entry[] = []
/** 两次后退至少隔这么久。 */
const GAP_MS = 300
let lastAt = 0

/** 执行最上面的那个返回。没有返回在场时什么都不做，返回 false。 */
function goBack(): boolean {
  const top = entries[entries.length - 1]
  if (!top) return false
  // 上面盖着确认框（删除、放弃修改）时不动，等用户先把它处理掉。
  const modals = document.querySelectorAll('[aria-modal="true"]'), modal = modals[modals.length - 1], element = top.element()
  if (modal && element && !modal.contains(element)) return true
  const now = Date.now()
  if (now - lastAt >= GAP_MS) { lastAt = now; top.run() }
  return true
}

/** 一个返回在场期间，把它登记成「后退」要执行的事。element 是画出来的那个返回，用来判断它是不是被确认框盖住了。 */
export function useBack(run: () => void, element: RefObject<HTMLElement | null>): void {
  const latest = useRef(run)
  latest.current = run
  useEffect(() => {
    const entry: Entry = { run: () => { latest.current() }, element: () => element.current }
    entries.push(entry)
    return () => { const at = entries.indexOf(entry); if (at >= 0) entries.splice(at, 1) }
  }, [element])
}

/** 开始听后退的几种输入；返回的函数用来停止。 */
export function installBack(): () => void {
  const mouse = (event: MouseEvent) => { if (event.button === 3 && goBack()) event.preventDefault() }
  const key = (event: KeyboardEvent) => {
    const back = event.key === 'BrowserBack' || (event.key === 'ArrowLeft' && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey)
    if (back && goBack()) event.preventDefault()
  }
  const shell = () => { goBack() }
  window.addEventListener('mouseup', mouse, true)
  window.addEventListener('keydown', key, true)
  window.addEventListener('campus:back', shell)
  return () => {
    window.removeEventListener('mouseup', mouse, true)
    window.removeEventListener('keydown', key, true)
    window.removeEventListener('campus:back', shell)
  }
}
