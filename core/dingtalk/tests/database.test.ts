import assert from 'node:assert/strict'
import { createCipheriv, createHash, pbkdf2Sync } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import os, { tmpdir } from 'node:os'
import path from 'node:path'
import test, { afterEach } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import {
  checksum, discover, mergeWal, selectProfile, setGlobalKeyProvider, setReader, snapshot, userKey, type Profile,
} from '../lib/database.ts'
import { run } from '../lib/cli.ts'
import { SkillError } from '../lib/errors.ts'

const KEY = Buffer.from('synthetic-db-key', 'latin1')

/** The error a call throws (assert.throws does not return it). */
function caught<T extends Error>(fn: () => unknown): T {
  try { fn() } catch (error) { return error as T }
  throw new assert.AssertionError({ message: 'expected a throw' })
}

function encrypt(data: Uint8Array, key: Uint8Array = KEY): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null)
  cipher.setAutoPadding(false)
  return Buffer.concat([cipher.update(data), cipher.final()])
}

function source(): Buffer {
  const db = new DatabaseSync(':memory:')
  db.exec("CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO sample VALUES (1, 'synthetic record')")
  const data = Buffer.from(db.serialize())
  db.close()
  return data
}

/** A WAL holding one frame for `page`, with correct header and frame checksums. */
function walImage(page: Buffer, { pageNo = 1, commitSize, big = false }: { pageNo?: number; commitSize?: number; big?: boolean } = {}): Buffer {
  const header = Buffer.alloc(32)
  header.writeUInt32BE(big ? 0x377f0683 : 0x377f0682, 0)
  header.writeUInt32BE(3007000, 4)
  header.writeUInt32BE(page.length, 8)
  header.writeUInt32BE(0, 12)
  header.writeUInt32BE(11, 16)
  header.writeUInt32BE(22, 20)
  let state = checksum(header.subarray(0, 24), big)
  header.writeUInt32BE(state[0], 24)
  header.writeUInt32BE(state[1], 28)
  const payload = encrypt(page)
  const frame = Buffer.alloc(24)
  frame.writeUInt32BE(pageNo, 0)
  frame.writeUInt32BE(commitSize ?? 1, 4)
  frame.writeUInt32BE(11, 8)
  frame.writeUInt32BE(22, 12)
  state = checksum(payload, big, checksum(frame.subarray(0, 8), big, state))
  frame.writeUInt32BE(state[0], 16)
  frame.writeUInt32BE(state[1], 20)
  return Buffer.concat([header, frame, payload])
}

afterEach(() => { setReader(); setGlobalKeyProvider() })

test('the snapshot is read-only and writes no plaintext beside the database', () => {
  const plain = source()
  const dir = mkdtempSync(path.join(tmpdir(), 'dingtalk-synthetic-'))
  const file = path.join(dir, 'dingtalk.db')
  const encrypted = encrypt(plain)
  writeFileSync(file, encrypted)
  const { db } = snapshot(file, KEY)
  try {
    assert.equal((db.prepare('SELECT value FROM sample').get() as { value: string }).value, 'synthetic record')
    assert.throws(() => db.exec('DELETE FROM sample'))
  } finally {
    db.close()
  }
  assert.deepEqual(readFileSync(file), encrypted)
  assert.deepEqual(readdirSync(dir), ['dingtalk.db'])
})

test('committed WAL frames apply under both checksum orders', () => {
  const original = source()
  const size = original.readUInt16BE(16)
  for (const big of [false, true]) {
    const { plain, commits } = mergeWal(Buffer.from(original), walImage(original.subarray(0, size), { commitSize: original.length / size, big }), KEY)
    assert.deepEqual(plain, original)
    assert.equal(commits, 1)
  }
})

test('an uncommitted frame is ignored', () => {
  const plain = source()
  const page = Buffer.alloc(plain.readUInt16BE(16), 0x78)
  const { plain: result, commits } = mergeWal(Buffer.from(plain), walImage(page, { commitSize: 0 }), KEY)
  assert.deepEqual(result, plain)
  assert.equal(commits, 0)
})

test('a corrupted WAL checksum fails', () => {
  const plain = source()
  const size = plain.readUInt16BE(16)
  const wal = walImage(plain.subarray(0, size))
  wal[wal.length - 1]! ^= 1
  const error = caught<SkillError>(() => mergeWal(Buffer.from(plain), wal, KEY))
  assert.equal(error.status, 'snapshot_failed')
})

