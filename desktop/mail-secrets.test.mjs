import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { handleMailSecret } from './mail-secrets.cjs'
import { mailVault } from '../ui/profile/mail-vault.mjs'

test('mail credential IPC matches requests and fails closed when system encryption is unavailable', async () => {
  const channel = new EventEmitter(); channel.connected = true
  const storage = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from('encrypted:' + value), decryptString: value => value.toString().slice(10) }
  channel.send = (message, callback) => { handleMailSecret(message, storage, result => { queueMicrotask(() => channel.emit('message', result)) }); callback(null) }
  const vault = mailVault(channel)
  const sealed = await vault.seal('secret')
  assert.notEqual(sealed, 'secret'); assert.equal(await vault.open(sealed), 'secret')
  assert.equal(channel.listenerCount('message'), 0)
  storage.isEncryptionAvailable = () => false
  await assert.rejects(vault.seal('secret'), /安全存储/)
  storage.isEncryptionAvailable = () => true; storage.getSelectedStorageBackend = () => 'basic_text'
  await assert.rejects(vault.seal('secret'), /安全存储/)
  channel.connected = false
  await assert.rejects(vault.seal('secret'), /桌面端/)
  assert.equal(handleMailSecret({ type: 'unrelated' }, storage, () => assert.fail()), false)
})
