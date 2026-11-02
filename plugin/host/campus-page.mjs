/**
 * 页面上的校内链接（通知原文、教务网、学在浙大的页面）该打开哪个地址。页面用系统的默认浏览器打开链接（client/campus.ts 的 openPage），
 * 登录状态留在用户自己的浏览器里，这里只照 ZJU Core 的访问方式换地址：默认经 WebVPN，统一身份认证和标注为公网可达的网站直连，选了校园网直连就都直连。
 * 默认浏览器里写不进我们存的登录 cookie，第一次打开要用户自己登一次统一身份认证或 WebVPN；教务网这类不会自己把人带去统一身份认证的网站，停在它自己的登录页。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const WEBVPN_HOST = 'webvpn.zju.edu.cn'
const CAS_HOST = 'zjuam.zju.edu.cn'
/** WebVPN 给主机名加密用的固定密钥，和 core/zju/lib/webvpn/client.ts 里的是同一个。 */
const WRD_KEY = Buffer.from('wrdvpnisthebest!', 'utf8')
/** 从校外实测过公网可达的站点（core/zju/lib/webvpn/README.md 的表），Core 访问它们也是直连。 */
const KNOWN_PUBLIC = ['zdbk.zju.edu.cn', 'courses.zju.edu.cn', 'classroom.zju.edu.cn', 'eta.zju.edu.cn']

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

export class CampusPage {
  /** account 读访问方式；coreRoot 找公网可达的标注表。 */
  constructor({ account, coreRoot }) {
    this.account = account
    this.publicHosts = publicHostsFrom(path.join(coreRoot, 'zju', 'lib', 'notice', 'hosts.json'))
  }

  transport() { return this.account.read().data.transport === 'direct' ? 'direct' : 'webvpn' }

  /** 页面要打开的地址换成实际该开的那个。 */
  url(target) {
    const url = routeUrl(target, this.transport(), this.publicHosts)
    if (!url) throw new Error('只能打开网页地址。')
    return { url }
  }
}
