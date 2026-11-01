/** Run against an unpacked Windows app or a macOS .app outside the source tree, with fresh data and no developer PATH. */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { fork, spawn, spawnSync } = require('node:child_process')
const { nodeEnv, nodeExecutable } = require('../desktop/node.cjs')
const { checkRuntimeDependencies } = require('./runtime-deps.cjs')

/**
 * 照用户双击那样起桌面程序（不带 ELECTRON_RUN_AS_NODE），数据目录另放；调试端口让系统挑，从数据目录的 DevToolsActivePort 读。
 * 窗口里出现引擎地址的页面就算起来了。主进程报错时 Electron 弹一个对话框、进程不退，所以靠超时判断，最后连同对话框一起结束。
 * 会在屏幕上开出一个窗口，几秒后关掉。
 */
async function desktopStarts(executable, dir, baseEnv) {
  const env = { ...baseEnv }
  delete env.ELECTRON_RUN_AS_NODE
  env.CAMPUS_DOWNLOADS_DIR = path.join(dir, 'downloads')
  // macOS 上单开一个进程组，最后连同引擎一起结束。
  const child = spawn(executable, [`--campus-data-dir=${dir}`, '--remote-debugging-port=0'], { env, windowsHide: true, stdio: 'ignore', detached: process.platform !== 'win32' })
  try {
    const until = Date.now() + 60_000
    for (;;) {
      if (child.exitCode !== null) throw new Error(`桌面程序退出 ${child.exitCode}`)
      if (Date.now() > until) throw new Error('桌面程序 60 秒内没有加载出应用的页面（主进程可能报错了）')
      try {
        const port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim()
        const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) })).json()
        if (pages.some(page => page.type === 'page' && /^http:\/\/127\.0\.0\.1:\d+\//.test(page.url))) return
      } catch { /* 端口还没开 */ }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  } finally {
    // 结束整棵进程树：引擎、渲染进程和可能弹出来的报错框。
    if (child.exitCode === null) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
      else {
        try { process.kill(-child.pid, 'SIGTERM') } catch { /* 已经退了 */ }
        await new Promise(resolve => { const timer = setTimeout(resolve, 5000); child.once('exit', () => { clearTimeout(timer); resolve() }) })
        try { process.kill(-child.pid, 'SIGKILL') } catch { /* 已经退了 */ }
      }
    }
  }
}

/**
 * 给的成品在哪：Windows 是 win-unpacked 文件夹，macOS 是 CampusAgent.app。返回应用的文件夹和双击时跑的那个程序。
 */
function layout(directory) {
  if (process.platform === 'darwin') return { root: path.join(directory, 'Contents', 'Resources', 'app'), executable: path.join(directory, 'Contents', 'MacOS', 'CampusAgent') }
  return { root: path.join(directory, 'resources', 'app'), executable: path.join(directory, 'CampusAgent.exe') }
}

/** 一份干净的环境：只有系统自己的东西，PATH 里没有 Node、Python 和 npm，数据都在 data 里。 */
function cleanEnv(data) {
  const own = { DSH_HOME: path.join(data, 'home'), CAMPUS_PROFILE_DIR: path.join(data, 'profile'), CAMPUS_KEYS_DIR: data, CAMPUS_CHATS_DIR: path.join(data, 'documents'), DSH_TELEMETRY_DISABLED: '1' }
  if (process.platform === 'darwin') {
    // 和从访达打开时一样的 PATH。TMPDIR 照旧：套接字文件放在那里（desktop/host.mjs）。
    const kept = Object.fromEntries(['TMPDIR', 'USER', 'LOGNAME', 'LANG'].filter(k => process.env[k]).map(k => [k, process.env[k]]))
    return { ...kept, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: data, ...own }
  }
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'SystemDrive', 'TEMP', 'TMP', 'COMSPEC', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS', 'PATHEXT'].filter(k => process.env[k]).map(k => [k, process.env[k]]))
  return { ...env, PATH: `${process.env.SystemRoot}/System32;${process.env.SystemRoot}/System32/WindowsPowerShell/v1.0`, ProgramFiles: path.join(data, 'empty'),
    APPDATA: path.join(data, 'roaming'), LOCALAPPDATA: path.join(data, 'local'), USERPROFILE: data, HOME: data, ...own }
}

