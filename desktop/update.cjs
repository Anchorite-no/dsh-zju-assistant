/**
 * 检查更新：有新版本自己下载，下完问要不要立刻装，装完应用自己重新打开。设置 → 通用设置里有一行，能手动查，也看得到下到哪了。
 * 新版本取自 GitHub 上这个项目的 Release（electron-updater）。仓库是公开的，不用令牌也能查、能下。
 * 有 GitHub 令牌就带上：环境变量、设置里存的令牌、本机 GitHub CLI 的登录，按这个顺序找（githubToken）。
 * 只有装好的应用才查，开发时（npm start）不查。
 * macOS 上装不了自己下好的新版本（没有 Apple 开发者证书），只查有没有、给一个去下载的地方，见下面的 createReleaseWatcher。
 */

/** 启动后多久查第一次，之后隔多久再查。 */
const FIRST_CHECK_MS = 15_000
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

/**
 * 查更新时带上的 GitHub 令牌。env 是环境变量，saved 返回设置里存的那个，run 执行一条命令并返回它的输出。
 * 都没有时给 undefined，那就不带令牌查。
 */
async function githubToken({ env, saved, run }) {
  const fromEnv = (env.GH_TOKEN || env.GITHUB_TOKEN || '').trim()
  if (fromEnv) return fromEnv
  const stored = (saved() || '').trim()
  if (stored) return stored
  try { return (await run('gh', ['auth', 'token'])).trim() || undefined } catch { return undefined }
}

/** 这次失败是不是因为读不到：令牌不对，或者看不到这个仓库、它的 Release（仓库要是改回私有，对外人回 404）。 */
const denied = error => /\b(401|403|404)\b|Bad credentials/.test(String(error?.message ?? error))

/**
 * autoUpdater 是 electron-updater 的那个对象；packaged 说是不是装好的应用；version 是现在的版本；
 * feed 返回更新源的配置（打包时写进 app-update.yml 的那一份）；token 找 GitHub 令牌；
 * ask(version) 问用户要不要立刻装，答应了给 true；onChange 在状态变了的时候叫一声。
 * 返回 { state(), check(), install(), start() }。state().status：
 * unavailable（开发模式）、idle、checking、current（已是最新）、downloading、ready（下好了）、no-access（带不带令牌都读不到）、error。
 */
function createUpdater({ autoUpdater, packaged, version, feed, token, ask, onChange = () => {}, timers = globalThis }) {
  let state = { status: packaged ? 'idle' : 'unavailable', current: version }
  const set = (next) => { state = { current: version, ...next }; onChange(state); return state }
  const fail = error => set(denied(error) ? { status: 'no-access' } : { status: 'error', message: String(error?.message ?? error).split('\n')[0].slice(0, 200) })

  // 新版本总是整个下：安装程序里的应用是一个 zip，没有配套的 .blockmap，按块比对着只下变了的部分做不了，也就不去试。
  autoUpdater.disableDifferentialDownload = true
  autoUpdater.on('update-not-available', () => { set({ status: 'current' }) })
  autoUpdater.on('update-available', (info) => { set({ status: 'downloading', version: info.version, percent: 0 }) })
  autoUpdater.on('download-progress', (progress) => {
    if (state.status === 'downloading') set({ ...state, percent: Math.min(99, Math.floor(progress.percent)) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    set({ status: 'ready', version: info.version })
    // 只在刚下完时问这一次；答了稍后，设置里那一行留着「安装并重启」，退出应用时也会装上。
    Promise.resolve(ask(info.version)).then((now) => { if (now) install() }, () => {})
  })
  // 查的时候出的错由 check() 接（electron-updater 先发 error 再把它抛出来），这里只接下载时的；不然令牌被拒、换成不带令牌重查之前，那一行会先闪一下「读不到」。
  autoUpdater.on('error', (error) => { if (state.status !== 'checking') fail(error) })

  /** 按 key 设好更新源查一次，没有 key 就不带令牌。每次都重设：令牌可能刚换过，electron-updater 自己不会重读。 */
  async function look(key) {
    autoUpdater.setFeedURL(key ? { ...feed(), token: key } : feed())
    await autoUpdater.checkForUpdates()
  }

  /**
   * 查一次。正在查、正在下、已经下好时不重复查。
   * 有令牌就带上（electron-updater 这时走 api.github.com）；没有就不带（读 github.com 上公开的发布页）。
   * 带的令牌被拒了（过期、填错），不带令牌再查一次。
   */
  async function check() {
    if (!packaged || ['checking', 'downloading', 'ready'].includes(state.status)) return state
    const key = await token()
    set({ status: 'checking' })
    try {
      await look(key)
    } catch (error) {
      if (key && denied(error)) await look().catch(fail)
      else fail(error)
    }
    return state
  }

  /** 装上下好的那一版并重新打开应用；没有下好的就什么都不做。 */
  function install() {
    if (state.status === 'ready') autoUpdater.quitAndInstall(true, true)
  }

  /** 开始自己定时查；返回的函数用来停。 */
  function start() {
    if (!packaged) return () => {}
    const first = timers.setTimeout(() => { void check() }, FIRST_CHECK_MS)
    const later = timers.setInterval(() => { void check() }, CHECK_EVERY_MS)
    first?.unref?.()
    later?.unref?.()
    return () => { timers.clearTimeout(first); timers.clearInterval(later) }
  }

  return { state: () => state, check, install, start }
}

/**
 * 发布新版本的地方。和 package.json 的 build.publish 一样（update.test.mjs 核对）；不在运行时去读，理由同 tray.cjs 的 APP_ID。
 */
const RELEASES = { owner: 'Anchorite-no', repo: 'dsh-zju-assistant' }
const releasesFeed = () => `https://github.com/${RELEASES.owner}/${RELEASES.repo}/releases.atom`
const releasePage = tag => `https://github.com/${RELEASES.owner}/${RELEASES.repo}/releases/tag/${encodeURIComponent(tag)}`

/** 版本号拆成三个数；不是 1.2.3（前面可以带 v）这样的给 undefined。 */
function versionParts(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(text).trim())
  return match ? match.slice(1).map(Number) : undefined
}
const newer = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false }

