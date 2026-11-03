import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createCredentialVault } from '../lib/core/credential-vault.mjs'

test('Android file keyring persists a 0600 wrapping key and reopens sealed data', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-file-keyring-'))
  const previous = { DSH_HOME: process.env.DSH_HOME, ANDROID_DATA: process.env.ANDROID_DATA, CAMPUS_FILE_KEYRING: process.env.CAMPUS_FILE_KEYRING }
  process.env.DSH_HOME = root
  process.env.ANDROID_DATA = '/data'
  delete process.env.CAMPUS_FILE_KEYRING
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    fs.rmSync(root, { recursive: true, force: true })
  })

  const vault = createCredentialVault()
  const sealed = vault.seal('fixture password', 'campus-accounts')
  assert.equal(vault.open(sealed, 'campus-accounts'), 'fixture password')
  assert.ok(!JSON.stringify(sealed).includes('fixture password'))

  const file = path.join(root, 'zju-campus', 'profile', 'keyring.json')
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8'))).length, 1)

  vault.forget(sealed)
  assert.throws(() => vault.open(sealed, 'campus-accounts'), /系统凭据库/)
})
