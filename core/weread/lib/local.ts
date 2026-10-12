import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { SkillError } from './config.ts'
import type { Account } from './sources.ts'

const script = fileURLToPath(new URL('../scripts/local/read-local.ps1', import.meta.url))
// 用 Windows 自带的 PowerShell 5.1，不依赖 PATH 里的 pwsh。
const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const messages: Record<string, string> = {
  wechat_not_running: '电脑版微信没有运行；本地来源需要微信保持登录。',
  wechat_database_missing: '没有找到本机微信的公众号消息库。',
  multiple_wechat_processes: '同时运行了多个微信，本地来源只支持一个。',
  multiple_wechat_profiles: '本机有多个微信账号的数据目录，本地来源暂不支持选择账号。',
  wechat_key_unavailable: '没能从微信进程取得消息库密钥：请确认微信已登录；当前微信版本也可能不兼容（已验证 4.1.15.13）。',
  snapshot_failed: '本机微信的消息库没有通过校验或解析失败。',
  runtime_missing: '本地来源需要 Node 24 以上（用它内置的 sqlite 和 zstd）。',
  local_reader_failed: '读取本机微信失败。',
}

/** Node → PowerShell 5.1 → C#（取密钥、解密到内存）→ Node（解析消息，用的就是跑这条命令的这一份），返回全部公众号及其文章。 */
async function readWeChat(): Promise<Account[]> {
  if (process.platform !== 'win32') throw new SkillError('unsupported_platform', '本地来源只支持 Windows 版微信。')
  // 解析消息那一步由这份 Node 自己来跑（scripts/local/metadata.mjs），要它内置的 sqlite 和 zstd。在这里查，不在 PowerShell 里查：
  // 应用里的 Node 是个带窗口的程序，Windows PowerShell 不等它、也接不到它的输出。
  const ready = typeof (await import('node:zlib')).zstdDecompressSync === 'function' && await import('node:sqlite').then(() => true, () => false)
  if (!ready) throw new SkillError('runtime_missing', messages.runtime_missing)
  // ExecutionPolicy 只作用于这一个进程；Windows 默认不允许 PowerShell 5.1 运行脚本文件。
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-NodePath', process.execPath]
  const output: string = await promisify(execFile)(powershell, args, { windowsHide: true, timeout: 110000, maxBuffer: 64 * 1024 * 1024 })
    .then(result => result.stdout, error => error.stdout ?? '')
  let result: any
  try { result = JSON.parse(output) } catch { result = { error: 'local_reader_failed' } }
  if (result.error) throw new SkillError(result.error, messages[result.error] ?? messages.local_reader_failed)
  return result.accounts
}

let reader = readWeChat, snapshot: Promise<Account[]> | undefined
/** 一个命令只读一次本机微信，后续调用复用同一份结果。 */
export const localAccounts = () => snapshot ??= reader()
/** 测试用：换掉真实读取。 */
export function setLocalReader(next = readWeChat) { reader = next; snapshot = undefined }
