/** 设置 → 通用设置里的「对话宽度」一行，样子和引擎自带的各行一致。 */
import { useState, useSyncExternalStore } from 'react'
import { IconChevronDownOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { CONTENT_WIDTHS, getContentWidth, setContentWidth, subscribeContentWidth, type ContentWidth } from './width.ts'

export function WidthRow() {
  const width = useSyncExternalStore(subscribeContentWidth, getContentWidth)
  const [open, setOpen] = useState(false)
  const selected = CONTENT_WIDTHS.find(option => option.id === width) ?? CONTENT_WIDTHS[0]!

  return (
    <div className="campus-setting-row">
      <div className="campus-setting-text">
        <div className="campus-setting-title">对话宽度</div>
        <div className="campus-setting-desc">对话正文和输入框占中间区域的宽度。</div>
      </div>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={CONTENT_WIDTHS.map(option => ({ id: option.id, label: option.label }))}
        selectedId={width}
        onSelect={(id) => {
          setOpen(false)
          setContentWidth(id as ContentWidth)
        }}
        align="end"
        portal
        anchor={(
          <button
            type="button"
            className="campus-setting-selector"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => { setOpen(value => !value) }}
          >
            {selected.label}
            <IconChevronDownOutlineRegular />
          </button>
        )}
      />
    </div>
  )
}
