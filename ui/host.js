/**
 * 界面包的引擎侧入口。引擎按这一行加载本包，浏览器侧的代码经 package.json 的
 * exports["./client"] 送到页面；档案服务、模型工具和 core/ 下的两份技能在这里挂载。
 */
import { installProfile } from './profile/host.mjs'

export const name = 'campus-ui'
export const inject = ['connection', 'tools', 'systemPrompt', 'skills']

export function apply(ctx) { installProfile(ctx) }
