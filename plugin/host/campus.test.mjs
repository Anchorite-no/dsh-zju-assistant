import { testVault } from '../../core/zju/tests/fixtures/vault.mjs'
/**
 * 插件版自己的那几样：根服务挂上以后给的路由、工具和技能，zju 工具的写操作审批，校园命令的环境变量，
 * 公众号的浏览器桥，应用内看校园网页的地址，讲解的播放，FFmpeg 的下载，邮箱密码的存法，页面上的提醒。
 * 照 ui/profile 搬过来的各部件，各自的测试在同一个文件夹里。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { Context } from '@deepseek-ai/cordis'
import { ROWS } from '../rows.mjs'
import { coreEnv, provideCoreEnv } from './core.mjs'
import { isWrite, zjuTool } from './zju-tool.mjs'
import { WereadBridge, parseSetCookie } from './weread-bridge.mjs'
import { exportedCookie, routeUrl, wrapUrl } from './campus-page.mjs'
import { filmName, filmResponse } from './film.mjs'
import { ensureFfmpeg, ffmpegFile, missingFfmpeg } from './ffmpeg.mjs'
import { mailVault } from './mail-vault.mjs'
import { Alerts } from './alerts.mjs'

const temp = (t, name) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `zju-campus-${name}-`))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

/** 一个最小的宿主：只有根服务要的三样，记下登记了什么。 */
async function host(t, rows = []) {
  const home = temp(t, 'home'), before = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(() => { if (before === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = before })
  const ctx = new Context(), routes = new Map(), tools = new Map(), providers = []
  ctx.provide('connection', { fetch: { register: (route) => { routes.set(route.path, route); return async () => { routes.delete(route.path) } } } })
  ctx.provide('skills', { registerProvider: (provider) => { providers.push(provider); return () => {} } })
  ctx.provide('tools', { register: (tool) => { tools.set(tool.name, tool); return () => { tools.delete(tool.name) } } })
  const { default: ZjuCampus } = await import('./index.mjs')
  const fiber = ctx.plugin(ZjuCampus)
  const loaded = []
  for (const key of rows) loaded.push(ctx.plugin((await import(`./rows/${key}.mjs`)).default))
  await new Promise(resolve => setTimeout(resolve, 50))
  t.after(async () => { for (const row of loaded) await row.dispose(); await fiber.dispose() })
  const call = async (action, input = {}) => {
    const response = await routes.get('/api/zju-campus').fetch(new Request('http://dsh/api/zju-campus', { method: 'POST', body: JSON.stringify({ action, input }) }))
    const body = await response.json()
    if (body.error) throw new Error(body.error)
    return body.value
  }
  return { ctx, home, routes, tools, call, skill: async () => (await providers[0]({ invalidate() {} }).list())[0] }
}

test('根服务挂上以后：档案在 $DSH_HOME/zju-campus，一条路、一个技能，工具只有合起来的那几个；开着的行各自报到', async (t) => {
  const { home, routes, tools, call, skill } = await host(t, ['courses', 'mail'])
  assert.deepEqual([...routes.keys()].sort(), ['/api/zju-campus', '/api/zju-campus/film'])
  assert.deepEqual([...tools.keys()].sort(), ['campus_context', 'campus_mail', 'campus_mail_send', 'campus_note', 'campus_notify', 'campus_profile', 'campus_schedule', 'zju'])
  assert.ok(fs.existsSync(path.join(home, 'zju-campus', 'profile', '00-个人资料.md')))
  const status = await call('status')
  assert.deepEqual(status.rows, ['', 'courses', 'mail'])
  assert.equal(status.browser, false)
  const { content, name, invocation } = await skill()
  assert.equal(name, 'zju-campus')
  assert.equal(invocation.userInvocable, false)
  assert.match(content, /## 课程与学习/)
  assert.match(content, /## 浙大邮箱/)
  assert.doesNotMatch(content, /## 校园通知|## 微信公众号|\{\{core\}\}/)
  // 关着的行管的模块不执行，其余照常，读文档的 doc 不归哪一行。
  const env = coreEnv()
  assert.equal(env.CAMPUS_PROFILE_DIR, path.join(home, 'zju-campus', 'profile'))
  assert.equal(env.ZJU_DATA_DIR, path.join(home, 'zju-campus', 'zju'))
  const off = env.ZJU_DISABLED_MODULES.split(',')
  for (const module of ['sztz', 'tyys', 'cc98', 'notice']) assert.ok(off.includes(module), module)
  for (const module of ['zdbk', 'xuezai', 'doc', 'zjuam']) assert.ok(!off.includes(module), module)
  assert.ok(env.CAMPUS_MODEL_ENDPOINT)
  assert.ok(env.PTA_BROWSER_ENDPOINT)
  assert.equal(env.PTA_INTERACTIVE,'0')
  // 档案、账号走同一条路；关着的行的东西说清楚是哪一行关着。
  assert.equal((await call('snapshot')).memory.length, 0)
  assert.equal((await call('account-read')).values.transport, 'webvpn')
  await assert.rejects(call('wechat-read'), /「微信公众号」在插件页「ZJU All-in-One Assistant」里关着/)
})

test('zju 工具：带 --confirm 的先请用户批准，不批准就不执行；关着的行管的模块不执行', async (t) => {
  assert.equal(isWrite(['xuezai', 'homework', 'submit', '--confirm']), true)
  assert.equal(isWrite(['xuezai', 'todos']), false)
  const asked = []
  let answer = 'rejected'
  const ctx = { get: name => name === 'approval' ? { request: async (request) => { asked.push(request); return answer } } : undefined }
  const tool = zjuTool(ctx, { disabledRow: module => module === 'cc98' ? '校园社区' : '', dataDir: () => os.tmpdir() })
  const exec = { agent: {}, callId: 'call-1', signal: new AbortController().signal }
  await assert.rejects(tool.execute({ args: ['tyys', 'venue', 'book', '--venue', '风雨操场', '--confirm'] }, exec), /没有批准/)
  assert.equal(asked.length, 1)
  assert.equal(asked[0].toolName, 'zju')
  assert.match(asked[0].displayReason.zh, /tyys venue book --venue 风雨操场/)
  answer = 'unavailable'
  await assert.rejects(tool.execute({ args: ['tyys', 'venue', 'book', '--confirm'] }, exec), /没有得到批准/)
  await assert.rejects(zjuTool({ get: () => undefined }, { disabledRow: () => '' }).execute({ args: ['x', '--confirm'] }, exec), /没有能请用户批准/)
  await assert.rejects(tool.execute({ args: ['cc98', 'hot'] }, exec), /「校园社区」在插件页「ZJU All-in-One Assistant」里关着/)
  assert.equal(asked.length, 2)
})

test('zju 工具由宿主起子进程跑 core：--help 的说明从 stderr 带回来，环境照根行给的', async (t) => {
  const off = provideCoreEnv(() => ({ ZJU_DISABLED_MODULES: 'notice', CAMPUS_PROFILE_DIR: temp(t, 'profile') }))
  t.after(off)
  const tool = zjuTool({ get: () => undefined }, { disabledRow: () => '', dataDir: () => os.tmpdir() })
  const exec = { signal: new AbortController().signal }
  const help = await tool.execute({ args: ['zdbk', '--help'] }, exec)
  assert.match(help.help, /zju zdbk/)
  // core 自己也认关着的模块。
  const refused = await tool.execute({ args: ['notice', 'list'] }, exec)
  assert.equal(refused.ok, false)
  assert.match(refused.error.message, /禁用/)
})

test('各行的标题和插件页的中文标题一样，入口的子行都注入根服务', async () => {
  for (const row of ROWS) {
    const locale = JSON.parse(fs.readFileSync(new URL(row.key ? `../rows/${row.key}/locale/zh.json` : '../locale/zh.json', import.meta.url), 'utf8'))
    assert.equal(row.title, locale.meta.title, row.key)
  }
})

test('公众号的浏览器桥：cookie 存在插件自己的目录里，请求带着它直接发，新给的记回去；要窗口的几样没装内置浏览器时说清楚', async (t) => {
  const dir = temp(t, 'weread'), seen = []
  const fetchImpl = async (url, options) => {
    seen.push({ url, cookie: options.headers.cookie })
    return new Response('{"books":[]}', { status: 200, headers: [['set-cookie', 'wr_skey=new; Path=/; Domain=.weread.qq.com; Max-Age=3600'], ['set-cookie', 'other=1; Path=/']] })
  }
  const bridge = new WereadBridge({ dir, browser: () => undefined, fetchImpl })
  bridge.save([{ url: 'https://weread.qq.com/', name: 'wr_vid', value: '1', domain: 'weread.qq.com', path: '/' }, { url: 'https://weread.qq.com/', name: 'wr_skey', value: 'old', domain: 'weread.qq.com', path: '/' }])
  const response = await bridge.request({ url: 'https://weread.qq.com/web/shelf/sync', headers: {} })
  assert.equal(response.status, 200)
  assert.equal(seen[0].cookie, 'wr_vid=1; wr_skey=old')
  assert.equal(bridge.cookie('wr_skey'), 'new')
  assert.throws(() => bridge.request({ url: 'https://example.com/' }), /其他站点/)
  await assert.rejects(bridge.login({}, { interactive: false }), error => error.code === 'login_required')
  await assert.rejects(bridge.login({}, { interactive: true }), error => error.code === 'browser_missing')
  bridge.logout()
  assert.equal(bridge.cookie('wr_vid'), undefined)
  assert.deepEqual(parseSetCookie('a=b=c; Secure; HttpOnly', 'https://weread.qq.com/x'), { name: 'a', value: 'b=c', domain: 'weread.qq.com', path: '/', secure: true, httpOnly: true, url: 'https://weread.qq.com/' })
})

test('应用内看校园网页：经 WebVPN 时校内地址换成 WebVPN 形式，统一身份认证和公网可达的直连；cookie 只放 zju.edu.cn 的', () => {
  assert.equal(routeUrl('https://zdbk.zju.edu.cn/a', 'webvpn'), 'https://zdbk.zju.edu.cn/a')
  assert.equal(routeUrl('https://zjuam.zju.edu.cn/cas/login', 'webvpn'), 'https://zjuam.zju.edu.cn/cas/login')
  assert.equal(routeUrl('http://www.cs.zju.edu.cn/x?y=1', 'webvpn'), wrapUrl('http://www.cs.zju.edu.cn/x?y=1'))
  assert.match(wrapUrl('http://www.cs.zju.edu.cn/x'), /^https:\/\/webvpn\.zju\.edu\.cn\/http\/77726476706e69737468656265737421[0-9a-f]+\/x$/)
  assert.equal(routeUrl('http://www.cs.zju.edu.cn/x', 'direct'), 'http://www.cs.zju.edu.cn/x')
  assert.equal(routeUrl('https://example.com/', 'webvpn'), 'https://example.com/')
  assert.equal(routeUrl('javascript:alert(1)', 'webvpn'), undefined)
  assert.deepEqual(exportedCookie({ domain: '.zju.edu.cn', name: 'iPlanetDirectoryPro', value: 'v', secure: true, expires: 2000 }), { url: 'https://zju.edu.cn/', name: 'iPlanetDirectoryPro', value: 'v', path: '/', secure: true, domain: 'zju.edu.cn', expirationDate: 2 })
  assert.equal(exportedCookie({ domain: 'example.com', name: 'a', value: 'b' }), undefined)
})

test('讲解只认讲解目录 dist 里的 .html 文件名，页面带着 CSP 沙箱，不能联网', async (t) => {
  const root = temp(t, 'films')
  fs.mkdirSync(path.join(root, 'dist'))
  fs.writeFileSync(path.join(root, 'dist', '第一讲.html'), '<script>1</script>')
  assert.equal(filmName('第一讲.html'), '第一讲.html')
  for (const bad of ['../x.html', 'a/b.html', 'x.js', '']) assert.equal(filmName(bad), '')
  const ok = filmResponse(new Request(`http://dsh/api/zju-campus/film?name=${encodeURIComponent('第一讲.html')}`), root)
  assert.equal(ok.status, 200)
  assert.equal(await ok.text(), '<script>1</script>')
  const policy = ok.headers.get('content-security-policy')
  assert.match(policy, /^sandbox allow-scripts/)
  assert.doesNotMatch(policy, /allow-same-origin/)
  assert.match(policy, /connect-src 'none'/)
  assert.equal(filmResponse(new Request('http://dsh/api/zju-campus/film?name=..%2Fx.html'), root).status, 400)
  assert.equal(filmResponse(new Request('http://dsh/api/zju-campus/film?name=no.html'), root).status, 404)
})

test('FFmpeg 第一次用时下载，核对 SHA-256，放到 ZJU Core 会找的位置；对不上的不用', async (t) => {
  const dir = temp(t, 'ffmpeg'), binary = Buffer.from('fake ffmpeg'), packed = gzipSync(binary)
  const digest = createHash('sha256').update(packed).digest('hex')
  await assert.rejects(ensureFfmpeg(dir, { platform: 'win32', arch: 'x64', fetchImpl: async () => new Response(packed) }), /不一样/)
  assert.equal(fs.existsSync(ffmpegFile(dir, 'win32')), false)
  await assert.rejects(ensureFfmpeg(dir, { platform: 'sunos', arch: 'x64', fetchImpl: async () => new Response(packed) }), /FFMPEG_PATH/)
  // 已经在的不再下载。
  fs.mkdirSync(path.dirname(ffmpegFile(dir, 'win32')), { recursive: true })
  fs.writeFileSync(ffmpegFile(dir, 'win32'), binary)
  assert.equal(await ensureFfmpeg(dir, { platform: 'win32', arch: 'x64', fetchImpl: async () => { throw new Error('不该下载') } }), ffmpegFile(dir, 'win32'))
  assert.ok(digest)
  assert.equal(missingFfmpeg({ ok: false, error: { code: 'DEPENDENCY_MISSING', message: '音频提取 / HLS 封装需要 FFmpeg' } }), true)
  assert.equal(missingFfmpeg({ ok: false, error: { code: 'DEPENDENCY_MISSING', message: '找不到语音识别运行库' } }), false)
})

test('邮箱专用密码存在 dsh 的凭据服务里，mail.json 只记一个标记；断开时删掉', async () => {
  const records = new Map()
  const credentials = {
    modifyRecord: async (key, mutate) => { const next = await mutate(records.get(key)); records.set(key, next); return next },
    readRecord: async key => records.get(key),
    deleteRecord: async (key) => { records.delete(key) },
  }
  const vault = mailVault(() => credentials, testVault)
  const mark = await vault.seal('abcdefghijklmnop')
  assert.equal(mark, 'credentials:dsh-zju-campus/mail')
  assert.ok(!JSON.stringify(records.get('dsh-zju-campus/mail')).includes('abcdefghijklmnop'))
  assert.equal(records.get('dsh-zju-campus/mail').payload.sealed.version, 1)
  assert.equal(await vault.open(mark), 'abcdefghijklmnop')
  await assert.rejects(vault.open('ciphertext-from-desktop'), /重新连接/)
  await vault.forget()
  await assert.rejects(vault.open(mark), /重新连接/)
  await assert.rejects(mailVault(() => undefined).seal('x'), /凭据服务/)
})

test('页面上的提醒：按编号取新的，只留最近的几十条', () => {
  const alerts = new Alerts({ now: () => Date.parse('2026-11-02T08:00:00Z') })
  assert.throws(() => alerts.push({ text: '没有标题' }), /标题/)
  const first = alerts.push({ title: 'CC98 有新消息', text: '老王回复了你', panel: 'affairs:personal' })
  alerts.push({ title: '成绩出了', text: '数学分析', sessionId: 's1' })
  assert.deepEqual(alerts.since({ after: first.id }).alerts.map(alert => alert.title), ['成绩出了'])
  for (let index = 0; index < 60; index++) alerts.push({ title: `第 ${index} 条` })
  const { alerts: kept, latest } = alerts.since()
  assert.equal(kept.length, 50)
  assert.equal(latest, 62)
})
