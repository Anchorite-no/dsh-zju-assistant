// Application entry: plugin switch and process status around the synchronized read-only CLI.
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { main as queryMain } from '../lib/cli.ts'
const args = process.argv.slice(2)
if (process.env.DINGTALK_CHAT_DISABLED === '1') {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      status: 'plugin_disabled',
      message: '钉钉聊天插件已关闭，请先在插件页打开。'
    }) + '\n'
  )
  process.exitCode = 1
} else if (process.platform === 'darwin' && !args.includes('--help')) {
  const { main, argumentsFor } = await import('../../chat/common.mjs')
  const { macChat } = await import('../../chat/macos.mjs')
  await main(() => macChat('dingtalk', argumentsFor(args)))
} else if (args.length === 1 && args[0] === 'status') {
  try {
    const output =
      process.platform === 'win32'
        ? execFileSync(
            path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/tasklist.exe'),
            ['/FI', 'IMAGENAME eq DingTalk.exe', '/FO', 'CSV', '/NH'],
            { windowsHide: true, encoding: 'utf8', timeout: 15000 }
          )
        : ''
    process.stdout.write(JSON.stringify({ ok: true, running: /"DingTalk\.exe"/i.test(output) }) + '\n')
  } catch {
    process.stdout.write(
      JSON.stringify({ ok: false, status: 'local_reader_failed', message: '无法检查钉钉运行状态。' }) + '\n'
    )
    process.exitCode = 1
  }
} else if (args.includes('--help')) {
  process.stdout.write(
    JSON.stringify({
      ok: true,
      usage:
        'status | profiles | chat list/contacts/info/members/read/search [--chat ID] [--query 关键词] [--profile ID] [--since ISO] [--until ISO] [--sender ID] [--type 类型] [--limit 1..500] [--cursor 游标]'
    }) + '\n'
  )
} else process.exitCode = queryMain(args)
