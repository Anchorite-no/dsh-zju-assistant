/** 插件页列出的两组插件。校园功能和独立采集模块共用接入表，引擎侧用的是同一份。 */
export { APP_PLUGINS, type AppPlugin } from '../profile/catalog.mjs'

export interface GeneralPlugin {
  id: string
  title: string
  description: string
  /** 引擎里对应的包，图标用包自带的；留空表示内置，没有开关。 */
  bundle: string
}

export const GENERAL_PLUGINS: readonly GeneralPlugin[] = [
  { id: 'web-search', title: '网页搜索', description: '搜索公开网页', bundle: '' },
  { id: 'automation', title: '自动化任务', description: '到点或按周期执行任务', bundle: '@deepseek-ai/dsh-experimental-schedule-bundle' },
  { id: 'auto-review', title: '自动授权审查', description: '由模型判断工具能不能执行', bundle: '@deepseek-ai/dsh-experimental-auto-review' },
  { id: 'voice', title: '语音输入', description: '在本机把语音转成文字', bundle: '@deepseek-ai/dsh-experimental-voice-input-bundle' },
]
