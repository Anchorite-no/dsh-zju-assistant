import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
export { SkillError } from './errors.mjs'

// 配置只有一处：Skill 根目录的 .env；同名的系统环境变量优先。
const envFile = process.env.WEREAD_ENV_FILE || fileURLToPath(new URL('../.env', import.meta.url))
if (fs.existsSync(envFile)) process.loadEnvFile(envFile)

/** 保存自带浏览器的登录状态和跟踪名单。 */
export const dataDir = process.env.WEREAD_DATA_DIR || path.join(process.env.APPDATA || path.join(os.homedir(), '.local', 'share'), 'weread-skill')

export interface VisionConfig { endpoint: string; model: string; apiKey?: string; thinking?: string; reasoningEffort?: string; responseFormat?: string; audioInput?: boolean; maxTokens?: number }

/** 验证码识别模型；没有配置时由用户在官方窗口里手动完成验证。 */
export function visionConfig(): VisionConfig | undefined {
  const env = (name: string) => process.env['WEREAD_VISION_' + name] || undefined
  const endpoint = env('ENDPOINT'), model = env('MODEL')
  if (!endpoint || !model) return undefined
  return { endpoint, model, apiKey: env('API_KEY'), thinking: env('THINKING'), reasoningEffort: env('REASONING_EFFORT'), responseFormat: env('RESPONSE_FORMAT'),
    audioInput: env('AUDIO_INPUT') !== 'false', maxTokens: env('MAX_TOKENS') ? Number(env('MAX_TOKENS')) : undefined }
}
