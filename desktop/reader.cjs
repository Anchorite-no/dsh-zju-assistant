/**
 * 应用里看网页的窗口。通知原文、公众号文章、对话里的链接点开以后在这里显示，不去系统浏览器：
 * 系统浏览器里要重新登录统一身份认证和 WebVPN，还可能把应用存着的会话顶掉。
 *
 * 这个窗口复用 ZJU Core 已经登录好的会话，做法和 Core 自己访问校内网站时一样：
 * - 打开前把 Core 存下的统一身份认证和 WebVPN 的 cookie（会话文件 zjuam.json、webvpn.json）放进窗口自己的会话里。
 *   只放这两样的；各个网站自己的登录状态由它们经统一身份认证各自建立。
 * - 校内网站怎么走和 Core 一致，看插件页「校园账号」里选的访问方式：默认经 WebVPN，选了校园网直连就直连。
 *   经 WebVPN 时，统一身份认证仍然直连（登录状态在本机，不在 WebVPN 那边）：页面被带去 WebVPN 形式的
 *   统一身份认证地址时改成直连的；统一身份认证带着票据跳回校内网站时，再把地址改写成 WebVPN 形式。
 *   标注为公网可达的网站不绕 WebVPN，直连：Core 里实测过的几个，加上通知模块逐站标注的那张表
 *   （core/zju/lib/notice/hosts.json，由 scripts/notice/hosts.ts 生成）。没标注的校内网站一律经 WebVPN，它两种都到得了。
 *   公网可达的网站上也有只给校内看的页面，校外直连会被挡到「无权访问」页：遇到了就把这个网站改成经 WebVPN，重开要看的那一页。
 * - 存着的会话过期了（落到了登录页），让 Core 自己重新登录一次，再放一遍 cookie 重开，不让用户在这里输密码。
 * - 教务网这类网站不会自己把人带去统一身份认证：打开它的页面之前，先到统一身份认证为它换一次票（见 SITE_LOGINS）。
 * - 每一步去了哪、为什么换路、登录续上没有，记在应用数据目录的 reader.log 里（只有主机和路径），出了问题照着查。
 */
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const WEBVPN_HOST = 'webvpn.zju.edu.cn'
const CAS_HOST = 'zjuam.zju.edu.cn'
/** WebVPN 给主机名加密用的固定密钥，和 core/zju/lib/webvpn/client.ts 里的是同一个。 */
const WRD_KEY = Buffer.from('wrdvpnisthebest!', 'utf8')
/** WebVPN 的会话 Core 按六小时算过期；快到了就先让 Core 续上再打开，省得先落到登录页。 */
const WEBVPN_FRESH_MS = 5.5 * 3600_000
/** 这两个会话文件里的 cookie 才放进窗口，而且只放 zju.edu.cn 下面的。 */
const SESSION_FILES = ['zjuam', 'webvpn']
/** 从校外实测过公网可达的站点（core/zju/lib/webvpn/README.md 的表，2026-09-17），Core 访问它们也是直连。 */
const KNOWN_PUBLIC = ['zdbk.zju.edu.cn', 'courses.zju.edu.cn', 'classroom.zju.edu.cn', 'eta.zju.edu.cn']
/** 网站群把校外读者挡下来时跳去的页面；原来要看的地址在它的 parentUrl 参数里。 */
const NO_PERMIT_PATH = '/nopermit_zjusub.jsp'

/** 是不是被挡到了「无权访问」页；是的话返回原来要看的地址（只认同一个网站上的），没带就返回空串。别的地址返回 undefined。 */
function deniedPage(current) {
  let url
  try { url = new URL(current) } catch { return undefined }
  if (url.hostname === WEBVPN_HOST || !isCampusHost(url.hostname) || url.pathname !== NO_PERMIT_PATH) return undefined
  try {
    const parent = new URL(url.searchParams.get('parentUrl') ?? '', url.href)
    return parent.host === url.host && parent.pathname !== NO_PERMIT_PATH ? parent.href : ''
  } catch { return '' }
}

