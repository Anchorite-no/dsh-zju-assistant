import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { macChat, localJson, executable } from './macos.mjs'
import { argumentsFor } from './common.mjs'
import { ChatWatch } from '../../ui/profile/chat-watch.mjs'

const at = Date.parse('2026-10-16T02:00:00Z')
function fixture(platform = 'wechat') {
  const wx = platform === 'wechat', profile = wx ? 'wxid_self_hash' : '100', chat = wx ? 'group@chatroom' : 'group'
  const world = { calls: [], account: profile, extraAccounts: [], truncated: false, missingKey: false,
    messages: Array.from({ length: 3 }, (_, n) => wx ? {
      db: 'message/message_0.db', local_id: n + 1, local_type: 1, real_sender: 'wxid_other',
      time: new Date(at + n * 1000).toISOString(), content: `wxid_other: 通知 ${n}`, content_encoding: 'text'
    } : {
      cid: chat, mid: String(n + 1), senderId: '200', senderName: '老师',
      createdAt: new Date(at + n * 1000).toISOString(), content: `通知 ${n}`, contentType: 1
    }) }
  const run = async (p, args) => {
    assert.equal(p, platform)
    world.calls.push(args)
    if (args[0] === 'accounts') return { accounts: [world.account, ...world.extraAccounts].map(account => ({ account })) }
    if (args[0] === 'status') return { account: { uid: world.account }, exists: true }
    let op = args[0]
    if (wx) {
      assert.deepEqual(args.slice(0, 2), ['--account', profile])
      op = args[2]
    }
    const payload = {
      contacts: wx ? { contacts: [{ username: chat, nick_name: '测试群' }, { username: 'wxid_other', remark: '老师' }] }
        : { contacts: [{ uid: 200, nick: '老师' }] },
      sessions: { sessions: [{ username: chat }, { username: 'gh_public' }, { username: 'hidden', is_hidden: 1 }] },
      conversations: { total: 1, conversations: [{ cid: chat, title: '测试群', type: 'group' }] },
      dbs: { dbs: [{ path: 'message/message_0.db', has_key: !world.missingKey }] },
      history: { messages: world.messages, truncated: world.truncated },
      messages: { messages: world.messages, total: world.messages.length + (world.truncated ? 1 : 0) }
    }[op]
    assert.ok(payload, `unexpected command: ${op}`)
    return { ...payload, ...(wx ? { account: world.account } : {}) }
  }
  const read = query => macChat(platform, { op: 'read', chat, profile, limit: 50, ...query }, { run, running: async () => true })
  return { world, run, read, profile, chat }
}

for (const platform of ['wechat', 'dingtalk']) {
  test(`${platform}: profiles, conversations, contacts and info use the existing contract`, async () => {
    const { read, profile, chat } = fixture(platform)
    assert.deepEqual((await read({ op: 'profiles' })).profiles, [{ id: profile, uid: profile }])
    assert.equal((await read({ op: 'status' })).running, true)
    const result = await read({ op: 'list', query: '测试', kind: 'group' })
    assert.equal(result.chats.length, 1)
    assert.equal(result.chats[0].id, chat)
    assert.equal(result.profile, profile)
    assert.equal((await read({ op: 'info' })).chat.ownerId, null)
    assert.ok((await read({ op: 'contacts', query: '老师' })).contacts.length)
  })
  test(`${platform}: scoped keyset pagination, stable IDs and filtering`, async () => {
    const { read, world } = fixture(platform)
    const first = await read({ limit: 1 })
    assert.equal(first.messages.length, 1)
    assert.equal(first.hasMore, true)
    const next = await read({ limit: 2, cursor: first.nextCursor })
    assert.equal(next.messages.length, 2)
    assert.equal(next.hasMore, false)
    assert.equal(new Set([...first.messages, ...next.messages].map(m => m.id)).size, 3)
    assert.equal(first.messages[0].sender.name, '老师')
    assert.equal(first.messages[0].text, '通知 2')
    const result = await read({ since: at, until: at + 2000, sender: '老师', query: '通知', type: 'text' })
    assert.equal(result.messages.length, 2)
    assert.equal((await read({ type: 'image' })).messages.length, 0)
    await assert.rejects(read({ query: 'different', cursor: first.nextCursor }), { status: 'invalid_cursor' })
    world.truncated = true
    await assert.rejects(read(), { status: 'local_history_incomplete' })
  })
  test(`${platform}: unavailable capabilities and invalid IDs fail closed`, async () => {
    const { read, world } = fixture(platform)
    for (const op of ['members', 'download']) await assert.rejects(read({ op }), { status: 'capability_unavailable' })
    await assert.rejects(read({ profile: 'other' }), { status: 'profile_not_found' })
    await assert.rejects(read({ op: 'search', chat: undefined, query: '通知' }), { status: 'invalid_input' })
    await assert.rejects(read({ 'data-dir': '/private' }), { status: 'invalid_input' })
    if (platform === 'wechat') world.messages[0].local_id = undefined
    else world.messages[0].mid = undefined
    await assert.rejects(read(), { status: 'schema_unsupported' })
  })
}

test('WeChat: explicit account selection and missing shard keys', async () => {
  const { read, world } = fixture()
  world.extraAccounts.push('second-account')
  await assert.rejects(read({ profile: undefined }), { status: 'profile_required' })
  assert.equal((await read()).messages.length, 3)
  world.missingKey = true
  await assert.rejects(read(), { status: 'local_history_incomplete' })
})

