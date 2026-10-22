/**
 * 起一个隔离实例：用 stage.mjs 搭好的副本、自己的数据目录（不是 %APPDATA%\CampusAgent）、
 * 自己的「文档」「下载」位置，模型请求指到本机的假模型服务，开着调试端口给截图脚本连。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { Cdp, waitForPage } from './cdp.mjs'
import { DEMO_ROOT, REPO, STAGE } from './stage.mjs'

export const DATA = path.join(DEMO_ROOT, 'data')
export const DOCS = path.join(DEMO_ROOT, 'docs')
export const DOWNLOADS = path.join(DEMO_ROOT, 'downloads')

/** 清掉上一次的数据目录。 */
export function resetData() {
  for (const dir of [DATA, DOCS, DOWNLOADS]) { rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }) }
}

export async function launch({ modelUrl, port = 9333, log = false, env: extra = {} } = {}) {
  const electron = createRequire(path.join(REPO, 'package.json'))('electron')
  const env = { ...process.env }
  delete env.CAMPUS_AGENT_DATA_DIR
  delete env.ELECTRON_RUN_AS_NODE
  Object.assign(env, {
    CAMPUS_CHATS_DIR: DOCS, CAMPUS_DOWNLOADS_DIR: DOWNLOADS,
    ...(modelUrl ? { DEEPSEEK_BASE_URL: modelUrl } : {}),
    ...extra,
  })
  const child = spawn(electron, [STAGE, `--campus-data-dir=${DATA}`, `--remote-debugging-port=${port}`, '--force-device-scale-factor=1',
    // 窗口被别的窗口挡住时 Chromium 默认不再画它，截图会一直等；这几个开关让它照常画。
    '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'], {
    cwd: STAGE, env, stdio: ['ignore', log ? 'inherit' : 'ignore', log ? 'inherit' : 'ignore'],
  })
  const page = await waitForPage(port, target => target.url.startsWith('http://127.0.0.1'), 90_000)
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl)
  // 壳在等第一次 loadURL 完成；这时候重载会让它报错退出，所以等页面完全起来再交出去。
  const until = Date.now() + 90_000
  for (;;) {
    try { if (await cdp.eval(`document.readyState === 'complete' && document.body.innerText.includes('校园事务')`)) break } catch { /* 还在加载 */ }
    if (Date.now() > until) throw new Error('隔离实例的页面一直没起来')
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  await new Promise(resolve => setTimeout(resolve, 1000))
  return {
    child, cdp, port, url: page.url,
    async close() {
      try { cdp.close() } catch { /* 已经断了 */ }
      child.kill()
      await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve) })
    },
  }
}
