/** 插件页列出的插件。校园功能（连同公众号、课程讲解这两项）用接入表，引擎侧用的是同一份。 */
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

/**
 * 插件页按用途分的四类（用户 2026-10-18 定的）。校园功能、本地插件和引擎的通用工具按编号排进来，每个插件只在一类里，
 * 次序就是页面上的次序（pluginCatalog.test.mjs 核对没有漏的、重复的）。分类只管插件页怎么排，开关、账号和运行都还是各插件自己的；
 * 技能另成一组，不算第五类。
 */
export const PLUGIN_GROUPS: readonly { id: string, title: string, plugins: readonly string[] }[] = [
  { id: 'study', title: '课程与学习', plugins: ['campus.courses', 'campus.materials', 'campus.learn'] },
  { id: 'messages', title: '消息与资讯', plugins: ['campus.notices', 'campus.wechat-chat', 'campus.dingtalk', 'campus.mail', 'campus.wechat'] },
  { id: 'life', title: '校园生活', plugins: ['campus.activities', 'campus.community'] },
  { id: 'basics', title: '基础能力', plugins: ['campus.account', 'web-search', 'automation', 'voice', 'auto-review'] },
]
