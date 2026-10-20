/** 侧栏上我们自己的两个面板：校园事务和学习。个人档案不在侧栏，在设置里（见 index.tsx）。 */
import type { ReactNode } from 'react'
import { AffairsPage } from './AffairsPage.tsx'
import { LearningPage } from './LearningPage.tsx'

interface IconProps { size: number, active: boolean }

interface Panel {
  id: string
  order: number
  label: string
  Icon: (props: IconProps) => ReactNode
  Page: () => ReactNode
}

function icon(path: ReactNode) {
  return function PanelIcon({ size }: IconProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {path}
      </svg>
    )
  }
}

/**
 * 侧栏从上到下：插件（0，在 PluginsPage 里登记）、日程表（10，盖住引擎定时任务插件的那一项，在 SchedulePage 里登记）、然后是下面两项。
 * 排序号不能和别的项相同，相同时谁先加载谁在前，位置会跳。
 * 侧栏不再加入口：新的内容放进已有的页面里（备忘录和通知在校园事务，技能在插件页，基础信息和记忆在设置）。
 */
export const PANELS: readonly Panel[] = [
  {
    id: 'campus.affairs',
    order: 30,
    label: '校园事务',
    Icon: icon(<><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M8 3.5v3M16 3.5v3M4 10h16M8.5 14.5l2 2 4-4" /></>),
    Page: AffairsPage,
  },
  {
    id: 'campus.learning',
    order: 40,
    label: '学习',
    Icon: icon(<><path d="M4 6.5c2.8-1 5.4-.8 8 .9v12c-2.6-1.7-5.2-1.9-8-.9v-12ZM20 6.5c-2.8-1-5.4-.8-8 .9v12c2.6-1.7 5.2-1.9 8-.9v-12Z" /></>),
    Page: LearningPage,
  },
]
