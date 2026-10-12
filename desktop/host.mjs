/**
 * 引擎进程：在 Node 模式下启动 Harness 的一个 profile，把带认证的地址报给壳。
 * 做法与上游 apps/desktop-host 相同（runProfile），只是 profile 和 home 都是我们自己的。
 */
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { runProfile } from '@deepseek-ai/dsh/profile-boot'
import { campusEnvironment, writeCampusPatch } from './config.mjs'
import { ensureCampusProfile } from './profile.mjs'

const PROFILE = 'campus'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// 校园命令找引擎问模型用的管道（ui/profile/vision.mjs 在这个地址上听）。引擎一启动就定下来，它后面启动的命令从环境变量里读到。
process.env.CAMPUS_MODEL_ENDPOINT ||= process.platform === 'win32' ? `\\\\.\\pipe\\campus-model-${randomUUID()}` : join(tmpdir(), `campus-model-${randomUUID()}.sock`)

try {
  ensureCampusProfile(resolveDshHome(), PROFILE)
  const { ctx, shutdown } = await runProfile({
    environment: campusEnvironment(),
    profile: PROFILE,
    patchFiles: [writeCampusPatch(root, resolveDshHome(), process.env.CAMPUS_KEYS_DIR || root)],
    args: ['--no-open', '--port', '0'],
  })
  const url = ctx.connection.authenticatedUrl(`http://127.0.0.1:${String(ctx.webServer.port)}`)
  process.on('message', (message) => {
    if (message?.type === 'shutdown') void shutdown.shutdown(0)
  })
  process.once('disconnect', () => { void shutdown.shutdown(0) })
  process.send?.({ type: 'ready', url })
} catch (error) {
  process.send?.({ type: 'fatal', message: error instanceof Error ? (error.stack ?? error.message) : String(error) })
  console.error(error)
  process.exitCode = 1
}
