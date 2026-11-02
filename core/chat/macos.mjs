// Local CLI adapters extracted from todohub's source-adapter design.
// No database keys, decryption, todo store, LLM calls or remote APIs live here.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fail, contains, resolve, page, after } from './common.mjs'
import { parseContent, textContent, messageTypes } from '../wechat/lib/content.mjs'

import { messageType as dingtalkType, MESSAGE_TYPES as dingtalkTypes } from '../dingtalk/lib/content.ts'
const TOOLS = { wechat: 'wxlocal', dingtalk: 'dtlocal' }
const MAX_ROWS = 50_000
const badSchema = () => fail('schema_unsupported', '本地读取工具返回了不兼容的数据；没有推进同步进度。')
const list = (data, field) => Array.isArray(data?.[field]) ? data[field] : badSchema()
const id = value => typeof value === 'string' && value ? value : Number.isSafeInteger(value) ? String(value) : badSchema()
const date = value => {
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) badSchema()
  return new Date(ms).toISOString()
}
const incomplete = () => fail('local_history_incomplete', '本地记录不完整或超过单次 5 万条安全上限；没有推进同步进度。请检查读取工具及密钥覆盖。')

/** Finder-launched apps do not inherit shell startup PATH. Never invoke a shell. */
export function executable(platform, env = process.env, home = os.homedir()) {
  const tool = TOOLS[platform]
  if (!tool) fail('unsupported_platform', '未知聊天平台。')
  const override = env[platform === 'wechat' ? 'CAMPUS_WXLOCAL' : 'CAMPUS_DTLOCAL']
  if (override) {
    if (!path.isAbsolute(override)) fail('invalid_input', '本地读取工具路径必须为绝对路径。')
    return override
  }
  const local = path.join(home, '.local', 'bin', tool)
  return fs.existsSync(local) ? local : tool
}

/** Bounded JSON-only subprocess. Raw output/errors may contain personal data: never echo them. */
export function localJson(platform, args, { env = process.env, timeoutMs = 120_000 } = {}) {
  const command = executable(platform, env)
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      detached: true, stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...env, PATH: [path.join(os.homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin', env.PATH || '/usr/bin:/bin'].join(':') }
    })
    let output = '', size = 0, settled = false
    const kill = () => { try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') } }
    const done = (status, message, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      process.removeListener('SIGTERM', stop)
      process.removeListener('SIGINT', stop)
      if (status) {
        try { fail(status, message) } catch (error) { reject(error) }
      } else resolvePromise(result)
    }
    const stop = () => { kill(); done('local_reader_stopped', '本地读取已停止。') }
    const timer = setTimeout(() => { kill(); done('local_reader_timeout', '本地读取超时，请检查工具后重试。') }, timeoutMs)
    process.once('SIGTERM', stop)
    process.once('SIGINT', stop)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      size += Buffer.byteLength(chunk)
      if (size > 32 * 1024 * 1024) { kill(); done('local_history_incomplete', '本地读取结果超过 32 MiB，未推进进度。'); return }
      output += chunk
    })
    child.on('error', error => done(error.code === 'ENOENT' ? 'local_tool_missing' : 'local_reader_failed',
      `无法运行 ${TOOLS[platform]}；请按 macOS 本地聊天说明安装并配置可执行路径。`))
    child.on('close', code => {
      if (settled) return
      let result
      try { result = JSON.parse(output) } catch { /* sanitized below */ }
      if (code !== 0 || !result || typeof result !== 'object' || Array.isArray(result) || result.error || result.ok === false)
        return done('local_reader_failed', `${TOOLS[platform]} 查询失败，请在本机终端检查账号、密钥及工具环境；未返回原始错误以保护隐私。`)
      done(null, null, result)
    })
  })
}

async function clientRunning(platform) {
  try {
    await promisify(execFile)('/usr/bin/pgrep', ['-x', platform === 'wechat' ? 'WeChat|Weixin' : 'DingTalk'], { timeout: 5000 })
    return true
  } catch (error) {
    if (error.code === 1) return false
    fail('local_reader_failed', '无法检查客户端运行状态。')
  }
}