function encodeHost(host) {
  const cipher = crypto.createCipheriv('aes-128-cfb', WRD_KEY, WRD_KEY)
  return WRD_KEY.toString('hex') + Buffer.concat([cipher.update(Buffer.from(host.toLowerCase(), 'utf8')), cipher.final()]).toString('hex')
}

function decodeHost(encoded) {
  const prefix = WRD_KEY.toString('hex')
  if (!encoded.startsWith(prefix)) return undefined
  const decipher = crypto.createDecipheriv('aes-128-cfb', WRD_KEY, WRD_KEY)
  return Buffer.concat([decipher.update(Buffer.from(encoded.slice(prefix.length), 'hex')), decipher.final()]).toString('utf8')
}

/**
 * 真实地址 → WebVPN 形式。和 Core 的 rewriteUrl 是同一种写法，只是不带结尾的 vpn-12-o2 标记：
 * 那个标记让 WebVPN 原样返回内容，Core 要的是原文；这里要给人看，页面里的链接和资源得由 WebVPN 改写好。
 */
function wrapUrl(realUrl) {
  const url = new URL(realUrl)
  if (url.hostname === WEBVPN_HOST) return url.href
  return `https://${WEBVPN_HOST}/${url.protocol.replace(':', '')}${url.port ? `-${url.port}` : ''}/${encodeHost(url.hostname)}${url.pathname}${url.search}${url.hash}`
}

/** WebVPN 形式 → 真实地址；不是 WebVPN 形式的原样返回。 */
function unwrapUrl(vpnUrl) {
  const url = new URL(vpnUrl)
  if (url.hostname !== WEBVPN_HOST) return url.href
  const match = /^\/(https?)(?:-(\d+))?\/([0-9a-f]+)(\/.*)?$/i.exec(url.pathname)
  const host = match ? decodeHost(match[3]) : undefined
  if (!host) return url.href
  const search = url.search.replace(/[?&]vpn-12-o2-[^&]*/g, '').replace(/^&/, '?')
  return `${match[1]}://${host}${match[2] ? `:${match[2]}` : ''}${match[4] ?? '/'}${search}${url.hash}`
}

const isCampusHost = host => host === 'zju.edu.cn' || host.endsWith('.zju.edu.cn')

/**
 * 学校搬了家、旧地址又没留跳转的网站（Core 的那张表 core/zju/lib/core/moved.json，Core 自己也照它换）：
 * 每行是旧地址的主机名、路径（这段路径和它下面的都算，没有路径就是整个网站）和现在的地址。读不了就是空的。
 */
function movedFrom(file) {
  try {
    return (JSON.parse(fs.readFileSync(file, 'utf8')).moved ?? []).flatMap((row) => {
      if (typeof row?.from !== 'string' || typeof row.to !== 'string') return []
      const [host, ...rest] = row.from.toLowerCase().replace(/\/+$/, '').split('/')
      return host ? [{ host, path: rest.length ? `/${rest.join('/')}` : '', to: row.to }] : []
    })
  } catch { return [] }
}

/** 这个地址是旧地址的话，现在的地址是什么；不是就返回 undefined。 */
function movedUrl(url, moved) {
  const host = url.hostname.toLowerCase(), at = url.pathname.toLowerCase()
  return moved.find(entry => host === entry.host && (!entry.path || at === entry.path || at.startsWith(`${entry.path}/`)))?.to
}

/**
 * 一个要去的地址实际该打开哪个地址。transport 是 Core 的访问方式（webvpn 或 direct）；
 * publicHosts 是标注为公网可达的主机，经 WebVPN 时它们也直连；moved 是搬了家的旧地址（movedFrom）。
 * 不是 http(s) 的返回 undefined，不打开。
 */