test('WeChat: XML is decoded with upstream parser, encoded blobs are not exposed', async () => {
  const { read, world } = fixture()
  world.messages[0].local_type = 49
  world.messages[0].content = '<msg><appmsg><type>6</type><title>报名表.xlsx</title></appmsg></msg>'
  world.messages[1].content_encoding = 'zstd+base64'
  world.messages[1].content = 'PRIVATE-BINARY-PAYLOAD'
  const result = await read()
  assert.equal(result.messages.find(m => m.type === 'file').title, '报名表.xlsx')
  assert.equal(JSON.stringify(result).includes('PRIVATE-BINARY-PAYLOAD'), false)
})

test('DingTalk: account changes during a read are rejected', async () => {
  const f = fixture('dingtalk')
  let statuses = 0
  const run = async (platform, args) => {
    if (args[0] === 'status' && ++statuses > 1) f.world.account = 'different'
    return f.run(platform, args)
  }
  await assert.rejects(macChat('dingtalk', { op: 'read', chat: f.chat, profile: f.profile }, { run }), { status: 'profile_not_found' })
})

test('ChatWatch uses the adapter for account binding, new messages and deduplication', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-mac-watch-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const f = fixture()
  let now = at - 1000
  const service = new ChatWatch({ platform: 'wechat', plugins: { disabled: () => [] },
    settingsFile: path.join(root, 'settings.json'), cacheFile: path.join(root, 'cache.json'),
    now: () => now, schedule: () => 1, cancel: () => {},
    run: (platform, args) => macChat(platform, argumentsFor(args), { run: f.run, running: async () => true }) })
  t.after(() => service.dispose())
  assert.equal((await service.profiles()).profiles.length, 1)
  await service.add({ id: f.chat, profile: f.profile })
  assert.equal(service.settings().tracks[0].profile, f.profile)
  assert.equal(service.snapshot().tracks[0].memberSelection, false)
  await assert.rejects(service.set({ key: service.settings().tracks[0].key, audience: 'managers' }), /不支持成员/)
  now = at + 10_000
  await service.refresh()
  assert.equal(service.notices().length, 3)
  await service.refresh()
  assert.equal(service.notices().length, 3)
  const key = service.settings().tracks[0].key
  const before = service.cache().states[key].checkedAt
  f.world.truncated = true
  now += 60_000
  await service.refresh()
  assert.equal(service.cache().states[key].checkedAt, before)
  assert.ok(service.cache().states[key].error)
})

test('tool path is absolute or resolved without a shell', () => {
  const absolute = path.resolve('a path/wxlocal')
  assert.equal(executable('wechat', { CAMPUS_WXLOCAL: absolute }), absolute)
  assert.throws(() => executable('wechat', { CAMPUS_WXLOCAL: 'python tool.py' }), { status: 'invalid_input' })
})

test('subprocess rejects missing executables, nonzero exits, malformed JSON and structured errors without leaking data', async () => {
  await assert.rejects(localJson('wechat', [], { env: { CAMPUS_WXLOCAL: path.resolve('nonexistent/campus-test-tool') } }), { status: 'local_tool_missing' })
  for (const code of [
    'console.log(JSON.stringify({ok:true, secret:"PRIVATE"})); process.exitCode=2',
    'console.log("PRIVATE not JSON")',
    'console.log(JSON.stringify({error:{reason:"PRIVATE"}}))'
  ]) {
    await assert.rejects(localJson('wechat', ['-e', code], { env: { CAMPUS_WXLOCAL: process.execPath } }), error => {
      assert.equal(error.status, 'local_reader_failed')
      assert.equal(error.message.includes('PRIVATE'), false)
      return true
    })
  }
  assert.deepEqual(await localJson('wechat', ['-e', 'console.log(JSON.stringify({ok:true}))'], { env: { CAMPUS_WXLOCAL: process.execPath } }), { ok: true })
})

test('subprocess timeout is bounded', { skip: process.platform === 'win32' }, async () => {
  await assert.rejects(localJson('wechat', ['-e', 'setInterval(()=>{}, 1000)'], {
    env: { CAMPUS_WXLOCAL: process.execPath }, timeoutMs: 100
  }), { status: 'local_reader_timeout' })
})

test('entry points respect disabled plugins before starting local tools', () => {
  for (const platform of ['wechat', 'dingtalk']) {
    let output
    try {
      execFileSync(process.execPath, [fileURLToPath(new URL(`../${platform}/scripts/${platform}.mjs`, import.meta.url)), 'status'], {
        encoding: 'utf8', env: { ...process.env, [`${platform.toUpperCase()}_CHAT_DISABLED`]: '1' }, stdio: ['ignore', 'pipe', 'pipe']
      })
      assert.fail('disabled command succeeded')
    } catch (error) { output = JSON.parse(error.stdout) }
    assert.equal(output.status, 'plugin_disabled')
  }
})

test('DingTalk type filters share the Windows mapping, including files and markdown', async () => {
  const { read, world } = fixture('dingtalk')
  for (const [raw, type] of [[500, 'file'], [501, 'file'], [202, 'video'], [300, 'card'], [1200, 'markdown'], [3100, 'richtext']]) {
    world.messages = [{ ...world.messages[0], contentType: raw }]
    const result = await read({ type })
    assert.equal(result.messages.length, 1)
    assert.equal(result.messages[0].type, type)
  }
})

test('hidden WeChat sessions are omitted from discovery but remain readable by ID', async () => {
  const { read } = fixture()
  assert.equal((await read({ op: 'list' })).chats.some(c => c.id === 'hidden'), false)
  assert.equal((await read({ op: 'info', chat: 'hidden' })).chat.id, 'hidden')
  assert.equal((await read({ chat: 'hidden' })).messages.length, 3)
})

test('no local accounts reports an actionable error', async () => {
  await assert.rejects(macChat('wechat', { op: 'profiles' }, { run: async () => ({ accounts: [] }) }), { status: 'profile_not_found' })
})
