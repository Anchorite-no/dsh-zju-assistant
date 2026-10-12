/**
 * 微信公众号插件用的浏览器。weread 技能（core/weread）读文章正文、登录微信读书、过验证码都要一个真的浏览器：
 * 它独立运行时自己带一个 Electron，在应用里用应用的。这里把技能的浏览器能力（core/weread/lib/browser/service.cjs）装进主进程，
 * 再开一条管道，地址经 WEREAD_BROWSER_ENDPOINT 交给引擎；引擎里跑的技能命令（应用自己定时检查的、助手调用的）看到它就连过来。
 * 所以验证和登录的窗口挂在主窗口下面，登录状态在应用的数据目录里，几条命令同时来也只是排队。
 * 技能的数据目录（里面是跟踪名单 tracked.json）也在这里定，经 WEREAD_DATA_DIR 交出去，和技能独立使用时的那一份分开。
 * 管道和登录状态的文件一样，只有这台电脑上同一个用户的程序够得着。
 */
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const PLUGIN = 'campus.wechat'
/** 验证码交给哪个模型认。默认是 DeepSeek 的接口，和对话用同一个 Key。 */
const VISION = { endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash', thinking: 'enabled', reasoningEffort: 'high', responseFormat: 'json_object', audioInput: false }

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return undefined }
}

/**
 * 给技能的识别模型配置；给不出来时是 undefined，验证窗口里就等用户自己完成。
 * 详情页的「自动完成验证」关着（档案目录的 wechat.json，ui/profile/wechat.mjs 写的）或者密钥文件里没有 Key 时给不出来。
 * 想换一家识别服务：密钥文件的 refs 里加 WEREAD_VISION_API_KEY，接口和模型用环境变量 WEREAD_VISION_ENDPOINT、WEREAD_VISION_MODEL 指定。
 */
function visionConfig({ profileDir, keysFile, env = process.env }) {
  if (readJson(path.join(profileDir, 'wechat.json'))?.autoVerify === false) return undefined
  let refs
  try { refs = require('js-yaml').load(fs.readFileSync(keysFile, 'utf8'))?.refs } catch { /* 还没有密钥文件 */ }
  const apiKey = refs?.WEREAD_VISION_API_KEY || refs?.DEEPSEEK_API_KEY
  if (typeof apiKey !== 'string' || !apiKey) return undefined
  return { ...VISION, ...(env.WEREAD_VISION_ENDPOINT ? { endpoint: env.WEREAD_VISION_ENDPOINT } : {}), ...(env.WEREAD_VISION_MODEL ? { model: env.WEREAD_VISION_MODEL } : {}), apiKey }
}

/**
 * coreRoot 是应用的 core 文件夹，dataDir 是技能的数据目录，profileDir 是档案目录（插件开关和这个插件的两个选择都在里面），
 * keysFile 是密钥文件。返回要交给引擎进程的环境变量，和退出时用的 close。
 */
async function createWereadBridge({ BrowserWindow, ipcMain, session, parent, coreRoot, dataDir, profileDir, keysFile }) {
  const { createBrowserService } = require(path.join(coreRoot, 'weread', 'lib', 'browser', 'service.cjs'))
  const service = await createBrowserService({
    BrowserWindow, ipcMain, parent, title: '微信公众号',
    // 沿用以前登录微信读书的那个会话，升级上来不用重新扫码。
    session: session.fromPartition('persist:campus-weread'),
    // 用应用自己的模型配置，不管命令那边带了什么：Key 不用进命令的环境。
    vision: () => visionConfig({ profileDir, keysFile }),
    // 插件在「插件」页关着时什么都不做。它默认关着：plugins.json 的 enabled 里有它才算开（ui/profile/plugins.mjs）。
    // 开关每次现读，改了马上生效。
    guard: () => {
      if (!readJson(path.join(profileDir, 'plugins.json'))?.enabled?.includes(PLUGIN)) throw Object.assign(new Error('微信公众号插件已关闭，请先在「插件」页打开。'), { code: 'plugin_disabled' })
    },
  })
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\campus-weread-${randomUUID()}` : path.join(os.tmpdir(), `campus-weread-${randomUUID()}.sock`)
  const sockets = new Set()
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.once('close', () => { sockets.delete(socket) })
    service.serve(socket)
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(endpoint, resolve) })
  return {
    env: { WEREAD_BROWSER_ENDPOINT: endpoint, WEREAD_DATA_DIR: dataDir },
    close() {
      server.close()
      for (const socket of sockets) socket.destroy()
      service.dispose()
    },
  }
}

module.exports = { createWereadBridge, visionConfig }