function routeUrl(target, transport, publicHosts = new Set(), moved = []) {
  let url
  try { url = new URL(target) } catch { return undefined }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  // 旧文件里的老地址（比如老素拓网）学校已经停用：开现在的地址。页面是经 WebVPN 看的时候，里面的链接也被改写成了 WebVPN 形式，先还原再认。
  const now = movedUrl(url.hostname === WEBVPN_HOST ? new URL(unwrapUrl(url.href)) : url, moved)
  if (now) url = new URL(now)
  if (transport !== 'webvpn') return url.href
  if (url.hostname === WEBVPN_HOST) {
    // WebVPN 把去统一身份认证的跳转改写成了它自己的地址；统一身份认证要直连。
    const real = unwrapUrl(url.href)
    return real !== url.href && new URL(real).hostname === CAS_HOST ? real : url.href
  }
  if (url.hostname === CAS_HOST || publicHosts.has(url.host)) return url.href
  return isCampusHost(url.hostname) ? wrapUrl(url.href) : url.href
}

/** 读通知模块的逐站标注表，取出标为公网可达的主机；表还没生成时只有实测过的那几个。 */
function publicHostsFrom(file) {
  const hosts = new Set(KNOWN_PUBLIC)
  try {
    for (const [host, note] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')).hosts ?? {})) if (note?.network === 'public') hosts.add(host)
  } catch { /* 没有这张表或读不了 */ }
  return hosts
}

/** 是不是停在了登录页上：统一身份认证的，或者 WebVPN 的。别的地址返回 undefined。 */
function loginPage(current) {
  let url
  try { url = new URL(current) } catch { return undefined }
  if (url.hostname === CAS_HOST && url.pathname.startsWith('/cas/login')) return 'zjuam'
  if (url.hostname === WEBVPN_HOST && url.pathname === '/login') return 'webvpn'
  return undefined
}

/** Core 存的一条 cookie 变成 Electron 认的写法；不在 zju.edu.cn 下面的不要。 */
function cookieDetails(cookie) {
  const domain = typeof cookie?.domain === 'string' ? cookie.domain.replace(/^\./, '').toLowerCase() : ''
  if (!isCampusHost(domain) || typeof cookie.name !== 'string' || !cookie.name || typeof cookie.value !== 'string') return undefined
  const cookiePath = typeof cookie.path === 'string' && cookie.path.startsWith('/') ? cookie.path : '/'
  return {
    url: `${cookie.secure ? 'https' : 'http'}://${domain}${cookiePath}`,
    name: cookie.name, value: cookie.value, path: cookiePath, secure: cookie.secure === true,
    // 整个域共用的（统一身份认证的登录凭证就是）写上域名；只给这一台主机的不写。
    ...(cookie.hostOnly ? {} : { domain }),
    ...(typeof cookie.expires === 'number' && cookie.expires > 0 ? { expirationDate: cookie.expires / 1000 } : {}),
  }
}

/** 等着的时候和出错的时候窗口里显示的一句话。 */
function notePage(text, dark) {
  const escaped = text.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char])
  const html = `<!doctype html><meta charset="utf-8"><title>校园智能体</title><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font:14px/22px system-ui,'Microsoft YaHei',sans-serif;background:${dark ? '#1b1b1c' : '#fff'};color:${dark ? '#c9cdd4' : '#4e5969'}"><p style="max-width:520px;padding:0 24px;text-align:center">${escaped}</p>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

/**
 * 让 Core 把一个会话登录好并存下（已经有效时它不会重新登录）。用的是 Core 自己的会话维护命令，账号密码由它从档案目录读。
 * 返回 { ok, message }。
 */
function ensureSession(system, { coreRoot, profileDir, execPath = process.execPath, timeoutMs = 60_000 }) {
  return new Promise((resolve) => {
    const child = spawn(execPath, [path.join(coreRoot, 'zju', 'scripts', 'zju.ts'), system, 'session', 'login'], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', CAMPUS_PROFILE_DIR: profileDir }, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    })
    let output = ''
    const timer = setTimeout(() => { child.kill(); resolve({ ok: false, message: '一直没有回应' }) }, timeoutMs)
    child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk })
    child.once('error', (error) => { clearTimeout(timer); resolve({ ok: false, message: error.message }) })
    child.once('close', () => {
      clearTimeout(timer)
      try {
        const result = JSON.parse(output)
        resolve(result.ok ? { ok: true } : { ok: false, message: [result.error?.message, result.error?.hint].filter(Boolean).join('；') || '没有登录成功' })
      } catch { resolve({ ok: false, message: '没有拿到结果' }) }
    })
  })
}

const SYSTEM_NAMES = { zjuam: '统一身份认证', webvpn: 'WebVPN' }
/** 和 Core 发请求时用的是同一个（core/zju/lib/core/http.ts 的 DEFAULT_UA）：登录状态是 Core 建立的，这个窗口接着用，对学校那边是同一个浏览器。 */
const CORE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'

/**
 * 有些网站不会自己把人带去统一身份认证再带回来，要先到统一身份认证为它换一次票，它才认登录（Core 里叫 CAS 委托）。
 * 教务网是这样：没登录时打开它的页面只会被带到它自己的登录页。换票的地址和 Core 的教务网模块用的是同一个
 * （core/zju/lib/zdbk/client.ts 的 CAS_SERVICE）。expired 认这个网站自己的「请登录」页，判法也照那个文件的 isExpired。
 */
const SITE_LOGINS = {
  'zdbk.zju.edu.cn': {
    name: '教务网', service: 'https://zdbk.zju.edu.cn/jwglxt/xtgl/login_ssologin.html',
    expired: url => /\/login_slogin\.html$/.test(url.pathname) || (/\/login_ssologin\.html$/.test(url.pathname) && !url.searchParams.has('ticket')),
  },
}
/** 到统一身份认证为一个网站换票的地址；登录状态有效时它直接带着票跳回那个网站。 */
const casLogin = service => `https://${CAS_HOST}/cas/login?service=${encodeURIComponent(service)}`

