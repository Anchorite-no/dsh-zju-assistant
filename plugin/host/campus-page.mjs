/**
 * 应用内看要校园登录的网页（通知原文、教务网、学在浙大的页面）。装了 dsh-builtin-browser 时由这里在它的窗口里打开：
 * 打开前让 ZJU Core 把统一身份认证、WebVPN 的会话续上（已经有效时它不重新登录），把这两样的 cookie 用 restoreAuth 写进窗口，
 * 地址照 Core 的访问方式换好：默认经 WebVPN，统一身份认证和标注为公网可达的网站直连，选了校园网直连就都直连。
 * 教务网这类不会自己把人带去统一身份认证的网站，先打开统一身份认证为它换票的地址，再打开要看的那一页。
 * 照桌面版的阅读窗口（desktop/reader.cjs）搬的，做不到的一样：页面跳转途中改写地址（ctx.browser 没有导航拦截），WebVPN 下点到别的校内链接可能要再登录一次。
 * 没装 dsh-builtin-browser 时页面自己用右侧栏的浏览器或新标签页打开，不经这里。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const WEBVPN_HOST = 'webvpn.zju.edu.cn'
const CAS_HOST = 'zjuam.zju.edu.cn'
/** WebVPN 给主机名加密用的固定密钥，和 core/zju/lib/webvpn/client.ts 里的是同一个。 */
const WRD_KEY = Buffer.from('wrdvpnisthebest!', 'utf8')
/** 这两个会话文件里的 cookie 才放进窗口，而且只放 zju.edu.cn 下面的。 */
const SESSION_FILES = ['zjuam', 'webvpn']
/** 从校外实测过公网可达的站点（core/zju/lib/webvpn/README.md 的表），Core 访问它们也是直连。 */
const KNOWN_PUBLIC = ['zdbk.zju.edu.cn', 'courses.zju.edu.cn', 'classroom.zju.edu.cn', 'eta.zju.edu.cn']
/** 要先到统一身份认证换票的网站，和换票的地址（core/zju/lib/zdbk/client.ts 的 CAS_SERVICE）。 */
const SITE_LOGINS = { 'zdbk.zju.edu.cn': 'https://zdbk.zju.edu.cn/jwglxt/xtgl/login_ssologin.html' }

export const isCampusHost = host => host === 'zju.edu.cn' || host.endsWith('.zju.edu.cn')

function encodeHost(host) {
  const cipher = crypto.createCipheriv('aes-128-cfb', WRD_KEY, WRD_KEY)
  return WRD_KEY.toString('hex') + Buffer.concat([cipher.update(Buffer.from(host.toLowerCase(), 'utf8')), cipher.final()]).toString('hex')
}

/** 真实地址 → WebVPN 形式，不带让 WebVPN 原样返回内容的 vpn-12-o2 标记：要给人看，页面里的链接得由 WebVPN 改写好。 */
export function wrapUrl(realUrl) {
  const url = new URL(realUrl)
  if (url.hostname === WEBVPN_HOST) return url.href
  return `https://${WEBVPN_HOST}/${url.protocol.replace(':', '')}${url.port ? `-${url.port}` : ''}/${encodeHost(url.hostname)}${url.pathname}${url.search}${url.hash}`
}

/** 读通知模块的逐站标注表，取出标为公网可达的主机；表还没生成时只有实测过的那几个。 */
function publicHostsFrom(file) {
  const hosts = new Set(KNOWN_PUBLIC)
  try {
    for (const [host, note] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')).hosts ?? {})) if (note?.network === 'public') hosts.add(host)
  } catch { /* 没有这张表或读不了 */ }
  return hosts
}

/** 一个要去的地址实际该打开哪个地址；transport 是 Core 的访问方式。不是 http(s) 的返回 undefined。 */
export function routeUrl(target, transport, publicHosts = new Set(KNOWN_PUBLIC)) {
  let url
  try { url = new URL(target) } catch { return undefined }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  if (transport !== 'webvpn' || url.hostname === WEBVPN_HOST || url.hostname === CAS_HOST || publicHosts.has(url.host)) return url.href
  return isCampusHost(url.hostname) ? wrapUrl(url.href) : url.href
}

/** Core 存的一条 cookie 变成 restoreAuth 认的写法；不在 zju.edu.cn 下面的不要。 */
export function exportedCookie(cookie) {
  const domain = typeof cookie?.domain === 'string' ? cookie.domain.replace(/^\./, '').toLowerCase() : ''
  if (!isCampusHost(domain) || typeof cookie.name !== 'string' || !cookie.name || typeof cookie.value !== 'string') return undefined
  const cookiePath = typeof cookie.path === 'string' && cookie.path.startsWith('/') ? cookie.path : '/'
  return {
    url: `${cookie.secure ? 'https' : 'http'}://${domain}${cookiePath}`, name: cookie.name, value: cookie.value, path: cookiePath, secure: cookie.secure === true,
    ...(cookie.hostOnly ? {} : { domain }),
    ...(typeof cookie.expires === 'number' && cookie.expires > 0 ? { expirationDate: cookie.expires / 1000 } : {}),
  }
}

export class CampusPage {
  /** browser 返回 ctx.browser；account 读访问方式；dataDir 是 ZJU Core 的数据目录；coreRoot 找公网可达的标注表；run 跑一条 Core 命令。 */
  constructor({ browser, account, dataDir, coreRoot, run }) {
    Object.assign(this, { browser, account, dataDir, run })
    this.publicHosts = publicHostsFrom(path.join(coreRoot, 'zju', 'lib', 'notice', 'hosts.json'))
    this.session = undefined
  }

  available() { return !!this.browser() }

  transport() { return this.account.read().data.transport === 'direct' ? 'direct' : 'webvpn' }

  cookies() {
    return SESSION_FILES.flatMap((system) => {
      try { return JSON.parse(fs.readFileSync(path.join(this.dataDir(), 'sessions', `${system}.json`), 'utf8')).cookies ?? [] } catch { return [] }
    }).flatMap(cookie => exportedCookie(cookie) ?? [])
  }

  /** 在内置浏览器里打开；返回实际打开的地址。 */
  async open(target) {
    const browser = this.browser()
    if (!browser) throw new Error('没有装内置浏览器（dsh-builtin-browser）。')
    const url = new URL(target)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('只能打开网页地址。')
    const transport = this.transport()
    if (isCampusHost(url.hostname)) {
      // 会话过期时先让 Core 登录一次；登不上也照样打开，页面上会停在登录页，用户自己能看到。
      for (const system of transport === 'webvpn' ? ['zjuam', 'webvpn'] : ['zjuam']) await this.run([system, 'session', 'login'], { system: system === 'zjuam' ? '统一身份认证' : 'WebVPN', timeoutMs: 60_000, ignoreSwitches: true }).catch(() => {})
    }
    if (!this.session || !browser.exists(this.session)) this.session = await browser.open('ZJU All-in-One Assistant')
    await browser.restoreAuth(this.session, this.cookies()).catch(() => 0)
    const site = SITE_LOGINS[url.host]
    if (site) {
      await browser.openUrl(this.session, { url: routeUrl(`https://${CAS_HOST}/cas/login?service=${encodeURIComponent(site)}`, transport, this.publicHosts) })
      await browser.waitFor(this.session, { timeoutMs: 15_000 }).catch(() => {})
    }
    const opened = routeUrl(url.href, transport, this.publicHosts)
    await browser.openUrl(this.session, { url: opened })
    return { url: opened }
  }
}
