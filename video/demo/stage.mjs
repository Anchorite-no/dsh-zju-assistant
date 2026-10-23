/**
 * 搭一份隔离的应用副本（stage），给演示截图用。不改仓库里的应用代码：
 *   desktop/、ui/、package.json、app.patch.yml  照当前仓库拷一份（ui/ 在副本里重新打包）
 *   node_modules                                  链到仓库的那一份（目录联接）
 *   core/                                         大部分链回仓库；zju、dingtalk、wechat 三个的 scripts/ 换成 demo/ 里 fake-* 的假脚本，
 *                                                 助手在对话里跑的校园命令读的都是编好的数据，碰不到真实账号
 *   api-keys.local.yaml                           假 Key；模型请求经 DEEPSEEK_BASE_URL 去本机的假模型服务
 * 用法：node stage.mjs [目标目录]，默认仓库旁边的 CampusAgentDemo\app（D:\CampusAgentDemo\app）。每次整份重搭，仓库改了再跑一次就跟上。
 * 不放在 %LOCALAPPDATA% 下：对话里跑命令的沙箱读不到那里，假 core 会跑不起来。
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, copyFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const REPO = path.resolve(here, '..', '..')
export const DEMO_ROOT = process.env.CAMPUS_DEMO_ROOT || path.join(REPO, '..', 'CampusAgentDemo')
export const STAGE = path.join(DEMO_ROOT, 'app')

/** 这几个 core 模块的 scripts/ 换成假的：助手跑它们时只读编好的数据。 */
const FAKE_SCRIPTS = {
  zju: { 'zju.ts': 'fake-zju.ts' },
  dingtalk: { 'dingtalk.mjs': 'fake-chat.mjs', 'dingtalk.ts': 'fake-chat.mjs' },
  wechat: { 'wechat.mjs': 'fake-chat.mjs' },
}

const link = (target, at) => symlinkSync(target, at, 'junction')

function copyTree(from, to, skip = () => false) {
  cpSync(from, to, { recursive: true, filter: source => !skip(source) })
}

export function stage(target = STAGE) {
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  for (const file of ['package.json', 'app.patch.yml']) copyFileSync(path.join(REPO, file), path.join(target, file))
  copyTree(path.join(REPO, 'desktop'), path.join(target, 'desktop'), source => source.endsWith('.test.mjs'))
  // 副本里的主窗口和讲解窗口改成离屏渲染：窗口被挡住、最小化或者屏幕熄了，Chromium 就不再出画面，截图会一直等。
  // 只改副本，仓库里的 desktop/ 不动；CAMPUS_DEMO_OFFSCREEN=0 时照原样。
  if (process.env.CAMPUS_DEMO_OFFSCREEN !== '0') {
    for (const file of ['main.cjs', 'film.cjs']) {
      const at = path.join(target, 'desktop', file)
      const source = readFileSync(at, 'utf8')
      const patched = source.replace(/webPreferences: \{/, 'webPreferences: { offscreen: true,')
      if (patched === source) throw new Error(`副本的 desktop/${file} 里找不到 webPreferences，离屏渲染没改上`)
      writeFileSync(at, patched)
    }
  }
  copyTree(path.join(REPO, 'ui'), path.join(target, 'ui'), source => source.includes(`${path.sep}lib${path.sep}`) || source.endsWith('.test.mjs'))
  link(path.join(REPO, 'node_modules'), path.join(target, 'node_modules'))
  // 假的 Key：不读仓库里的真 Key。模型地址由启动时的 DEEPSEEK_BASE_URL 指到本机。
  writeFileSync(path.join(target, 'api-keys.local.yaml'), "version: 1\nrefs:\n  DEEPSEEK_API_KEY: 'demo-not-a-real-key'\n")

  const core = path.join(target, 'core')
  mkdirSync(core)
  for (const entry of readdirSync(path.join(REPO, 'core'), { withFileTypes: true })) {
    const from = path.join(REPO, 'core', entry.name), to = path.join(core, entry.name)
    if (!entry.isDirectory()) { copyFileSync(from, to); continue }
    const fakes = FAKE_SCRIPTS[entry.name]
    if (!fakes) { link(from, to); continue }
    mkdirSync(to)
    for (const child of readdirSync(from, { withFileTypes: true })) {
      const source = path.join(from, child.name), dest = path.join(to, child.name)
      if (child.name === 'scripts') {
        mkdirSync(dest)
        for (const [name, fake] of Object.entries(fakes)) copyFileSync(path.join(here, fake), path.join(dest, name))
      } else if (child.isDirectory()) link(source, dest)
      else copyFileSync(source, dest)
    }
  }

  // 在副本里打包界面：lib/client.js 落在副本的 ui/lib 里。
  const built = spawnSync(process.execPath, [path.join(target, 'ui', 'build.mjs')], { cwd: target, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
  if (built.status !== 0) throw new Error(`界面打包失败：\n${built.stdout}\n${built.stderr}`)
  if (!existsSync(path.join(target, 'ui', 'lib', 'client.js'))) throw new Error('界面打包没有产出 ui/lib/client.js')
  return target
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = stage(process.argv[2] ? path.resolve(process.argv[2]) : STAGE)
  console.log(`stage: ${target} (${(statSync(path.join(target, 'ui', 'lib', 'client.js')).size / 1024).toFixed(0)} KB client)`)
}