test('a real SQLite WAL update is visible through the snapshot', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dingtalk-synthetic-'))
  const sourceFile = path.join(dir, 'fixture.sqlite')
  const db = new DatabaseSync(sourceFile)
  try {
    db.exec('PRAGMA journal_mode=WAL')
    db.exec("CREATE TABLE sample (value TEXT); INSERT INTO sample VALUES ('before')")
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    const base = readFileSync(sourceFile)
    db.exec("UPDATE sample SET value='after'")
    const wal = readFileSync(sourceFile + '-wal')
    const size = wal.readUInt32BE(8)
    let state = checksum(wal.subarray(0, 24), false)
    for (let offset = 32; offset < wal.length; offset += 24 + size) {
      encrypt(wal.subarray(offset + 24, offset + 24 + size)).copy(wal, offset + 24)
      state = checksum(wal.subarray(offset + 24, offset + 24 + size), false, checksum(wal.subarray(offset, offset + 8), false, state))
      wal.writeUInt32BE(state[0], offset + 16)
      wal.writeUInt32BE(state[1], offset + 20)
    }
    const target = path.join(dir, 'dingtalk.db')
    writeFileSync(target, encrypt(base))
    writeFileSync(target + '-wal', wal)
    const { db: result, meta } = snapshot(target, KEY)
    try {
      assert.ok(meta.walCommits > 0)
      assert.equal((result.prepare('SELECT value FROM sample').get() as { value: string }).value, 'after')
    } finally {
      result.close()
    }
  } finally {
    db.close()
  }
})

test('a source that changes between reads does not return old data', () => {
  const encrypted = encrypt(source())
  const changed = Buffer.from('changed')
  const empty = Buffer.alloc(0)
  const queue = [encrypted, empty, changed, encrypted, empty, changed, encrypted, empty, changed]
  setReader(() => queue.shift() ?? empty)
  const error = caught<SkillError>(() => snapshot(path.join(tmpdir(), 'synthetic.db'), KEY))
  assert.equal(error.status, 'database_busy')
})

test('a wrong key is rejected', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dingtalk-synthetic-'))
  const file = path.join(dir, 'fixture.db')
  writeFileSync(file, encrypt(source()))
  const error = caught<SkillError>(() => snapshot(file, Buffer.alloc(16, 0x30)))
  assert.equal(error.status, 'database_key_unavailable')
})

test('key derivation and account selection', () => {
  const expected = createHash('md5').update(pbkdf2Sync(Buffer.from('12345salt', 'utf8'), Buffer.from('666DingT', 'latin1'), 1000, 32, 'sha1')).digest('hex').slice(0, 16)
  assert.equal(userKey('12345', 'salt').toString('latin1'), expected)
  assert.equal(userKey('12345', 'salt').toString('latin1'), '137a2e7b3d63e74f')
  const profiles = [{ id: 'a_v3', uid: '12345' }, { id: 'b_v3', uid: '23456' }] as Profile[]
  assert.throws(() => selectProfile(profiles), SkillError)
  assert.equal(selectProfile(profiles, '23456').id, 'b_v3')
})

test('discover verifies accounts with explicit paths and when a launcher omits APPDATA', t => {
  const GLOBAL_KEY = Buffer.from('global-synth-key', 'latin1')
  setGlobalKeyProvider(() => GLOBAL_KEY)
  const home = mkdtempSync(path.join(tmpdir(), 'dingtalk-data-'))
  const dir = path.join(home, 'AppData', 'Roaming', 'DingTalk')

  const global = new DatabaseSync(':memory:')
  global.exec("CREATE TABLE GlobalStorage (key TEXT, value TEXT); INSERT INTO GlobalStorage VALUES ('900000000001','x'),('last_login_user_uid','900000000002'),('DTLastUserData','secret-token'),('abc','junk')")
  const globalImage = Buffer.from(global.serialize())
  global.close()
  mkdirSync(path.join(dir, 'globalStorage'), { recursive: true })
  writeFileSync(path.join(dir, 'globalStorage', 'storage.db'), encrypt(globalImage, GLOBAL_KEY))

  const account = new DatabaseSync(':memory:')
  account.exec('CREATE TABLE marker (value TEXT)')
  const accountImage = Buffer.from(account.serialize())
  account.close()
  mkdirSync(path.join(dir, 'acct_v3', 'DBFiles'), { recursive: true })
  writeFileSync(path.join(dir, 'acct_v3', 'user_config'), Buffer.from(JSON.stringify({ salt: 's4lt' })).toString('base64'))
  writeFileSync(path.join(dir, 'acct_v3', 'DBFiles', 'dingtalk.db'), encrypt(accountImage, userKey('900000000002', 's4lt')))

  const profiles = discover(dir)
  assert.equal(profiles.length, 1)
  assert.equal(profiles[0]!.id, 'acct_v3')
  assert.equal(profiles[0]!.uid, '900000000002')

  const result = run(['profiles', '--data-dir', dir]) as { ok: boolean; profiles: { id: string; uid: string }[] }
  assert.equal(result.ok, true)
  assert.deepEqual(result.profiles, [{ id: 'acct_v3', uid: '900000000002' }])

  const previous = { APPDATA: process.env.APPDATA, DINGTALK_DATA_DIR: process.env.DINGTALK_DATA_DIR }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  t.mock.method(os, 'homedir', () => home)
  delete process.env.APPDATA
  delete process.env.DINGTALK_DATA_DIR
  assert.deepEqual(run(['profiles']), result, 'missing APPDATA still discovers the user Roaming folder')

  process.env.APPDATA = path.join(home, 'missing-roaming')
  process.env.DINGTALK_DATA_DIR = dir
  assert.deepEqual(run(['profiles']), result, 'an explicit DingTalk directory remains authoritative')
})
