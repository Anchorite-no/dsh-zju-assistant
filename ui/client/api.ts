/** 页面和引擎侧档案服务（ui/profile/host.mjs）之间的唯一通道。 */
import ENGINE_STAMP from 'campus:engine-stamp'

/** 界面已经是新的、后台还是旧的时候给用户看的话。 */
export const RESTART = '界面已经更新，后台还是旧版本，这一页现在用不了。请完全退出应用再打开。'

async function request<T>(action: string, input: unknown): Promise<T> {
  const response = await fetch('/api/campus/profile', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, input }),
  })
  // 服务只回 200，或带原因的 400；别的状态说明请求没到它那里。
  if (!response.ok && response.status !== 400) throw new Error('档案服务没有响应，请重新打开应用后再试。')
  const result = await response.json()
  if (!response.ok || result.error) throw new Error(result.error || '请求没有完成，请再试一次。')
  return result.value
}

/**
 * 后台是不是比界面旧。开发时改了引擎侧的代码，界面会自己更新，后台要重新打开应用才换；
 * 这期间后台不认识新界面发的请求，报出来的错看不懂。问一次就记住，页面重新加载后再问。
 */
let stale: Promise<boolean> | undefined
export function engineStale(): Promise<boolean> {
  stale ??= request<string>('stamp', {}).then(stamp => stamp !== ENGINE_STAMP, () => true)
  return stale
}

export async function profileApi<T>(action: string, input: unknown = {}): Promise<T> {
  try { return await request<T>(action, input) } catch (error) {
    // 后台是旧的时，不管它报的是什么，都改成请用户重新打开应用。
    if (await engineStale()) throw new Error(RESTART)
    throw error
  }
}

export const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)

/** 账号页的全部内容：各系统的账号、密码和校内站点的访问方式。有哪些键见 ui/profile/catalog.mjs。 */
export interface AccountSnapshot {
  values: Record<string, string>
  revision: string
}
