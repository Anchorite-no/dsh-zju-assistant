/**
 * 设置 → 模型里的「ChatGPT」：用 ChatGPT 账号登录后，模型选择器里多出 GPT。
 * 登录（OpenAI 的 OAuth，和 Codex 客户端是同一套）、令牌的保存和刷新、按 Responses 协议发请求，
 * 都是引擎里 @deepseek-ai/dsh-llm-pi-ai 的 openai-codex 线路现成的；引擎的模型页只给它留了填 API Key 的输入框，没有登录入口。
 * 这里补的是：替页面发起、取消登录，把流程里要人去的页面、要人回答的问题转给页面；
 * 登录成功后把这条线路写进模型设置（选择器里才有 GPT），并把新对话的默认模型改成 GPT；
 * 退出时把默认模型改回去、撤掉线路、删掉存着的令牌。
 */
import { credentialKey } from '@deepseek-ai/dsh-credentials'

/** pi-ai 里这条线路的名字，也是引擎模型设置里的键。 */
export const PROVIDER = 'openai-codex'
/** 引擎里 pi-ai 适配器那一条配置的 id；它存登录结果的记录也在这个名字下面。 */
const SETTINGS = 'llm-pi-ai'
const KEY = credentialKey(SETTINGS, PROVIDER)
/** 登录流程第一步会问用哪种方式，这是 pi-ai 给两个选项起的 id。 */
const METHODS = { browser: 'browser', device: 'device_code' }
/** pi-ai 的推理强度，从弱到强。 */
const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
/** 引擎里「新对话默认用哪个模型」那一条配置的 id。 */
const DEFAULT_SETTINGS = 'agent-default-model'
/** 登录了 ChatGPT 以后，新对话默认用的模型和推理强度。 */
const DEFAULT = { model: 'gpt-6.1-sol', reasoningEffort: 'xhigh' }
/**
 * ChatGPT 已经在用、但引擎自带的模型表（pi-ai 0.87.1）里还没有的模型，照 pi-ai 1.1.0 的模型表抄来。
 * 引擎升级到自带它的版本后，这里的同名条目自动不再用到，可以删掉。
 */
