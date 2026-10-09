/** Tencent WeRead Agent Gateway. Authentication is separate from browser cookies. */
export const OFFICIAL_GATEWAY = 'https://i.weread.qq.com/api/agent/gateway'
export const OFFICIAL_VERSION = '1.0.4'
export class OfficialWereadError extends Error {
  constructor(code, message, remoteCode) { super(message); this.code = code; this.remoteCode = remoteCode }
}
export class OfficialWereadClient {
  constructor({ getApiKey, fetcher = fetch }) { this.getApiKey = getApiKey; this.fetcher = fetcher; this.catalog = null }
  async request(api, parameters = {}, signal) {
    const key = await this.getApiKey()
    if (typeof key !== 'string' || !/^wrk-[A-Za-z0-9_-]+$/.test(key)) throw new OfficialWereadError('api_key_required', '请在应用凭据中配置微信读书官方 API Key。')
    if (parameters.params || parameters.api_name || parameters.skill_version) throw new OfficialWereadError('invalid_parameters', '业务参数应平铺传入，不能覆盖接口名或版本。')
    const response = await this.fetcher(OFFICIAL_GATEWAY, { method: 'POST', redirect: 'error', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ...parameters, api_name: api, skill_version: OFFICIAL_VERSION }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) })
    let payload
    try { payload = await response.json() } catch { throw new OfficialWereadError('invalid_response', '微信读书官方接口没有返回可识别的结果。') }
    if (payload.upgrade_info) throw new OfficialWereadError('skill_upgrade_required', '微信读书要求升级官方 Skill，已暂停本次调用。')
    const code = Number(payload.errcode ?? payload.errCode ?? 0)
    if (!response.ok || code) throw new OfficialWereadError(response.status === 401 ? 'api_key_invalid' : 'official_rejected', '微信读书官方接口未完成本次请求。', code || response.status)
    return payload
  }
  async capabilities(signal) {
    const payload = await this.request('/_list', {}, signal)
    if (!Array.isArray(payload.apis)) throw new OfficialWereadError('invalid_response', '官方接口清单格式异常。')
    this.catalog = new Map(payload.apis.map(api => [api.api_name, api]))
    return { version: OFFICIAL_VERSION, apis: payload.apis }
  }
  async call(api, parameters = {}, signal) {
    if (!this.catalog) await this.capabilities(signal)
    const definition = this.catalog.get(api)
    if (!definition) throw new OfficialWereadError('unsupported_official_api', '当前官方 Skill 尚未开放这个接口。')
    const fields = new Set(definition.params.map(p => p.name))
    if (Object.keys(parameters).some(p => !fields.has(p)) || definition.params.some(p => p.required && parameters[p.name] === undefined)) throw new OfficialWereadError('invalid_parameters', '参数与官方接口定义不符。')
    return this.request(api, parameters, signal)
  }
  async publishers(query = '', signal) {
    const payload = query.trim() ? await this.call('/store/search', { keyword: query.trim(), scope: 2 }, signal) : await this.call('/shelf/sync', {}, signal)
    const found = new Map()
    function visit(value) {
      if (!value || typeof value !== 'object') return
      if (typeof value.bookId === 'string' && /^MP_WXS_\d+$/.test(value.bookId) && typeof value.title === 'string') found.set(value.bookId, { bookId: value.bookId, name: value.title, biz: Buffer.from(value.bookId.slice(7)).toString('base64'), ...(value.deepLink ? { deepLink: value.deepLink } : {}) })
      for (const v of Object.values(value)) if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === 'object') visit(v)
    }
    visit(query.trim() ? payload : payload.books)
    return { ok: true, status: 'ready', source: 'official', accounts: [...found.values()], hasMore: payload.hasMore === 1, completeAccountFeed: false }
  }
}
