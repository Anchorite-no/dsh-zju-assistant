/**
 * 对话区宽度的三档设置。选择存在本机，写到 <html> 的属性上，具体宽度在 style.css 里。
 * 引擎自己的做法是拖动条加一个像素值，我们换成固定三档，拖动条在样式里收起。
 */
export type ContentWidth = 'narrow' | 'medium' | 'wide'

export const CONTENT_WIDTHS: readonly { id: ContentWidth, label: string }[] = [
  { id: 'narrow', label: '窄' },
  { id: 'medium', label: '中' },
  { id: 'wide', label: '宽' },
]

const KEY = 'campus.contentWidth'
const listeners = new Set<() => void>()

function read(): ContentWidth {
  const raw = localStorage.getItem(KEY)
  return raw === 'medium' || raw === 'wide' ? raw : 'narrow'
}

let current = read()

function publish(): void {
  document.documentElement.dataset.campusWidth = current
}

export function getContentWidth(): ContentWidth {
  return current
}

export function setContentWidth(value: ContentWidth): void {
  current = value
  localStorage.setItem(KEY, value)
  publish()
  for (const listener of listeners) listener()
}

export function subscribeContentWidth(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** 界面包启用时生效，停用时撤掉，宽度回到引擎默认。 */
export function installContentWidth(): () => void {
  publish()
  return () => { delete document.documentElement.dataset.campusWidth }
}
