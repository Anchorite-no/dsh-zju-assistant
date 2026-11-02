/**
 * 浙大邮箱的客户端专用密码存在 dsh 的凭据服务里（ctx.credentials 的一条 grant 记录，键是 dsh-zju-campus/mail），
 * 不放在 mail.json，也不经工具和页面的快照。桌面版原来交给 Electron 的 safeStorage 加密，插件里没有 Electron。
 * dsh 本地的凭据文件只有本人能读（dsh-credentials-local 的说明），和 dsh 自己的 API Key 放在一处。
 * mail.json 里只记一个标记 credentials:dsh-zju-campus/mail，open 认这个标记才去读。
 */
import { credentialKey } from '@deepseek-ai/dsh-credentials'

const KEY = credentialKey('dsh-zju-campus', 'mail')
const MARK = `credentials:${KEY}`

/** credentials 返回凭据服务；dsh 没有挂载它时为 undefined。 */
export function mailVault(credentials) {
  const service = () => {
    const found = credentials()
    if (!found) throw new Error('这个 dsh 没有凭据服务，存不了邮箱的专用密码。')
    return found
  }
  return {
    async seal(password) {
      await service().modifyRecord(KEY, async () => ({ kind: 'grant', payload: { password } }))
      return MARK
    },
    async open(secret) {
      if (secret !== MARK) throw new Error('邮箱的专用密码不在了，请重新连接邮箱。')
      const record = await service().readRecord(KEY)
      const password = record?.kind === 'grant' ? record.payload?.password : undefined
      if (typeof password !== 'string' || !password) throw new Error('邮箱的专用密码不在了，请重新连接邮箱。')
      return password
    },
    async forget() { await credentials()?.deleteRecord(KEY) },
  }
}
