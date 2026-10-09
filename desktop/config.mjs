/** 校园应用的本地配置：密钥文件固定在应用根目录，DeepSeek Key 不从环境取值。 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'

export const API_KEYS_FILE = 'api-keys.local.yaml'

/** 保留 PATH 等运行环境；DeepSeek Key 只由本地凭据文件提供，不加载 .env。 */
export function campusEnvironment(env = process.env) {
  const values = Object.fromEntries(Object.entries(env).filter(([name, value]) =>
    value !== undefined && name.toUpperCase() !== 'DEEPSEEK_API_KEY'))
  return createLaunchEnvironmentSnapshot([{ source: 'process', values }])
}

/** 将组合层里的应用路径展开；模板中的路径使用 YAML 单引号。 */
export function writeCampusPatch(root, home) {
  const yamlPath = path => path.replaceAll('\\', '/').replaceAll("'", "''")
  const patch = readFileSync(join(root, 'app.patch.yml'), 'utf8')
    .replaceAll('{{ui}}', yamlPath(join(root, 'ui')))
    .replaceAll('{{apiKeys}}', yamlPath(join(root, API_KEYS_FILE)))
  const target = join(home, 'campus.patch.yml')
  writeFileSync(target, patch)
  return target
}
