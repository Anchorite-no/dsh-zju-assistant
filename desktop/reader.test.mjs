import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { rewriteUrl, unwrapUrl as coreUnwrap } from '../core/zju/lib/webvpn/client.ts'

const { wrapUrl, unwrapUrl, routeUrl, publicHostsFrom, loginPage, cookieDetails } = createRequire(import.meta.url)('./reader.cjs')

const URLS = [
  'http://www.xgb.zju.edu.cn/53388/list.htm',
  'https://bksy.zju.edu.cn/2026/0930/c28418a3211202/page.htm?from=list&x=1',
  'http://itc.zju.edu.cn:8080/90618/list.psp',
  'https://www.cs.zju.edu.cn/',
]

test('地址改写成 WebVPN 形式的写法和 Core 一致，只是不带原样返回内容的标记；能原样还原', () => {
  for (const url of URLS) {
    const wrapped = wrapUrl(url)
    // Core 的写法是在后面再接一个 vpn-12-o2 标记，别的完全相同。
    assert.equal(rewriteUrl(url).replace(/[?&]vpn-12-o2-[^&]*$/, ''), wrapped)
    assert.equal(unwrapUrl(wrapped), new URL(url).href)
    assert.equal(coreUnwrap(wrapped), new URL(url).href)
    // Core 给出的带标记的地址，这里也能还原。
    assert.equal(unwrapUrl(rewriteUrl(url)), new URL(url).href)
  }
  assert.equal(wrapUrl('https://www.cs.zju.edu.cn/a#top').endsWith('/a#top'), true)
  assert.equal(wrapUrl(wrapUrl(URLS[0])), wrapUrl(URLS[0]))
  assert.equal(unwrapUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1')
  assert.equal(unwrapUrl('https://webvpn.zju.edu.cn/login'), 'https://webvpn.zju.edu.cn/login')
})

test('经 WebVPN 时：校内网站改走 WebVPN，统一身份认证和校外网站直连；直连时都不改', () => {
  const site = 'http://itc.zju.edu.cn/90618/list.htm', cas = 'https://zjuam.zju.edu.cn/cas/login?service=http%3A%2F%2Fitc.zju.edu.cn%2F90618%2Flist.psp'
  assert.equal(routeUrl(site, 'webvpn'), wrapUrl(site))
  assert.equal(routeUrl(cas, 'webvpn'), cas)
  assert.equal(routeUrl('https://mp.weixin.qq.com/s/abc', 'webvpn'), 'https://mp.weixin.qq.com/s/abc')
  // WebVPN 把去统一身份认证的跳转改写成了自己的地址：改回直连，登录状态在本机。
  assert.equal(routeUrl(wrapUrl(cas), 'webvpn'), cas)
  // 统一身份认证带着票据跳回校内网站：改写成 WebVPN 形式，票据原样带着。
  const back = 'http://itc.zju.edu.cn/90618/list.psp?ticket=ST-1-abc'
  assert.equal(unwrapUrl(routeUrl(back, 'webvpn')), back)
  // 已经在 WebVPN 里的地址不再动。
  assert.equal(routeUrl(wrapUrl(site), 'webvpn'), wrapUrl(site))
  for (const url of [site, cas, wrapUrl(site), 'https://mp.weixin.qq.com/s/abc']) assert.equal(routeUrl(url, 'direct'), url)
  // 标注为公网可达的网站经 WebVPN 时也直连；同一个站别的端口没标注，照旧走 WebVPN。
  const open = new Set(['www.xgb.zju.edu.cn'])
  assert.equal(routeUrl('http://www.xgb.zju.edu.cn/53388/list.htm', 'webvpn', open), 'http://www.xgb.zju.edu.cn/53388/list.htm')
  assert.equal(routeUrl('http://www.xgb.zju.edu.cn:8080/x', 'webvpn', open), wrapUrl('http://www.xgb.zju.edu.cn:8080/x'))
  assert.equal(routeUrl(site, 'webvpn', open), wrapUrl(site))
  // 标注表还没生成时，只有 Core 里实测过的那几个算公网可达；表里标 campus 的不算。
  assert.equal(publicHostsFrom('no-such-file.json').has('zdbk.zju.edu.cn'), true)
  assert.equal(publicHostsFrom('no-such-file.json').has('bksy.zju.edu.cn'), false)
  // 只开网页地址。
  for (const bad of ['file:///C:/Windows/win.ini', 'javascript:alert(1)', 'zju://x', 'not a url', '']) assert.equal(routeUrl(bad, 'webvpn'), undefined)
})

test('认得出停在了哪个登录页', () => {
  assert.equal(loginPage('https://zjuam.zju.edu.cn/cas/login?service=x'), 'zjuam')
  assert.equal(loginPage('https://webvpn.zju.edu.cn/login'), 'webvpn')
  assert.equal(loginPage('https://zjuam.zju.edu.cn/cas/logout'), undefined)
  assert.equal(loginPage(wrapUrl('http://itc.zju.edu.cn/login')), undefined)
  assert.equal(loginPage('data:text/html,x'), undefined)
})

test('Core 存的 cookie 只放 zju.edu.cn 下面的，整个域共用的写上域名', () => {
  const tgc = cookieDetails({ name: 'iPlanetDirectoryPro', value: 'v', domain: 'zju.edu.cn', path: '/', hostOnly: false, secure: false, expires: null, created: 1 })
  assert.deepEqual(tgc, { url: 'http://zju.edu.cn/', name: 'iPlanetDirectoryPro', value: 'v', path: '/', secure: false, domain: 'zju.edu.cn' })
  const ticket = cookieDetails({ name: 'wengine_vpn_ticketwebvpn_zju_edu_cn', value: 't', domain: 'webvpn.zju.edu.cn', path: '/', hostOnly: true, secure: true, expires: 1_800_000_000_000, created: 1 })
  assert.deepEqual(ticket, { url: 'https://webvpn.zju.edu.cn/', name: 'wengine_vpn_ticketwebvpn_zju_edu_cn', value: 't', path: '/', secure: true, expirationDate: 1_800_000_000 })
  assert.equal(cookieDetails({ name: 'JSESSIONID', value: 'j', domain: 'zjuam.zju.edu.cn', path: '/cas', hostOnly: true, secure: true, expires: null }).url, 'https://zjuam.zju.edu.cn/cas')
  for (const bad of [{ name: 'a', value: 'b', domain: 'example.com', path: '/' }, { name: 'a', value: 'b', domain: 'evilzju.edu.cn', path: '/' }, { name: '', value: 'b', domain: 'zju.edu.cn', path: '/' }, { name: 'a', domain: 'zju.edu.cn' }, null]) assert.equal(cookieDetails(bad), undefined)
})

test('通知用到的每个网站都在逐站标注表里；标公网的直连，标校内的经 WebVPN', async () => {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const { targets } = await import('../core/zju/scripts/notice/hosts.ts')
  const file = fileURLToPath(new URL('../core/zju/lib/notice/hosts.json', import.meta.url))
  const table = JSON.parse(readFileSync(file, 'utf8')).hosts
  // 来源表或学院名录里多了网站而表里没有，就是该重跑标注了。
  const missing = [...targets().keys()].filter(host => !table[host])
  assert.deepEqual(missing, [], '有网站还没标注，重跑 node core/zju/scripts/notice/hosts.ts --via <不在校园网里的外部主机>')
  for (const [host, note] of Object.entries(table)) assert.ok(['public', 'campus'].includes(note.network), host)
  const open = publicHostsFrom(file)
  // 和更早从校外实测过的两个站对得上：教务网公网可达，本科生院只在校园网（core/zju/lib/webvpn/README.md）。
  assert.equal(open.has('zdbk.zju.edu.cn'), true)
  assert.equal(open.has('bksy.zju.edu.cn'), false)
  const xgb = 'http://www.xgb.zju.edu.cn/53388/list.htm', bksy = 'https://bksy.zju.edu.cn/76425/list.htm'
  assert.equal(routeUrl(xgb, 'webvpn', open), xgb)
  assert.equal(routeUrl(bksy, 'webvpn', open), wrapUrl(bksy))
})

test('认得出被网站挡到「无权访问」页，并取出原来要看的地址', () => {
  const { deniedPage } = createRequire(import.meta.url)('./reader.cjs')
  const page = 'http://www.xgb.zju.edu.cn/2026/1009/c53388a1/page.htm'
  assert.equal(deniedPage(`http://www.xgb.zju.edu.cn/nopermit_zjusub.jsp?parentUrl=${encodeURIComponent(page)}`), page)
  // 没带原地址，或者带的是别的网站的：知道是被挡了，但不跟着去。
  assert.equal(deniedPage('http://www.xgb.zju.edu.cn/nopermit_zjusub.jsp'), '')
  assert.equal(deniedPage('http://www.xgb.zju.edu.cn/nopermit_zjusub.jsp?parentUrl=https%3A%2F%2Fevil.example%2Fx'), '')
  for (const other of [page, 'https://example.com/nopermit_zjusub.jsp', wrapUrl('http://www.xgb.zju.edu.cn/nopermit_zjusub.jsp'), 'not a url']) assert.equal(deniedPage(other), undefined)
})

test('通知模块按逐站标注表选路：公网可达的直连，只在校园网的改写成 WebVPN 形式', async () => {
  const { readFileSync } = await import('node:fs')
  const { rewriteFor } = await import('../core/zju/lib/webvpn/transport.ts')
  const { requirements } = await import('../core/zju/lib/notice/index.ts')
  const { judge, declaredCas } = await import('../core/zju/scripts/notice/hosts.ts')
  const table = JSON.parse(readFileSync(new URL('../core/zju/lib/notice/hosts.json', import.meta.url), 'utf8')).hosts
  for (const host of ['www.xgb.zju.edu.cn', 'zhfw.zju.edu.cn', 'itc.zju.edu.cn', 'zdbk.zju.edu.cn']) assert.ok(requirements.publicHosts.includes(host), host)
  for (const host of ['bksy.zju.edu.cn', 'ygb.zju.edu.cn', 'zjutw.zju.edu.cn']) assert.ok(!requirements.publicHosts.includes(host), host)
  const open = new Set(requirements.publicHosts), resolve = rewriteFor(requirements.hosts, open)
  const xgb = 'http://www.xgb.zju.edu.cn/53388/list.htm', bksy = 'https://bksy.zju.edu.cn/76425/list.htm'
  assert.equal(resolve(xgb), xgb)
  assert.equal(resolve(bksy), rewriteUrl(bksy))
  // 表里没有的校内网站照旧经 WebVPN；校外网站和已经是 WebVPN 形式的不动。
  assert.equal(resolve('http://kyjs.zju.edu.cn/preview'), rewriteUrl('http://kyjs.zju.edu.cn/preview'))
  assert.equal(resolve('https://mp.weixin.qq.com/s/abc'), 'https://mp.weixin.qq.com/s/abc')
  assert.equal(resolve(rewriteUrl(bksy)), rewriteUrl(bksy))
  // 一个网站这次直连不通或者把校外挡下了，从直连的名单里拿掉以后就改走 WebVPN。
  open.delete('www.xgb.zju.edu.cn')
  assert.equal(resolve(xgb), rewriteUrl(xgb))
  // 要统一身份认证的：信息技术中心是测出来的，教务网取自教务网模块自己的声明（它的首页不会跳去登录）。
  assert.equal(table['itc.zju.edu.cn'].cas, true)
  assert.equal(table['zdbk.zju.edu.cn'].cas, true)
  assert.equal(declaredCas().has('zdbk.zju.edu.cn'), true)
  // 外部主机上测到的结果怎么判：被挡到「无权访问」页的状态码也是 200，但算只在校园网。
  assert.deepEqual(judge({ status: 200, final: 'http://x.zju.edu.cn/a/list.htm' }), { network: 'public', cas: false, status: 200 })
  assert.deepEqual(judge({ status: 200, final: 'https://zjuam.zju.edu.cn/cas/login?service=x' }), { network: 'public', cas: true, status: 200 })
  assert.deepEqual(judge({ status: 200, final: 'http://x.zju.edu.cn/nopermit_zjusub.jsp?parentUrl=y' }), { network: 'campus', cas: false, status: 200 })
  assert.deepEqual(judge({ status: 0, final: '-' }), { network: 'campus', cas: false, status: 0 })
})

test('教务网换票的地址、窗口报的浏览器标识和 Core 用的是同一个', async () => {
  const { SITE_LOGINS, CORE_UA } = createRequire(import.meta.url)('./reader.cjs')
  const { CAS_SERVICE, ZDBK_HOST } = await import('../core/zju/lib/zdbk/client.ts')
  const { DEFAULT_UA } = await import('../core/zju/lib/core/http.ts')
  assert.equal(SITE_LOGINS[ZDBK_HOST].service, CAS_SERVICE)
  assert.equal(CORE_UA, DEFAULT_UA)
  // 教务网自己的「请登录」页认得出；带着票回来的那一下和普通页面不算。
  const expired = path => SITE_LOGINS[ZDBK_HOST].expired(new URL(`https://${ZDBK_HOST}${path}`))
  assert.equal(expired('/jwglxt/xtgl/login_slogin.html'), true)
  assert.equal(expired('/jwglxt/xtgl/login_ssologin.html'), true)
  assert.equal(expired('/jwglxt/xtgl/login_ssologin.html?ticket=ST-1'), false)
  assert.equal(expired('/jwglxt/xtgl/xwgl_ckXw.html?xwbh=1&doType=save'), false)
})
