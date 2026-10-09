import test from 'node:test'
import assert from 'node:assert/strict'
import { ChatGpt, PROVIDER, distinctEfforts, routeProfile } from './chatgpt.mjs'

const KEY = `llm-pi-ai/${PROVIDER}`
const MODELS = [
  { id: 'gpt-a', reasoning: true, thinkingLevelMap: { xhigh: 'xhigh', minimal: 'low' } },
  { id: 'gpt-b', reasoning: true, thinkingLevelMap: { off: 'none', minimal: 'low', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' } },
  { id: 'gpt-c', reasoning: true, thinkingLevelMap: { off: null, minimal: 'low', xhigh: 'xhigh' } },
  { id: 'plain', reasoning: false },
]
/** 引擎出厂时新对话用的模型；撤掉我们写的那几项后回到它。 */
const ENGINE_DEFAULT = { provider: 'deepseek-official', model: 'deepseek-flash' }
const GPT_DEFAULT = { provider: PROVIDER, model: 'gpt-6.1-sol', reasoningEffort: 'xhigh' }

/**
 * 假的引擎服务。flow 扮演 pi-ai 的登录流程：照它的顺序先问登录方式，再告诉页面去哪，然后等浏览器跳回或人贴地址。
 * callback(code) 相当于浏览器跳回了本机；fail(error) 相当于换令牌时出错。refuse 里的配置写不进去。
 */
function engine({ flow = true, refuse = [] } = {}) {
  const records = new Map(), mutations = []
  const forms = { 'llm-deepseek': {}, 'llm-pi-ai': { providers: {} }, 'agent-default-model': { ...ENGINE_DEFAULT } }
  const providers = forms['llm-pi-ai'].providers
  let running, arrive, crash
  const authorization = {
    describe: key => flow && String(key) === KEY ? { key, label: 'OpenAI Codex', methods: [{ id: 'oauth', label: 'OpenAI (ChatGPT Plus/Pro)' }], inFlight: Boolean(running) } : undefined,
    cancel: () => { running?.abort() },
    async begin({ key, method, interaction }) {
      assert.equal(method, 'oauth')
      const controller = running = new AbortController()
      const aborted = new Promise((_resolve, reject) => { controller.signal.addEventListener('abort', () => { reject(new Error('Login cancelled')) }, { once: true }) })
      try {
        const chosen = await interaction.prompt({ kind: 'select', message: 'Select OpenAI Codex login method:', options: [{ id: 'browser', label: 'Browser login (default)' }, { id: 'device_code', label: 'Device code login (headless)' }] })
        const outside = new Promise((resolve, reject) => { arrive = resolve; crash = reject })
        if (chosen === 'device_code') {
          interaction.notify({ message: 'Enter this code on the verification page to finish signing in.', url: 'https://auth.openai.com/codex/device', code: 'ABCD-1234' })
          await Promise.race([outside, aborted])
        } else {
          interaction.notify({ message: 'A browser window should open. Complete login to finish.', url: 'https://auth.openai.com/oauth/authorize?state=s1' })
          const manual = new AbortController()
          const pasted = interaction.prompt({ kind: 'text', message: 'paste the redirect URL', signal: manual.signal })
          pasted.catch(() => {})
          try { records.set('code', await Promise.race([outside, pasted, aborted])) } finally { manual.abort() }
        }
        records.set(String(key), { kind: 'grant' })
        return { status: 'authorized' }
      } catch (error) {
        if (controller.signal.aborted) return { status: 'cancelled' }
        throw error
      } finally { running = undefined }
    },
  }
  const credentials = {
    describeRecord: async key => ({ configured: records.has(String(key)), writable: true }),
    deleteRecord: async (key) => { records.delete(String(key)) },
  }
  const settings = {
    describe: () => Object.entries(forms).map(([ns, value]) => ({ ns, value })),
    async mutate(ns, ops) {
      if (refuse.includes(ns)) throw new Error('configuration is read-only')
      mutations.push({ ns, ops })
      for (const op of ops) {
        const owner = op.path.slice(0, -1).reduce((value, name) => value[name], forms[ns]), field = op.path.at(-1)
        if (op.op === 'set') owner[field] = op.value
        // 撤掉一项后回到下一层的值：默认模型那一条下面是引擎出厂的配置。
        else if (ns === 'agent-default-model' && field in ENGINE_DEFAULT) owner[field] = ENGINE_DEFAULT[field]
        else delete owner[field]
      }
    },
  }
  const chatgpt = new ChatGpt({ authorization: () => authorization, credentials: () => credentials, settings: () => settings, models: async () => MODELS })
  return { chatgpt, records, providers, forms, mutations, callback: (code) => { arrive(code) }, fail: (error) => { crash(error) } }
}

/** 等登录流程把它的后续步骤跑完（都是已经就绪的 Promise）。 */
const settle = () => new Promise(resolve => setTimeout(resolve, 0))
const signIn = async (f) => { await f.chatgpt.login({}); await settle(); f.callback('ok'); await settle() }

test('推理强度只留分得开的几档：别名去掉，不支持的不列，关闭推理按模型表里写的发', () => {
  assert.deepEqual(distinctEfforts(MODELS[0]), { off: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' })
  assert.deepEqual(distinctEfforts(MODELS[1]), { off: 'none', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' })
  assert.deepEqual(distinctEfforts(MODELS[2]), { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' })
  assert.equal(distinctEfforts(MODELS[3]), undefined)
})

test('线路里列出自带的每个模型，再补上自带的表里还没有的 GPT-6.1 Sol；表里已经有它时不重复', () => {
  const profile = routeProfile(MODELS)
  assert.deepEqual({ ...profile, models: profile.models.length }, { displayName: 'ChatGPT', reasoning: 'medium', models: 5 })
  assert.deepEqual(profile.models.slice(0, 4), [
    { id: 'gpt-a', reasoningEfforts: distinctEfforts(MODELS[0]) },
    { id: 'gpt-b', reasoningEfforts: distinctEfforts(MODELS[1]) },
    { id: 'gpt-c', reasoningEfforts: distinctEfforts(MODELS[2]) },
    { id: 'plain' },
  ])
  assert.deepEqual(profile.models[4], {
    id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', contextWindow: 272000, maxTokens: 128000, input: ['text', 'image'],
    reasoningEfforts: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  })
  const builtIn = { id: 'gpt-6.1-sol', reasoning: true, thinkingLevelMap: { xhigh: 'xhigh' } }
  assert.deepEqual(routeProfile([builtIn]).models, [{ id: 'gpt-6.1-sol', reasoningEfforts: distinctEfforts(builtIn) }])
})

test('引擎自带的模型表：每个模型都有几档、发出去的值两两不同；写出的线路里 id 不重复，默认的那个模型在里面且支持 xhigh', async () => {
  const models = Object.values((await import('@earendil-works/pi-ai/providers/openai-codex.models')).OPENAI_CODEX_MODELS)
  assert.ok(models.length > 0)
  for (const model of models) {
    assert.equal(model.api, 'openai-codex-responses', model.id)
    const efforts = distinctEfforts(model)
    assert.ok(efforts, model.id)
    const wires = Object.entries(efforts).filter(([level]) => level !== 'off').map(([, wire]) => wire)
    assert.equal(new Set(wires).size, wires.length, model.id)
    assert.equal(efforts.medium, 'medium', model.id)
    assert.equal('minimal' in efforts, false, model.id)
  }
  const listed = routeProfile(models).models
  assert.equal(new Set(listed.map(model => model.id)).size, listed.length)
  assert.equal(listed.find(model => model.id === GPT_DEFAULT.model)?.reasoningEfforts?.xhigh, 'xhigh')
})

test('浏览器登录：页面拿到要打开的地址，浏览器跳回后算登录成功，线路写进模型设置，新对话默认用 GPT-6.1 Sol 的 xhigh', async () => {
  const f = engine()
  assert.deepEqual(await f.chatgpt.snapshot(), { available: true, status: 'signed-out' })
  const started = await f.chatgpt.login({})
  assert.equal(started.status, 'signing-in')
  await settle()
  const waiting = await f.chatgpt.snapshot()
  assert.deepEqual({ ...waiting, asking: typeof waiting.asking }, { available: true, status: 'signing-in', method: 'browser', page: 'https://auth.openai.com/oauth/authorize?state=s1', asking: 'string' })
  await assert.rejects(f.chatgpt.login({}), /正在登录/)
  f.callback('from-browser')
  await settle()
  assert.deepEqual(await f.chatgpt.snapshot(), { available: true, status: 'signed-in' })
  assert.equal(f.records.get('code'), 'from-browser')
  assert.deepEqual(f.mutations, [
    { ns: 'llm-pi-ai', ops: [{ op: 'set', path: ['providers', PROVIDER], value: routeProfile(MODELS) }] },
    { ns: 'agent-default-model', ops: [{ op: 'set', path: ['provider'], value: PROVIDER }, { op: 'set', path: ['model'], value: 'gpt-6.1-sol' }, { op: 'set', path: ['reasoningEffort'], value: 'xhigh' }] },
  ])
  assert.deepEqual(f.forms['agent-default-model'], GPT_DEFAULT)
})

test('浏览器没能跳回本机时，把跳转后的地址贴进来也能完成；空的、过期的回答不收', async () => {
  const f = engine()
  await f.chatgpt.login({ method: 'browser' })
  await settle()
  const { asking } = await f.chatgpt.snapshot()
  await assert.rejects(f.chatgpt.answer({ id: asking, value: '  ' }), /先把地址贴进来/)
  await assert.rejects(f.chatgpt.answer({ id: 'old', value: 'x' }), /已经过去/)
  await f.chatgpt.answer({ id: asking, value: ' http://localhost:1455/auth/callback?code=c1&state=s1 ' })
  await settle()
  assert.equal(f.records.get('code'), 'http://localhost:1455/auth/callback?code=c1&state=s1')
  assert.equal((await f.chatgpt.snapshot()).status, 'signed-in')
  await assert.rejects(f.chatgpt.answer({ id: asking, value: 'again' }), /已经过去/)
})

test('设备码登录：页面拿到验证页和要输入的代码', async () => {
  const f = engine()
  await f.chatgpt.login({ method: 'device' })
  await settle()
  assert.deepEqual(await f.chatgpt.snapshot(), { available: true, status: 'signing-in', method: 'device', page: 'https://auth.openai.com/codex/device', code: 'ABCD-1234' })
  f.callback()
  await settle()
  assert.equal((await f.chatgpt.snapshot()).status, 'signed-in')
})

test('取消后回到未登录，不留错误、不加线路、不动默认模型；出错时把原因带给页面，下一次登录不受影响', async () => {
  const f = engine()
  await f.chatgpt.login({})
  await settle()
  assert.deepEqual(await f.chatgpt.cancel(), { available: true, status: 'signed-out' })
  assert.deepEqual(f.mutations, [])
  await f.chatgpt.login({})
  await settle()
  f.fail(new Error('OpenAI Codex token exchange failed (403): blocked'))
  await settle()
  assert.deepEqual(await f.chatgpt.snapshot(), { available: true, status: 'signed-out', error: '登录没有完成：OpenAI Codex token exchange failed (403): blocked' })
  assert.deepEqual(f.forms['agent-default-model'], ENGINE_DEFAULT)
  await signIn(f)
  assert.deepEqual(await f.chatgpt.snapshot(), { available: true, status: 'signed-in' })
})

test('登录成功但模型设置写不进去时，说清楚是哪一步没成', async () => {
  const noRoute = engine({ refuse: ['llm-pi-ai'] })
  await signIn(noRoute)
  assert.deepEqual(await noRoute.chatgpt.snapshot(), { available: true, status: 'signed-out', error: '登录成功了，但没能把 GPT 加进模型列表：configuration is read-only' })
  assert.deepEqual(noRoute.forms['agent-default-model'], ENGINE_DEFAULT)
  const noDefault = engine({ refuse: ['agent-default-model'] })
  await signIn(noDefault)
  assert.deepEqual(await noDefault.chatgpt.snapshot(), { available: true, status: 'signed-in', error: '登录成功了，GPT 已经在模型列表里，但没能把它设成默认模型：configuration is read-only' })
})

test('退出登录把默认模型改回引擎原来的、撤掉线路、删掉令牌；在模型页里手动删了线路也算未登录', async () => {
  const f = engine()
  await signIn(f)
  const route = f.providers[PROVIDER]
  delete f.providers[PROVIDER]
  assert.equal((await f.chatgpt.snapshot()).status, 'signed-out')
  f.providers[PROVIDER] = route
  assert.equal((await f.chatgpt.snapshot()).status, 'signed-in')
  assert.deepEqual(await f.chatgpt.logout(), { available: true, status: 'signed-out' })
  assert.equal(PROVIDER in f.providers, false)
  assert.equal(f.records.has(KEY), false)
  assert.deepEqual(f.forms['agent-default-model'], ENGINE_DEFAULT)
  assert.deepEqual(f.mutations.slice(-2), [
    { ns: 'agent-default-model', ops: [{ op: 'unset', path: ['provider'] }, { op: 'unset', path: ['model'] }, { op: 'unset', path: ['reasoningEffort'] }] },
    { ns: 'llm-pi-ai', ops: [{ op: 'unset', path: ['providers', PROVIDER] }] },
  ])
})

test('登录后用户自己把默认模型换成了别的，退出登录时不动它', async () => {
  const f = engine()
  await signIn(f)
  f.forms['agent-default-model'] = { provider: 'deepseek-official', model: 'deepseek-pro', reasoningEffort: 'high' }
  await f.chatgpt.logout()
  assert.deepEqual(f.forms['agent-default-model'], { provider: 'deepseek-official', model: 'deepseek-pro', reasoningEffort: 'high' })
})

test('引擎没有这项登录时，页面读到的是「没有这项功能」，发起登录会说明原因', async () => {
  const f = engine({ flow: false })
  assert.deepEqual(await f.chatgpt.snapshot(), { available: false, status: 'signed-out' })
  await assert.rejects(f.chatgpt.login({}), /没有 ChatGPT 登录/)
  const missing = new ChatGpt({ authorization: () => undefined, credentials: () => undefined, settings: () => undefined })
  assert.deepEqual(await missing.snapshot(), { available: false, status: 'signed-out' })
})
