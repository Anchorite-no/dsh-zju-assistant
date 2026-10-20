/** Only the engine child can ask the desktop process to seal/open mailbox credentials. */
function handleMailSecret(message, safeStorage, reply) {
  if (message?.type !== 'mail-secret') return false
  const result = { type: 'mail-secret-result', id: message.id }
  try {
    if (typeof message.id !== 'string' || message.id.length > 64 || typeof message.value !== 'string' || message.value.length > 16384) throw new Error('invalid')
    if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') throw new Error('unavailable')
    if (message.operation === 'seal') result.value = safeStorage.encryptString(message.value).toString('base64')
    else if (message.operation === 'open') result.value = safeStorage.decryptString(Buffer.from(message.value, 'base64'))
    else throw new Error('invalid')
  } catch { result.error = '无法使用本机的安全存储，请在校园智能体桌面端重新连接邮箱。' }
  reply(result)
  return true
}
module.exports = { handleMailSecret }