const NEWER_MODELS = [{
  id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', reasoning: true, input: ['text', 'image'], contextWindow: 272000, maxTokens: 128000,
  thinkingLevelMap: { off: null, minimal: 'low', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
}]

/**
 * 一个模型真正分得开的推理强度，写成引擎 reasoningEfforts 的样子：档位 → 发给接口的值。
 * pi-ai 的模型表里有的档位只是另一档的别名（GPT 的 minimal 发出去就是 low），照搬的话选择器里会多出选了没区别的一档，这里去掉。
 * 不能推理的模型返回 undefined。
 */
export function distinctEfforts(model) {
  if (!model.reasoning) return undefined
  const map = model.thinkingLevelMap ?? {}
  // 和引擎的算法一致：写成 null 的是不支持；xhigh、max 要写明了才算支持，其余几档默认支持。
  const offered = LEVELS.filter(level => map[level] !== null && (map[level] !== undefined || (level !== 'xhigh' && level !== 'max')))
  const efforts = {}
  for (const level of offered) {
    // 关闭推理没有写明发什么时留空，由 pi-ai 按接口的写法去发。
    if (level === 'off') { efforts.off = map.off ?? null; continue }
    const wire = map[level] ?? level
    if (wire !== level && offered.includes(wire)) continue
    efforts[level] = wire
  }
  return efforts
}

/**
 * 写进模型设置的这条线路：名字、线路默认的推理强度，和一张模型列表。installed 是引擎自带的这条线路的模型表。
 * 列表先是自带的那些：只写 id 和分得开的几档推理强度，别的照自带的表；再是自带的表里还没有的新模型，写全。
 * 引擎的规矩是给了列表就只认列表，所以自带的也要逐个列出来。
 */
export function routeProfile(installed) {
  const efforts = (model) => { const reasoningEfforts = distinctEfforts(model); return reasoningEfforts ? { reasoningEfforts } : {} }
  const known = new Set(installed.map(model => model.id))
  const models = [
    ...installed.map(model => ({ id: model.id, ...efforts(model) })),
    ...NEWER_MODELS.filter(model => !known.has(model.id)).map(model => ({
      id: model.id, name: model.name, contextWindow: model.contextWindow, maxTokens: model.maxTokens, input: model.input, ...efforts(model),
    })),
  ]
  return { displayName: 'ChatGPT', reasoning: 'medium', models }
}

/** pi-ai 自带的 openai-codex 模型表。读不到时给空表：线路照样能用，只是推理强度按引擎默认的列。 */
async function catalogModels() {
  try { return Object.values((await import('@earendil-works/pi-ai/providers/openai-codex.models')).OPENAI_CODEX_MODELS) } catch { return [] }
}

/**
 * authorization、credentials、settings 是取引擎这三个服务的函数（没挂载时返回 undefined）；models 返回 pi-ai 的模型表。
 * 一次只有一场登录；它只活在这个进程里，应用重开就要重新开始。
 */
export class ChatGpt {
  #authorization
  #credentials
  #settings
  #models
  #attempt
  #questions = 0

  constructor({ authorization, credentials, settings, models = catalogModels }) {
    this.#authorization = authorization
    this.#credentials = credentials
    this.#settings = settings
    this.#models = models
  }

  #services() {
    const authorization = this.#authorization(), credentials = this.#credentials(), settings = this.#settings()
    if (!authorization?.describe(KEY) || !credentials || !settings) throw new Error('这个版本的引擎没有 ChatGPT 登录。')
    return { authorization, credentials, settings }
  }

  /** 模型设置里现在有没有这条线路。 */
  #routed(settings) {
    return settings.describe({ redactSecrets: true }).find(form => form.ns === SETTINGS)?.value?.providers?.[PROVIDER] !== undefined
  }

  /**
   * 页面要画的全部状态。status：signed-out、signing-in、signed-in。
   * 登录中时 page 是要人去的页面，code 是设备码登录要在那页输入的代码，asking 是正在等人贴回来的那个问题的 id。
   * error 是上一次登录没走完的原因，已经是给人看的整句话。
   */
  async snapshot() {
    let services
    try { services = this.#services() } catch { return { available: false, status: 'signed-out' } }
    const attempt = this.#attempt
    if (attempt?.running) {
      return {
        available: true, status: 'signing-in', method: attempt.method,
        ...(attempt.page ? { page: attempt.page } : {}), ...(attempt.code ? { code: attempt.code } : {}),
        ...(attempt.question ? { asking: attempt.question.id } : {}),
      }
    }
    // 令牌在、线路也在才算登录了：在引擎的模型页里把这条线路删了，这里就回到未登录，再登一次会把线路加回来。
    const signedIn = (await services.credentials.describeRecord(KEY)).configured && this.#routed(services.settings)
    return { available: true, status: signedIn ? 'signed-in' : 'signed-out', ...(attempt?.error ? { error: attempt.error } : {}) }
  }

  /** 开始登录。method 是 browser（跳到浏览器登录，默认）或 device（在网页上输入一段代码）。不等登录结束就返回。 */
  async login(input) {
    const { authorization } = this.#services()
    if (this.#attempt?.running) throw new Error('正在登录，先完成或取消这一次。')
    const attempt = this.#attempt = { method: input?.method === 'device' ? 'device' : 'browser', running: true }
    const interaction = {
      notify: (notice) => {
        if (notice.url) attempt.page = notice.url
        if (notice.code) attempt.code = notice.code
      },
      prompt: prompt => this.#ask(attempt, prompt),
    }
    attempt.done = authorization.begin({ key: KEY, method: 'oauth', interaction }).then(
      outcome => outcome.status === 'authorized' ? this.#addRoute() : undefined,
      (error) => { throw new Error(`登录没有完成：${error instanceof Error ? error.message : String(error)}`) },
    ).catch((error) => {
      attempt.error = error.message
    }).finally(() => {
      attempt.running = false
      attempt.question = undefined
    })
    return this.snapshot()
  }

  /** 流程问的问题。选登录方式的那一问按页面选的直接答；别的（贴回跳转后的地址）留给人，等 answer。 */
  #ask(attempt, prompt) {
    if (prompt.kind === 'select') {
      const id = METHODS[attempt.method]
      if (!prompt.options.some(option => option.id === id)) return Promise.reject(new Error('引擎里的登录方式变了，这个版本的应用还不认识。'))
      return Promise.resolve(id)
    }
    return new Promise((resolve, reject) => {
      const question = attempt.question = { id: String(++this.#questions), resolve }
      // 浏览器登录时流程同时等两样：浏览器跳回本机，或者人把跳转后的地址贴过来。前一样先到，这一问就被撤回。
      prompt.signal?.addEventListener('abort', () => {
        if (attempt.question === question) attempt.question = undefined
        reject(new Error('这一问被流程撤回了。'))
      }, { once: true })
    })
  }

  /** 回答正在等的那一问：浏览器没能跳回本机时，把跳转后的地址（或其中的代码）贴进来。 */
  async answer(input) {
    const question = this.#attempt?.question
    if (!question || question.id !== input?.id) throw new Error('这一步已经过去了。')
    const value = String(input?.value ?? '').trim()
    if (!value) throw new Error('先把地址贴进来。')
    this.#attempt.question = undefined
    question.resolve(value)
    return this.snapshot()
  }

  /** 取消正在进行的登录。 */
  async cancel() {
    const attempt = this.#attempt
    if (attempt?.running) {
      this.#services().authorization.cancel(KEY)
      await attempt.done
    }
    return this.snapshot()
  }

  /**
   * 退出登录：新对话的默认模型还指着 GPT 的话先改回引擎原来的，再撤掉线路（选择器里不再有 GPT），最后删掉存着的令牌。
   * 只在本机忘掉，不通知 OpenAI。
   */
  async logout() {
    const { credentials, settings } = this.#services()
    if (this.#attempt?.running) await this.cancel()
    this.#attempt = undefined
    if (settings.describe({ redactSecrets: true }).find(form => form.ns === DEFAULT_SETTINGS)?.value?.provider === PROVIDER) {
      await settings.mutate(DEFAULT_SETTINGS, ['provider', 'model', 'reasoningEffort'].map(field => ({ op: 'unset', path: [field] })))
    }
    if (this.#routed(settings)) await settings.mutate(SETTINGS, [{ op: 'unset', path: ['providers', PROVIDER] }])
    await credentials.deleteRecord(KEY)
    return this.snapshot()
  }

  /** 登录成功后：把线路写进模型设置，再把新对话的默认模型改成 DEFAULT。已经开着的对话各用各的，不受影响。 */
  async #addRoute() {
    const { settings } = this.#services()
    try {
      await settings.mutate(SETTINGS, [{ op: 'set', path: ['providers', PROVIDER], value: routeProfile(await this.#models()) }])
    } catch (error) {
      throw new Error(`登录成功了，但没能把 GPT 加进模型列表：${error instanceof Error ? error.message : String(error)}`)
    }
    try {
      await settings.mutate(DEFAULT_SETTINGS, Object.entries({ provider: PROVIDER, ...DEFAULT }).map(([field, value]) => ({ op: 'set', path: [field], value })))
    } catch (error) {
      throw new Error(`登录成功了，GPT 已经在模型列表里，但没能把它设成默认模型：${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
