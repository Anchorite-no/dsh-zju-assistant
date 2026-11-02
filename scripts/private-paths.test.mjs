import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isPrivatePath, assertPublicFiles, copyPublicTree, checkPublishedTree } from './private-paths.cjs'

test('credentials, session dumps, local variants and development archives cannot ship', () => {
  for (const file of ['host/.env.local', 'core/zju/lib/.env.production', 'core/zju/scripts/profile.env', 'host/accounts.json', 'host/.credentials.yaml', 'skill/cookies.txt', 'rows/session.json.bak', 'core/foo/token.json', 'key.pem', 'client.p12', 'capture.har', 'chat.db-wal', 'state.sqlite3', 'video/demo/run.mjs', 'core/weread/dev/verification.md', 'plans/a.md', 'core/zju/data/auth.json', 'core/foo/downloads/page.html']) {
    assert.equal(isPrivatePath(file), true, file)
    assert.throws(() => assertPublicFiles([file]), /凭据文件/)
  }
})
test('the real copy operation excludes local credentials and refuses indirect files', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-public-copy-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, 'source'), target = path.join(root, 'package')
  fs.mkdirSync(source)
  for (const name of ['module.mjs', '.env.example', '.env.local', 'accounts.json', 'cookies.txt', 'profile.env']) fs.writeFileSync(path.join(source, name), 'fixture')
  copyPublicTree(source, target, source)
  assert.deepEqual(fs.readdirSync(target).sort(), ['.env.example', 'module.mjs'])
  assert.equal(checkPublishedTree(target), 2)
  fs.writeFileSync(path.join(target, 'accounts.json'), 'fixture')
  assert.throws(() => checkPublishedTree(target), /凭据文件/)
  const elsewhere = path.join(root, 'elsewhere'); fs.mkdirSync(elsewhere)
  fs.symlinkSync(elsewhere, path.join(source, 'indirect'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => copyPublicTree(source, target, source), /符号链接/)
})
test('runtime skills, public examples, licenses and credential-handling source remain publishable', () => {
  assertPublicFiles(['core/zju/SKILL.md', 'core/zju/lib/core/credential-vault.mjs', 'core/zju/lib/module.json', 'core/weread/LICENSE-Tencent', '.env.example', '.env.production.example', 'host/account.mjs', 'core/zju/references/commands.md'])
})
test('retired desktop files cannot be reintroduced, while public release history remains readable', () => {
  for (const file of ['desktop/main.cjs', 'ui/host.js', 'build/icon.ico', 'app.patch.yml', '.github/workflows/mac.yml', 'scripts/after-pack.cjs', 'core/AGENT.md', 'core/learn/tools/tts/app.py']) {
    assert.throws(() => assertPublicFiles([file]))
    assert.doesNotThrow(() => assertPublicFiles([file], { allowRetired: true }))
  }
  assert.throws(() => assertPublicFiles(['plans/private.md'], { allowRetired: true }))
})
