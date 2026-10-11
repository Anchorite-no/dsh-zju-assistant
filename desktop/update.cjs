/**
 * 检查更新：有新版本自己下载，下完问要不要立刻装，装完应用自己重新打开。设置 → 通用设置里有一行，能手动查，也看得到下到哪了。
 * 新版本取自 GitHub 上这个项目的 Release（electron-updater）。仓库是私有的，用的人都是它的协作者，
 * 所以每个人用自己的 GitHub 身份去读：环境变量、设置里存的令牌、本机 GitHub CLI 的登录，按这个顺序找（githubToken）。
 * 只有装好的应用才查，开发时（npm start）不查。
 */

/** 启动后多久查第一次，之后隔多久再查。 */
const FIRST_CHECK_MS = 15_000
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

/**
 * 能读这个仓库的 GitHub 令牌。env 是环境变量，saved 返回设置里存的那个，run 执行一条命令并返回它的输出。
 * 都没有时给 undefined。
 */
async function githubToken({ env, saved, run }) {
  const fromEnv = (env.GH_TOKEN || env.GITHUB_TOKEN || '').trim()
  if (fromEnv) return fromEnv
  const stored = (saved() || '').trim()
  if (stored) return stored
  try { return (await run('gh', ['auth', 'token'])).trim() || undefined } catch { return undefined }
}

/** 这次失败是不是因为没有权限：令牌不对，或者这个身份看不到这个仓库（私有仓库对外人回 404）。 */
const denied = error => /\b(401|403|404)\b|Bad credentials/.test(String(error?.message ?? error))

/**
 * autoUpdater 是 electron-updater 的那个对象；packaged 说是不是装好的应用；version 是现在的版本；
 * feed 返回更新源的配置（打包时写进 app-update.yml 的那一份）；token 找 GitHub 令牌；
 * ask(version) 问用户要不要立刻装，答应了给 true；onChange 在状态变了的时候叫一声。
 * 返回 { state(), check(), install(), start() }。state().status：
 * unavailable（开发模式）、idle、checking、current（已是最新）、downloading、ready（下好了）、no-access（没有权限）、error。
 */
function createUpdater({ autoUpdater, packaged, version, feed, token, ask, onChange = () => {}, timers = globalThis }) {
  let state = { status: packaged ? 'idle' : 'unavailable', current: version }
  const set = (next) => { state = { current: version, ...next }; onChange(state); return state }
  const fail = error => set(denied(error) ? { status: 'no-access' } : { status: 'error', message: String(error?.message ?? error).split('\n')[0].slice(0, 200) })

  // 新版本总是整个下：安装程序里的应用是一个 zip（装得快，见 README「命令」），没有配套的 .blockmap，按块比对着只下变了的部分做不了，也就不去试。
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
  autoUpdater.on('error', fail)

  /** 查一次。正在查、正在下、已经下好时不重复查。 */
  async function check() {
    if (!packaged || ['checking', 'downloading', 'ready'].includes(state.status)) return state
    const key = await token()
    if (!key) return set({ status: 'no-access' })
    set({ status: 'checking' })
    try {
      // 每次都重设更新源：令牌可能刚换过，electron-updater 自己不会重读。
      autoUpdater.setFeedURL({ ...feed(), token: key })
      await autoUpdater.checkForUpdates()
    } catch (error) { fail(error) }
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

module.exports = { createUpdater, githubToken }
