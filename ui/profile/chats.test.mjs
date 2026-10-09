import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ChatFolders } from './chats.mjs'

test('每个对话一个文件夹，按日期归在一起，同一分钟不重名', async t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-chats-'))
  t.after(() => { assert.ok(path.resolve(base).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(base, { recursive: true, force: true }) })
  const folders = new ChatFolders(path.join(base, 'CampusAgent'))
  const at = new Date(2026, 9, 8, 2, 5)
  const first = await folders.create(at), second = await folders.create(at)
  assert.equal(first.root, path.join(base, 'CampusAgent'))
  assert.equal(first.path, path.join(base, 'CampusAgent', '2026-10-08', '0205'))
  assert.equal(second.path, path.join(base, 'CampusAgent', '2026-10-08', '0205-2'))
  assert.ok(fs.statSync(first.path).isDirectory() && fs.statSync(second.path).isDirectory())
  assert.equal(await folders.root(), first.root)
})
