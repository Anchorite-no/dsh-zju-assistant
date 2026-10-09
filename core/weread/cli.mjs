/** Task-oriented entry; the desktop host supplies its authenticated local bridge. */
const args = process.argv.slice(2), object = args.shift(), action = args.shift()
const known = new Set(['account.status', 'account.connect', 'publisher.list', 'publisher.search', 'publisher.subscribe', 'article.list', 'article.read', 'verification.open', 'verification.status', 'verification.prepare', 'verification.recognize', 'verification.submit', 'verification.solve'])
const options = {}
try {
  for (let i = 0; i < args.length; i += 2) {
    if(args[i] === '--confirm'){options.confirm=true;i--;continue}
    if (!['--account', '--query', '--title', '--url', '--limit', '--since', '--task', '--capture', '--selected'].includes(args[i]) || args[i + 1] === undefined) throw new Error('无效的参数')
    options[args[i].slice(2)] = args[i] === '--limit' ? Number(args[i + 1]) : args[i] === '--selected' ? args[i+1].split(',').map(Number) : args[i + 1]
  }
  const operation = `${object}.${action}`
  if (!known.has(operation)) throw new Error('用法：account status/connect；publisher list/search/subscribe；article list/read；verification open/status')
  if (process.env.CAMPUS_WECHAT_DISABLED === '1') throw new Error('微信公众号插件已关闭')
  const base = process.env.CAMPUS_WEREAD_BRIDGE_URL, token = process.env.CAMPUS_WEREAD_BRIDGE_TOKEN
  if (!base || !token || new URL(base).hostname !== '127.0.0.1') throw new Error('请在校园智能体内调用；登录与验证由应用的微信读书连接窗口管理。')
  const response = await fetch(base, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: operation, input: options }), signal: AbortSignal.timeout(120000) })
  const result = await response.json()
  console.log(JSON.stringify(result)); process.exitCode = result.ok ? 0 : 1
} catch (error) { console.log(JSON.stringify({ ok: false, status: 'unavailable', message: error instanceof Error && error.message.length < 300 ? error.message : '微信读书接口暂不可用' })); process.exitCode = 1 }
