import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createUpdater, githubToken } = require('./update.cjs')

/** 假的 electron-updater：记下壳对它做了什么；reply 决定这次检查它怎么回（拿到这次的更新源）。查失败时和真的一样，先发 error 再抛出来。 */
function fakeUpdater() {
  const updater = new EventEmitter()
  updater.feeds = []
  updater.installs = []
  updater.reply = () => { updater.emit('update-not-available', {}) }
  updater.setFeedURL = (feed) => { updater.feeds.push(feed) }
  updater.checkForUpdates = async () => {
    try { await updater.reply(updater.feeds.at(-1)) } catch (error) { updater.emit('error', error); throw error }
  }
  updater.quitAndInstall = (...args) => { updater.installs.push(args) }
  return updater
}

function fixture({ packaged = true, token = 'tok', answer = false } = {}) {
  const autoUpdater = fakeUpdater(), changes = [], asked = []
  const scheduled = []
  const timers = { setTimeout: (run, ms) => { scheduled.push(['once', ms, run]); return scheduled.length }, setInterval: (run, ms) => { scheduled.push(['every', ms, run]); return scheduled.length }, clearTimeout() {}, clearInterval() {} }
  const tokens = { value: token }
  const updater = createUpdater({
    autoUpdater, packaged, version: '0.1.3', timers,
    feed: () => ({ provider: 'github', owner: 'o', repo: 'r', private: false }),
    token: async () => tokens.value,
    ask: (version) => { asked.push(version); return answer },
    onChange: (state) => { changes.push(state.status) },
  })
  return { updater, autoUpdater, changes, asked, scheduled, tokens }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

test('找 GitHub 令牌的顺序：环境变量、设置里存的、本机 GitHub CLI；都没有就是没有', async () => {
  const run = async () => ' from-cli\n'
  assert.equal(await githubToken({ env: { GH_TOKEN: ' from-env ' }, saved: () => 'from-settings', run }), 'from-env')
  assert.equal(await githubToken({ env: { GITHUB_TOKEN: 'from-env-2' }, saved: () => undefined, run }), 'from-env-2')
  assert.equal(await githubToken({ env: {}, saved: () => ' from-settings ', run }), 'from-settings')
  assert.equal(await githubToken({ env: {}, saved: () => undefined, run }), 'from-cli')
  assert.equal(await githubToken({ env: {}, saved: () => '', run: async () => { throw new Error('gh: command not found') } }), undefined)
  assert.equal(await githubToken({ env: {}, saved: () => undefined, run: async () => '\n' }), undefined)
})

test('已是最新：查一次，带着令牌设好更新源，状态回到「已是最新」', async () => {
  const f = fixture()
  assert.deepEqual(f.updater.state(), { status: 'idle', current: '0.1.3' })
  assert.deepEqual(await f.updater.check(), { status: 'current', current: '0.1.3' })
  assert.deepEqual(f.autoUpdater.feeds, [{ provider: 'github', owner: 'o', repo: 'r', private: false, token: 'tok' }])
  assert.deepEqual(f.changes, ['checking', 'current'])
})

test('没有令牌也照样查：更新源里不带令牌，查到新版本照样下', async () => {
  const f = fixture({ token: null })
  assert.deepEqual(await f.updater.check(), { status: 'current', current: '0.1.3' })
  assert.deepEqual(f.autoUpdater.feeds, [{ provider: 'github', owner: 'o', repo: 'r', private: false }])
  assert.deepEqual(f.changes, ['checking', 'current'])

  const later = fixture({ token: '' })
  later.autoUpdater.reply = () => { later.autoUpdater.emit('update-available', { version: '0.1.8' }) }
  assert.equal((await later.updater.check()).status, 'downloading')
  assert.equal('token' in later.autoUpdater.feeds[0], false)
})

test('带的令牌被拒了：不带令牌再查一次，中间不闪「读不到」', async () => {
  const f = fixture({ token: 'expired' })
  f.autoUpdater.reply = (feed) => {
    if (feed.token) throw new Error('HttpError: 401 Bad credentials')
    f.autoUpdater.emit('update-not-available', {})
  }
  assert.equal((await f.updater.check()).status, 'current')
  assert.deepEqual(f.autoUpdater.feeds.map(feed => feed.token), ['expired', undefined])
  assert.deepEqual(f.changes, ['checking', 'current'])
})

test('有新版本：自己下载、报进度，下完问一次；答应了就装上并重新打开', async () => {
  const f = fixture({ answer: true })
  f.autoUpdater.reply = () => { f.autoUpdater.emit('update-available', { version: '0.1.4' }) }
  assert.deepEqual(await f.updater.check(), { status: 'downloading', current: '0.1.3', version: '0.1.4', percent: 0 })
  // 正在下的时候再点检查，不重新来。
  await f.updater.check()
  assert.equal(f.autoUpdater.feeds.length, 1)
  f.autoUpdater.emit('download-progress', { percent: 37.6 })
  assert.equal(f.updater.state().percent, 37)
  f.autoUpdater.emit('download-progress', { percent: 100 })
  assert.equal(f.updater.state().percent, 99)
  f.autoUpdater.emit('update-downloaded', { version: '0.1.4' })
  assert.deepEqual(f.updater.state(), { status: 'ready', current: '0.1.3', version: '0.1.4' })
  await settle()
  assert.deepEqual(f.asked, ['0.1.4'])
  assert.deepEqual(f.autoUpdater.installs, [[true, true]])
})

test('答了稍后：不装，状态留在「下好了」，之后从设置里点安装才装', async () => {
  const f = fixture({ answer: false })
  f.autoUpdater.reply = () => { f.autoUpdater.emit('update-available', { version: '0.1.4' }); f.autoUpdater.emit('update-downloaded', { version: '0.1.4' }) }
  await f.updater.check()
  await settle()
  assert.deepEqual(f.autoUpdater.installs, [])
  assert.equal(f.updater.state().status, 'ready')
  await f.updater.check()
  assert.deepEqual(f.asked, ['0.1.4'])
  f.updater.install()
  assert.deepEqual(f.autoUpdater.installs, [[true, true]])
})

test('读不到和别的失败分开说：带不带令牌都被拒（比如仓库改回了私有）是「读不到」，其余带上原因；之后还能再查', async () => {
  // 没令牌、看不到仓库：不再重查，直接是读不到；填上令牌以后就能查。
  const none = fixture({ token: '' })
  none.autoUpdater.reply = (feed) => {
    if (!feed.token) throw new Error('Unable to find latest version on GitHub (https://github.com/o/r/releases/latest): HttpError: 404\nstack…')
    none.autoUpdater.emit('update-not-available', {})
  }
  assert.deepEqual(await none.updater.check(), { status: 'no-access', current: '0.1.3' })
  assert.equal(none.autoUpdater.feeds.length, 1)
  none.tokens.value = 'saved-later'
  assert.equal((await none.updater.check()).status, 'current')

  const f = fixture()
  f.autoUpdater.reply = () => { throw new Error('Unable to find latest version on GitHub (https://api.github.com/repos/o/r/releases/latest): HttpError: 404\nstack…') }
  assert.equal((await f.updater.check()).status, 'no-access')
  assert.deepEqual(f.autoUpdater.feeds.map(feed => feed.token), ['tok', undefined])
  f.autoUpdater.reply = () => { throw new Error('HttpError: 401 Bad credentials') }
  assert.equal((await f.updater.check()).status, 'no-access')
  // 别的失败（断网之类）带令牌也不重查，原样报出来。
  f.autoUpdater.feeds.length = 0
  f.autoUpdater.reply = () => { throw new Error('net::ERR_INTERNET_DISCONNECTED\n    at stack') }
  assert.deepEqual(await f.updater.check(), { status: 'error', current: '0.1.3', message: 'net::ERR_INTERNET_DISCONNECTED' })
  assert.equal(f.autoUpdater.feeds.length, 1)
  // 下载到一半出的错走 error 事件。
  f.autoUpdater.reply = () => { f.autoUpdater.emit('update-available', { version: '0.1.8' }) }
  assert.equal((await f.updater.check()).status, 'downloading')
  f.autoUpdater.emit('error', new Error('net::ERR_CONNECTION_RESET'))
  assert.deepEqual(f.updater.state(), { status: 'error', current: '0.1.3', message: 'net::ERR_CONNECTION_RESET' })
  f.autoUpdater.reply = () => { f.autoUpdater.emit('update-not-available', {}) }
  assert.equal((await f.updater.check()).status, 'current')
  // 没有下好的版本时，安装什么都不做。
  f.updater.install()
  assert.deepEqual(f.autoUpdater.installs, [])
})

test('装好的应用启动后自己查、之后定时查；开发模式不查也不定时', async () => {
  const f = fixture()
  f.updater.start()
  assert.deepEqual(f.scheduled.map(([kind, ms]) => [kind, ms]), [['once', 15_000], ['every', 6 * 60 * 60 * 1000]])
  f.scheduled[0][2]()
  await settle()
  assert.equal(f.updater.state().status, 'current')

  const dev = fixture({ packaged: false })
  assert.deepEqual(dev.updater.state(), { status: 'unavailable', current: '0.1.3' })
  dev.updater.start()
  assert.deepEqual(dev.scheduled, [])
  assert.equal((await dev.updater.check()).status, 'unavailable')
  assert.deepEqual(dev.autoUpdater.feeds, [])
})
