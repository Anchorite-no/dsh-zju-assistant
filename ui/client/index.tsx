/** 界面包的浏览器侧入口：把我们的品牌、左侧面板和右边栏页签登记到引擎留出的位置上。 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { BrandMark, BrandName } from './Brand.tsx'
import { PANELS } from './panels.tsx'
import { installTrace } from './trace/install.ts'
import { WidthRow } from './WidthRow.tsx'
import { installContentWidth } from './width.ts'
import { installPluginsPage } from './PluginsPage.tsx'
import { installFolderlessChats } from './chats.ts'
import { installHandoff } from './handoff.tsx'
import { installBack } from './back.ts'
import { ProfileSettings } from './ProfileSettings.tsx'
import css from './style.css'

export const inject = ['slots', 'sidebarRightTabs', 'layout', 'remote', 'remote.pluginManager']

export function apply(ctx: Context): void {
  installPluginsPage(ctx)
  // 新对话默认不选文件夹；别的页面可以把一件事交给助手（开一个新对话，话先写进输入框）。
  // 这三个服务是引擎的工作区界面提供的，等它们都在了再接管。
  ctx.inject(['uiWorkspace', 'sessions', 'workspaces'], (inner) => { installFolderlessChats(inner); installHandoff(inner) })
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'campus-ui'
    tag.textContent = css
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'campus-ui: stylesheet')

  // 品牌：侧栏的图标和名字，以及空白会话页标题前的图标。
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, BrandMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name' }, BrandName)
    }))
  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.mark' }, BrandMark))

  // 左侧面板：侧栏里一个入口，对应主区域里一页。
  for (const panel of PANELS) {
    ctx.slots.inject('main', () =>
      ctx.slots.register({ name: 'main', key: panel.id }, panel.Page))
    ctx.slots.inject('sidebar.panellist', () =>
      ctx.slots.register({ name: 'sidebar.panellist', id: panel.id, order: panel.order, label: panel.label }, panel.Icon))
  }

  // 鼠标侧键的后退、Alt+←：页面上有返回的地方都认。
  ctx.effect(() => installBack(), 'campus-ui: back button')

  // 对话宽度：窄、中、宽三档，在 设置 → 通用设置 里切换，排在字号后面。
  ctx.effect(() => installContentWidth(), 'campus-ui: content width')
  ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register({ name: 'settings.general.item', id: 'campus-content-width', order: 11.5 }, WidthRow))

  // 设置里的「个人档案」一页：基础信息和记忆，排在通用设置后面。
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register({ name: 'settings.section', id: 'campus-profile', order: 5, label: '个人档案' }, ProfileSettings))

  // 右边栏页签：这次对话查了哪些网站、每一步拿到了什么。
  installTrace(ctx)
}
