import { createCipheriv, createDecipheriv, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const SERVICE = 'dsh-zju-assistant.encryption.v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const unavailable = () => new Error('无法使用系统凭据库。请解锁系统钥匙串或凭据管理器后重试；现有账号文件不会改为明文。')

/** Android/PRoot 没有 Secret Service 时，使用应用私有目录里的 0600 密钥文件。正式版应改为 Android Keystore 桥。 */
function keyFile() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'zju-campus', 'profile', 'keyring.json')
}

function readFileKeys() {
  try {
    const value = JSON.parse(fs.readFileSync(keyFile(), 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('keyring format')
    return value
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw error
  }
}

function writeFileKeys(value) {
  const file = keyFile()
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 })
  fs.chmodSync(tmp, 0o600)
  fs.renameSync(tmp, file)
  fs.chmodSync(file, 0o600)
}

function fileEntry(id) {
  return {
    getPassword() {
      const value = readFileKeys()[id]
      if (typeof value !== 'string') throw new Error('本地密钥不存在')
      return value
    },
    setPassword(value) {
      const all = readFileKeys()
      all[id] = value
      writeFileKeys(all)
    },
    deleteCredential() {
      const all = readFileKeys()
      delete all[id]
      writeFileKeys(all)
    },
  }
}

function androidHost() {
  return Boolean(process.env.ANDROID_DATA || process.env.ANDROID_ROOT) || fs.existsSync('/system/build.prop')
}

function systemEntry(id) {
  const mode = process.env.CAMPUS_FILE_KEYRING
  if (mode !== '0' && (mode === '1' || androidHost())) return fileEntry(id)
  const { Entry } = require('@napi-rs/keyring')
  // Linux requires persistent Secret Service storage; do not fall back to a session keyring.
  return new Entry(SERVICE, id, { linux: { store: 'secret-service' } })
}

function bytes(value, length) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw unavailable()
  const data = Buffer.from(value, 'base64')
  if (length !== undefined && data.length !== length) throw unavailable()
  return data
}

export function isSealed(value) {
  return value?.version === 1 && value?.algorithm === 'aes-256-gcm' && UUID.test(value?.keyId)
}

/** Only a random wrapping key enters the OS vault. Passwords stay in authenticated ciphertext. */
export function createCredentialVault({ entry = systemEntry } = {}) {
  const keyFor = id => {
    if (!UUID.test(id)) throw unavailable()
    return bytes(entry(id).getPassword(), 32)
  }
  const vault = {
    seal(text, purpose, previous) {
      if (typeof text !== 'string' || Buffer.byteLength(text) > 1024 * 1024 || !purpose) throw new Error('凭据内容格式不正确。')
      let key, fresh = false, keyId
      try {
        if (previous !== undefined && !isSealed(previous)) throw unavailable()
        keyId = previous?.keyId ?? randomUUID()
        if (previous) key = keyFor(keyId)
        else {
          key = randomBytes(32)
          entry(keyId).setPassword(key.toString('base64'))
          fresh = true
          const saved = keyFor(keyId)
          try { if (!timingSafeEqual(saved, key)) throw unavailable() } finally { saved.fill(0) }
        }
        const iv = randomBytes(12)
        const cipher = createCipheriv('aes-256-gcm', key, iv)
        cipher.setAAD(Buffer.from(`campus:${purpose}:v1`))
        const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
        const sealed = { version: 1, algorithm: 'aes-256-gcm', keyId, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }
        if (vault.open(sealed, purpose) !== text) throw unavailable()
        return sealed
      } catch {
        if (fresh) { try { entry(keyId).deleteCredential() } catch {} }
        throw unavailable()
      } finally { key?.fill(0) }
    },
    open(sealed, purpose) {
      let key
      try {
        if (!isSealed(sealed) || !purpose) throw unavailable()
        key = keyFor(sealed.keyId)
        const cipher = createDecipheriv('aes-256-gcm', key, bytes(sealed.iv, 12))
        cipher.setAAD(Buffer.from(`campus:${purpose}:v1`))
        cipher.setAuthTag(bytes(sealed.tag, 16))
        return Buffer.concat([cipher.update(bytes(sealed.ciphertext)), cipher.final()]).toString('utf8')
      } catch { throw unavailable() }
      finally { key?.fill(0) }
    },
    forget(sealed) {
      if (!isSealed(sealed)) throw unavailable()
      try { entry(sealed.keyId).deleteCredential() } catch { throw unavailable() }
    },
  }
  return vault
}

export const credentialVault = createCredentialVault()