async function main() {
  if (!['win32', 'darwin'].includes(process.platform) || !process.argv[2]) throw new Error('用法：node scripts/smoke-packaged.cjs <项目目录以外的 win-unpacked 或 CampusAgent.app>')
  const directory = fs.realpathSync.native(process.argv[2]), project = fs.realpathSync.native(path.join(__dirname, '..'))
  if (directory.toLowerCase().startsWith(project.toLowerCase() + path.sep)) throw new Error('先把成品复制到项目目录之外，避免借用开发依赖。')
  const { root, executable } = layout(directory)
  checkRuntimeDependencies(root)
  const runtime = nodeExecutable(root)
  const tempRoot = fs.realpathSync.native(os.tmpdir())
  const data = fs.mkdtempSync(path.join(tempRoot, 'campus-smoke-'))
  const env = cleanEnv(data)
  Object.assign(env, nodeEnv({ dir: path.join(data, 'bin'), execPath: runtime, env, exists: () => false }))
  let child, logs = ''
  try {
    for (const file of ['core/zju/scripts/zju.ts', 'core/weread/scripts/weread.ts']) {
      const run = spawnSync(runtime, [path.join(root, file), '--help'], { cwd: data, env, windowsHide: true, encoding: 'utf8', timeout: 30_000 })
      if (run.status !== 0) throw new Error(`${file} failed: ${run.stderr}`)
      console.log('PASS', file)
    }
    const url = await new Promise((resolve, reject) => {
      child = fork(path.join(root, 'desktop/host.mjs'), [], { execPath: runtime, cwd: data, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
      const timer = setTimeout(() => reject(new Error('引擎启动超时')), 30_000)
      child.stdout.on('data', c => { logs = (logs + c).slice(-8000) })
      child.stderr.on('data', c => { logs = (logs + c).slice(-8000) })
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`引擎退出 ${code}`)) })
      child.on('message', m => {
        if (m?.type === 'ready') { clearTimeout(timer); resolve(m.url) }
        if (m?.type === 'fatal') { clearTimeout(timer); reject(new Error(m.message)) }
      })
    })
    const exchange = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
    const cookie = exchange.headers.get('set-cookie')?.split(';')[0]
    if (!cookie) throw new Error('网页认证未建立')
    const page = await fetch(new URL('/', url), { headers: { cookie }, signal: AbortSignal.timeout(10_000) })
    if (page.status !== 200) throw new Error(`网页 HTTP ${page.status}`)
    const settings = await fetch(new URL('/api/campus/profile', url), { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'tts-read' }), signal: AbortSignal.timeout(10_000) })
    const { value, error } = await settings.json()
    if (!settings.ok || error || value.installed || value.enabled || value.running) throw new Error('新用户配音默认状态不正确')
    console.log('PASS engine, authenticated page, optional TTS stays uninstalled and stopped; no system Node/Python/npm on PATH')
    // 上面只起了引擎。主进程（desktop/main.cjs）在成品里另有一套环境：package.json 没有 build 那一段、app.isPackaged 是真的，
    // 0.1.7 第一次打出来就是主进程一启动就报错，引擎这几项全过。所以再把整个桌面程序起一次，等到窗口加载出应用的页面。
    await desktopStarts(executable, path.join(data, 'desktop'), env)
    console.log('PASS desktop main process opens the window and loads the app page')
  } catch (error) {
    // Do not print the launch URL token from the engine's logs.
    console.error(logs.replace(/([?&]token=)[^\s]+/g, '$1[redacted]'))
    throw error
  } finally {
    if (child && child.exitCode === null) await new Promise(resolve => {
      const timer = setTimeout(() => { child.kill() }, 5000)
      child.once('close', () => { clearTimeout(timer); resolve() })
      if (child.connected) child.send({ type: 'shutdown' }); else child.kill()
    })
    const absolute = path.resolve(data)
    if (absolute.startsWith(tempRoot + path.sep) && path.basename(absolute).startsWith('campus-smoke-')) {
      try { fs.rmSync(absolute, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }) }
      catch (error) { console.warn(`临时目录未能清理（${error.code}）：${absolute}`) }
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
