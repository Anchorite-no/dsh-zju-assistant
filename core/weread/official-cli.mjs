/** App adapter for the unmodified Tencent skill documents. No key on argv/stdout. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import { OfficialWereadClient } from './official.mjs'
const root = fileURLToPath(new URL('../../', import.meta.url))
try {
  const profile = process.env.CAMPUS_PROFILE_DIR || path.join(process.env.APPDATA || '', 'CampusAgent', 'profile')
  const disabled = fs.existsSync(path.join(profile,'plugins.json')) ? JSON.parse(fs.readFileSync(path.join(profile,'plugins.json'),'utf8')).disabled : []
  if (process.env.CAMPUS_WECHAT_DISABLED === '1' || disabled?.includes('campus.wechat')) throw new Error('微信公众号插件已关闭。')
  const client = new OfficialWereadClient({ getApiKey: () => {
    try { return load(fs.readFileSync(path.join(root,'api-keys.local.yaml'),'utf8'))?.refs?.WEREAD_API_KEY } catch { return undefined }
  } })
  const api = process.argv[2], parameters = process.argv[3] ? JSON.parse(process.argv[3]) : {}
  if (!api) throw new Error('用法：official-cli.mjs /接口名 可选的JSON业务参数；不要传入API Key。')
  const result = api === '/_list' ? await client.capabilities() : await client.call(api, parameters)
  console.log(JSON.stringify({ ok: true, source: 'official', data: result }))
} catch (error) { console.log(JSON.stringify({ ok: false, status: error.code ?? 'invalid_request', message: error.message, ...(error.remoteCode ? { remoteCode: error.remoteCode } : {}) })); process.exitCode = 1 }