/**
 * 从 Release 的 Atom 订阅里挑出最新的版本：只认 v1.2.3 这样的标签，宣传片挂的那个 Release（demo-video）不算。
 * 返回 { tag, version }，一个都没有时给 undefined。
 */
function latestRelease(atom) {
  let best
  for (const [, raw] of String(atom).matchAll(/\/releases\/tag\/([^"'<>\s]+)/g)) {
    let tag
    try { tag = decodeURIComponent(raw) } catch { continue }
    const parts = versionParts(tag)
    if (parts && (!best || newer(parts, best.parts))) best = { tag, parts }
  }
  return best && { tag: best.tag, version: best.parts.join('.') }
}

/**
 * macOS 上的「检查更新」。系统的更新组件（Squirrel.Mac）只肯换上和现在这一份同一个开发者签过名的新版本，
 * 我们的 Mac 版没有 Apple 开发者证书（package.json 的 build.mac.identity 是「-」，只做了临时签名），每一版的签名都对不上，
 * 下好了也装不上。所以那里只看发布页上的最新版本号：有新的就说一声，「去下载」打开那一版的发布页，下载和替换由用户自己来。
 * 版本号读的是 Release 的 Atom 订阅（不用令牌，也不占 GitHub 接口的次数）。
 * feed() 取订阅的内容，open(url) 用系统浏览器打开网址。别的参数和 createUpdater 一样。
 * state().status 比 createUpdater 的多一个 available（有新版本，要自己去下），没有 downloading、ready 和 no-access。
 */
function createReleaseWatcher({ packaged, version, feed, open, onChange = () => {}, timers = globalThis }) {
  let state = { status: packaged ? 'idle' : 'unavailable', current: version }
  let tag
  const set = (next) => { state = { current: version, ...next }; onChange(state); return state }

  async function check() {
    if (!packaged || state.status === 'checking') return state
    set({ status: 'checking' })
    try {
      const latest = latestRelease(await feed())
      const mine = versionParts(version)
      if (latest && mine && newer(versionParts(latest.version), mine)) {
        tag = latest.tag
        return set({ status: 'available', version: latest.version })
      }
      return set({ status: 'current' })
    } catch (error) {
      return set({ status: 'error', message: String(error?.message ?? error).split('\n')[0].slice(0, 200) })
    }
  }

  /** 打开新版本的发布页；还没查到新版本时什么都不做。 */
  function install() {
    if (state.status === 'available' && tag) open(releasePage(tag))
  }

  function start() {
    if (!packaged) return () => {}
    const first = timers.setTimeout(() => { void check() }, FIRST_CHECK_MS)
    const later = timers.setInterval(() => { void check() }, CHECK_EVERY_MS)
    first?.unref?.()
    later?.unref?.()
    return () => { timers.clearTimeout(first); timers.clearInterval(later) }
  }

  return { state: () => state, check, install, start }
}

module.exports = { createReleaseWatcher, createUpdater, githubToken, latestRelease, releasesFeed, RELEASES }