const wxKind = username => username.endsWith('@chatroom') ? 'group'
  : username.startsWith('gh_') || ['filehelper', 'weixin', 'fmessage', 'newsapp', 'brandsessionholder', 'notification_messages', 'notifymessage', 'service_officialaccounts'].includes(username) ? 'system' : 'personal'
const person = row => ({ id: id(row.username), name: row.remark || row.nick_name || row.alias || row.username, kind: wxKind(row.username) })
const supported = chat => ['personal', 'group'].includes(chat.kind)

/** Injectable CLI transport for synthetic regression tests. */
export async function macChat(platform, query, { run = localJson, running = clientRunning } = {}) {
  if (!TOOLS[platform]) fail('unsupported_platform', '未知聊天平台。')
  if (query['data-dir']) fail('invalid_input', 'macOS 数据目录由本地读取工具管理，不支持 --data-dir。')
  if (query.offline && platform === 'dingtalk') fail('invalid_input', 'macOS 钉钉暂不支持 --offline。')
  if (query.type && !(platform === 'wechat' ? messageTypes : dingtalkTypes).includes(query.type)) fail('invalid_input', '不支持的消息类型。')
  if (['members', 'download'].includes(query.op))
    fail('capability_unavailable', 'macOS 本地适配器暂不提供完整群成员名单、角色或附件下载；可收集所选聊天的全部消息。')
  const wx = platform === 'wechat'
  const state = await run(platform, [wx ? 'accounts' : 'status'])
  const profiles = wx
    ? list(state, 'accounts').map(a => ({ id: id(a.account), uid: id(a.account) }))
    : [{ id: id(state.account?.uid), uid: id(state.account?.uid) }]
  if (!profiles.length) fail('profile_not_found', '本机没有可用账号，请先登录客户端并配置本地读取工具。')
  if (query.op === 'profiles') return { ok: true, profiles }
  if (query.op === 'status') return { ok: true, running: await running(platform), backend: TOOLS[platform] }
  if (!query.profile && profiles.length !== 1)
    fail('profile_required', '请选择明确的本地账号，不自动选择最近使用的账号。', { profiles })
  const profile = query.profile || profiles[0]?.id
  if (!profiles.some(p => p.id === profile)) fail('profile_not_found', '本地账号已变化，请重新选择账号。')
  query = { ...query, profile }
  after(query) // Reject cross-account/query cursors before reading messages.
  const call = async args => {
    const result = await run(platform, wx ? ['--account', profile, ...args] : args)
    if (wx && result.account !== profile) badSchema()
    return result
  }
  let contacts = [], chats
  if (wx) {
    const c = await call(['contacts'])
    contacts = list(c, 'contacts').map(person)
    const people = new Map(contacts.map(p => [p.id, p]))
    const s = await call(['sessions'])
    chats = list(s, 'sessions').map(s => ({
      ...(people.get(s.username) || person(s)), lastAt: s.last_time || null, hidden: !!s.is_hidden
    })).filter(supported)
  } else {
    const result = await call(['conversations', '--limit', String(MAX_ROWS + 1)])
    const rows = list(result, 'conversations')
    if (!Number.isSafeInteger(result.total) || result.total > rows.length || rows.length > MAX_ROWS) incomplete()
    chats = rows.map(c => ({ id: id(c.cid), name: c.title || c.cid, kind: c.type === 'group' ? 'group' : c.type === 'single' ? 'personal' : 'unknown', lastAt: c.last_message_at || null })).filter(supported)
    if (query.op === 'contacts' || query.sender) {
      const result = await call(['contacts', '--limit', String(MAX_ROWS + 1)])
      contacts = list(result, 'contacts').map(c => ({ id: id(c.uid), name: c.remark || c.real_name || c.nick || String(c.uid), kind: 'personal' }))
      if (contacts.length > MAX_ROWS) incomplete()
    }
  }
  const filtered = items => items.filter(c => (!query.kind || c.kind === query.kind) && contains(query.query, c.id, c.name))
  const finish = result => ({ ...result, profile, backend: TOOLS[platform] })
  if (query.op === 'list') return finish(page(query, filtered(chats.filter(c => !c.hidden)), c => [c.id], 'chats'))
  if (query.op === 'contacts') return finish(page(query, filtered(contacts), c => [c.id], 'contacts'))
  const chat = query.chat ? resolve(query.chat, chats) : null
  if (query.op === 'info') return finish({ ok: true, chat: { ...chat, ownerId: null }, coverage: 'local_synced', roleCoverage: 'unavailable' })
  // Do not silently fan out a keyword query over every private conversation.
  if (!chat) fail('invalid_input', 'macOS 消息查询请用 --chat 指定聊天。')
  if (!['read', 'search'].includes(query.op)) fail('invalid_input', '不支持的 macOS 聊天操作。')
  const sender = query.sender ? resolve(query.sender, contacts).id : null
  let raw
  if (wx) {
    const dbs = list(await call(['dbs']), 'dbs').filter(d => /(?:^|\/)message_\d+\.db$/.test(d.path))
    if (!dbs.length || dbs.some(d => d.has_key !== true)) incomplete()
    const result = await call(['history', '--chat', chat.id, '--limit', String(MAX_ROWS)])
    raw = list(result, 'messages')
    if (result.truncated !== false || result.partial || raw.length > MAX_ROWS) incomplete()
  } else {
    const result = await call(['messages', '--cid', chat.id, '--limit', String(MAX_ROWS + 1),
      ...(query.since === undefined ? [] : ['--since', new Date(query.since).toISOString()]),
      ...(query.until === undefined ? [] : ['--until', new Date(query.until).toISOString()])])
    raw = list(result, 'messages')
    if (!Number.isSafeInteger(result.total) || result.total > raw.length || raw.length > MAX_ROWS || result.partial) incomplete()
    // dtlocal has one configured account; fail closed if it changed during the query.
    const current = await run(platform, ['status'])
    if (id(current.account?.uid) !== profile) fail('profile_not_found', '读取期间钉钉账号变化，请重新选择账号。')
  }
  const names = new Map(contacts.map(p => [p.id, p.name]))
  const messages = raw.map(m => {
    let content, senderId, sentAt, messageId
    if (wx) {
      senderId = m.real_sender ? id(m.real_sender) : ''
      let body = typeof m.content === 'string' ? m.content : ''
      const prefix = /^(wxid_[\w-]+|gh_[\da-f]+|\d+@chatroom):\s?/.exec(body)
      if (prefix) { senderId ||= prefix[1]; body = body.slice(prefix[0].length) }
      content = m.content_encoding === 'text' ? parseContent(m.local_type, body) : { type: 'unknown', text: null, contentStatus: 'unsupported' }
      sentAt = date(m.time)
      messageId = `${chat.id}:${id(m.db)}:${id(m.local_id)}`
    } else {
      if (id(m.cid) !== chat.id) badSchema()
      senderId = m.senderId == null ? '' : id(m.senderId)
      sentAt = date(m.createdAt)
      messageId = `${chat.id}:${id(m.mid)}`
      content = { type: dingtalkType(Number(m.contentType)), text: typeof m.content === 'string' ? m.content : null, contentStatus: 'local_summary' }
    }
    return { ...content, id: messageId, chatId: chat.id, sentAt,
      sender: { id: senderId, name: wx ? names.get(senderId) || senderId : m.senderName || senderId },
      isSelf: wx ? senderId === profile || profile.startsWith(senderId + '_') && !!senderId : senderId === profile }
  }).filter(m => (query.since === undefined || Date.parse(m.sentAt) >= query.since)
    && (query.until === undefined || Date.parse(m.sentAt) < query.until)
    && (!query.kind || chat.kind === query.kind) && (!sender || m.sender.id === sender)
    && (!query.type || m.type === query.type) && contains(query.query, textContent(m)))
  return finish({ ...page(query, messages, m => [-Date.parse(m.sentAt), m.id], 'messages'), chat })
}
