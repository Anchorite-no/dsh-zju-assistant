/** 应用自己（不是助手）要校园数据时，从这里跑 ZJU Core 的命令。 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { CORE_ROOT } from './skills.mjs'

/**
 * 跑一条 ZJU Core 命令，返回结果里的 data；出错时把 core 给的原因和提示带出来。
 * system 是出错时对用户说的系统名。ignoreSwitches 为真时不受插件页上关掉哪些功能的影响。
 * env 是只给这一次命令的环境变量。
 */
export function runCore(args, { system, timeoutMs = 90_000, ignoreSwitches = false, env: extra = {} } = {}) {
  return new Promise((resolve, reject) => {
    const { ZJU_DISABLED_MODULES: disabled, ...env } = { ...process.env, ...extra }
    if (disabled && !ignoreSwitches) env.ZJU_DISABLED_MODULES = disabled
    const child = spawn(process.execPath, [path.join(CORE_ROOT, 'zju', 'scripts', 'zju.ts'), ...args], {
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    })
    let output = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${system}一直没有回应，稍后再试。`)) }, timeoutMs)
    child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk })
    child.once('error', (error) => { clearTimeout(timer); reject(error) })
    child.once('close', () => {
      clearTimeout(timer)
      let result
      try { result = JSON.parse(output) } catch { reject(new Error(`没有拿到${system}的结果，稍后再试。`)); return }
      if (result.ok) resolve(result.data)
      else reject(new Error([result.error?.message, result.error?.hint].filter(Boolean).join('；') || `没能从${system}读到内容。`))
    })
  })
}
