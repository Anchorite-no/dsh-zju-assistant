import { randomUUID } from 'node:crypto'

/** Credentials never travel through tools or the public profile snapshot. */
export function mailVault(channel = process) {
  const request = (operation, value) => new Promise((resolve, reject) => {
    if (!channel.send || !channel.connected) return reject(new Error('请在校园智能体桌面端连接邮箱，以便加密保存专用密码。'))
    const id = randomUUID()
    const finish = (error, result) => {
      clearTimeout(timer); channel.off('message', receive); channel.off('disconnect', disconnected)
      if (error) reject(error); else resolve(result)
    }
    const receive = message => { if (message?.type === 'mail-secret-result' && message.id === id) finish(message.error ? new Error(message.error) : null, message.value) }
    const disconnected = () => finish(new Error('桌面连接已断开，请重新打开应用。'))
    const timer = setTimeout(() => finish(new Error('安全存储没有响应，请重新打开应用。')), 5000)
    channel.on('message', receive); channel.on('disconnect', disconnected)
    channel.send({ type: 'mail-secret', id, operation, value }, error => { if (error) finish(new Error('安全存储连接失败。')) })
  })
  return { seal: value => request('seal', value), open: value => request('open', value) }
}