/** 日志里一个地址只记主机和路径，不记问号后面的（里面有票据）。经 WebVPN 的写成它背后的真实网站。 */
function plain(target) {
  try {
    const url = new URL(target)
    if (url.protocol === 'data:') return '（提示页）'
    const real = new URL(unwrapUrl(url.href)), via = real.href === url.href ? '' : 'WebVPN→'
    const service = real.hostname === CAS_HOST ? real.searchParams.get('service') : null
    return `${via}${real.host}${real.pathname}${service ? ` service=${plain(service)}` : ''}`
  } catch { return '（不是网址）' }
}

/**
 * profileDir 是档案目录；coreRoot 是应用自带的 core 目录；dark 返回现在是不是深色主题。
 * ensure 可以换掉（测试时不真的去登录）。返回 { open(url), close() }。
 */
function createReader({ BrowserWindow, session, profileDir, coreRoot, dark = () => false, ensure = ensureSession }) {
  const dataDir = process.env.ZJU_DATA_DIR?.trim() ? path.resolve(process.env.ZJU_DATA_DIR) : path.join(path.dirname(profileDir), 'zju')
  /** 这个窗口每一步去了哪、为什么换路、登录续上没有，都记一行，出了问题照着查。只记主机和路径；太大了就清空重记。 */
  const logFile = path.join(path.dirname(profileDir), 'reader.log')
  const log = (event, target, extra = '') => {
    try {
      if (fs.existsSync(logFile) && fs.statSync(logFile).size > 200_000) fs.writeFileSync(logFile, '')
      fs.appendFileSync(logFile, `${new Date().toISOString()} ${event}${target ? ` ${plain(target)}` : ''}${extra ? ` ${extra}` : ''}\n`)
    } catch { /* 记不了就不记 */ }
  }
  let window
  /** 现在想看的那个地址（真实地址），登录状态续上以后重开它。 */
  let wanted = ''
  /** 这次打开里已经为哪个系统（或哪个网站）重新登录过；每个只试一次，免得在登录页上打转。 */
  let retried = new Set()
  /** 这个窗口里已经换过票的网站；窗口的会话在应用开着时一直在，所以记到应用退出。 */
  const signedIn = new Set()
  /** 正在为哪个网站换票；换完回到它的页面时接着开想看的地址。 */
  let handshake
  let opening = 0

  const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return undefined } }
  /** 访问方式只看这一项，账号文件里别的内容这里不用。 */
  const transport = () => readJson(path.join(profileDir, 'accounts.json'))?.transport === 'direct' ? 'direct' : 'webvpn'
  const sessionFile = system => readJson(path.join(dataDir, 'sessions', `${system}.json`))
  let prepared
  const store = () => {
    const found = session.fromPartition('campus-reader')
    if (prepared !== found) { found.setUserAgent(CORE_UA); prepared = found }
    return found
  }
  const publicHosts = publicHostsFrom(path.join(coreRoot, 'zju', 'lib', 'notice', 'hosts.json'))
  const moved = movedFrom(path.join(coreRoot, 'zju', 'lib', 'core', 'moved.json'))
  const route = target => routeUrl(target, transport(), publicHosts, moved)

  /** 把 Core 存着的统一身份认证和 WebVPN 的 cookie 放进窗口的会话。 */
  async function syncCookies() {
    for (const system of SESSION_FILES) {
      for (const cookie of sessionFile(system)?.cookies ?? []) {
        const details = cookieDetails(cookie)
        if (details) await store().cookies.set(details).catch(() => {})
      }
    }
  }

  const alive = () => window && !window.isDestroyed()
  const note = text => window.loadURL(notePage(text, dark())).catch(() => {})
  const load = url => window.loadURL(url).catch(() => {})
  /** 等手头这次导航的事件处理完，再开下一个地址。 */
  const loadSoon = url => { setImmediate(() => { if (alive()) void load(url) }) }

  /** 现在该开哪个地址：想看的网站要先换票、而这个窗口里还没换过，就先去统一身份认证为它换；否则直接开想看的。 */
  function nextUrl() {
    const host = new URL(wanted).host, site = SITE_LOGINS[host]
    if (site && !signedIn.has(host)) {
      handshake = host
      log('先为这个网站换票', casLogin(site.service))
      return casLogin(site.service)
    }
    handshake = undefined
    return route(wanted)
  }

  /** 续上一个系统的登录状态再接着开；续不上就在窗口里说明原因。 */
  async function relogin(system, turn) {
    retried.add(system)
    await note(`正在登录${SYSTEM_NAMES[system]}…`)
    log(`让 Core 登录${SYSTEM_NAMES[system]}`)
    const result = await ensure(system, { coreRoot, profileDir })
    log(`Core 登录${SYSTEM_NAMES[system]}${result.ok ? '成功' : `失败：${result.message}`}`)
    if (turn !== opening || !alive()) return
    if (!result.ok) { await note(`没能登录${SYSTEM_NAMES[system]}：${result.message}。可以到插件页的「校园账号」里检查账号。`); return }
    await syncCookies()
    await load(nextUrl())
  }

  function create() {
    window = new BrowserWindow({
      width: 1100, height: 800, minWidth: 480, minHeight: 360, title: '校园智能体', show: false, autoHideMenuBar: true,
      backgroundColor: dark() ? '#1b1b1c' : '#ffffff',
      webPreferences: { session: store(), sandbox: true, contextIsolation: true, nodeIntegration: false },
    })
    const contents = window.webContents
    /** 整页要去的地址如果该换一条路走，拦下来改走那条（页面里嵌的小框不管）。 */
    const reroute = (event, url, _inPlace, isMainFrame) => {
      if ((event.isMainFrame ?? isMainFrame) === false) return
      // 直连的网站把这一页挡到了「无权访问」：它只给校内看。这个网站之后都经 WebVPN，重开原来要看的那一页。
      const parent = transport() === 'webvpn' ? deniedPage(url) : undefined
      if (parent !== undefined && publicHosts.delete(new URL(url).host)) {
        event.preventDefault()
        log('只给校内看，改走 WebVPN', url)
        loadSoon(route(parent || wanted))
        return
      }
      const routed = route(url)
      if (routed === undefined) { event.preventDefault(); return }
      if (routed === url) return
      event.preventDefault()
      log('换一条路', url, `→ ${plain(routed)}`)
      loadSoon(routed)
    }
    contents.on('will-navigate', reroute)
    contents.on('will-redirect', reroute)
    contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => { if (isMainFrame && code !== -3) log('没打开', url, `${code} ${description}`) })
    contents.on('did-navigate', (_event, url, status) => {
      if (!/^https?:/i.test(url)) return
      log('到了', url, String(status))
      const system = loginPage(url)
      if (system) {
        // 停在了登录页：存着的会话过期了。让 Core 重新登录一次，每个系统只试一次。
        if (!retried.has(system)) void relogin(system, opening)
        else log(`${SYSTEM_NAMES[system]}登录以后还是停在登录页`)
        return
      }
      const real = new URL(unwrapUrl(url)), site = SITE_LOGINS[real.host]
      if (handshake && real.host === handshake) {
        // 换票回来了：网站认了就接着开想看的地址。
        handshake = undefined
        if (site.expired(real)) { log(`${site.name}没有认换来的票`); void note(`没能登录${site.name}：统一身份认证通过了，但${site.name}没有认。过一会儿再点一次。`); return }
        signedIn.add(real.host)
        log(`${site.name}登录好了`)
        loadSoon(route(wanted))
        return
      }
      if (site?.expired(real)) {
        // 这个网站自己的登录状态没了（开了很久，或者在别处被顶掉）：重新换一次票，只试一次。
        if (retried.has(real.host)) { log(`${site.name}换过票以后还是要登录`); return }
        retried.add(real.host)
        signedIn.delete(real.host)
        loadSoon(nextUrl())
        return
      }
      // 记下现在看的是哪儿（真实地址），登录状态续上以后回到这里。「无权访问」页不算。
      if (deniedPage(url) === undefined) wanted = real.href
    })
    // 页面里要开新窗口的链接，都在这一个窗口里开。
    contents.setWindowOpenHandler(({ url }) => { open(url); return { action: 'deny' } })
    // 鼠标侧键和键盘：后退、前进、刷新。
    const history = contents.navigationHistory
    const back = () => { if (history.canGoBack()) history.goBack() }
    const forward = () => { if (history.canGoForward()) history.goForward() }
    window.on('app-command', (_event, command) => { if (command === 'browser-backward') back(); else if (command === 'browser-forward') forward() })
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      if (input.alt && input.key === 'ArrowLeft') { event.preventDefault(); back() }
      else if (input.alt && input.key === 'ArrowRight') { event.preventDefault(); forward() }
      else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) { event.preventDefault(); contents.reload() }
    })
    window.on('closed', () => { window = undefined })
  }

  /** 在这个窗口里打开一个地址。 */
  async function open(target) {
    const routed = route(target)
    if (routed === undefined) return
    const turn = ++opening
    wanted = unwrapUrl(routed)
    retried = new Set()
    handshake = undefined
    if (!alive()) create()
    window.show()
    window.focus()
    log('打开', routed, `访问方式=${transport()}`)
    // 要经 WebVPN 去、而它的会话没有或者快过期了：先让 Core 续上，省得先看到一眼登录页。
    if (new URL(routed).hostname === WEBVPN_HOST) {
      const saved = sessionFile('webvpn')
      if (!saved || Date.now() - Number(saved.savedAt) > WEBVPN_FRESH_MS) { await relogin('webvpn', turn); return }
    }
    await syncCookies()
    if (turn === opening && alive()) await load(nextUrl())
  }

  return { open: (url) => { void open(url) }, close: () => { if (alive()) window.close() } }
}

module.exports = { createReader, wrapUrl, unwrapUrl, routeUrl, publicHostsFrom, movedFrom, loginPage, deniedPage, cookieDetails, SITE_LOGINS, CORE_UA }
