/**
 * 校园应用的本地配置：DeepSeek Key 不从环境取值，只认一个密钥文件。
 * 文件开发时在项目根目录，方便直接改；装好的应用放在数据目录（main.cjs 经 CAMPUS_KEYS_DIR 告诉引擎），
 * 因为安装目录在升级时会被整个换掉。
 */
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

/** 将组合层里的应用路径展开；模板中的路径使用 YAML 单引号。keysDir 是密钥文件所在的文件夹，不给就是应用根目录。 */
export function writeCampusPatch(root, home, keysDir = root) {
  const yamlPath = path => path.replaceAll('\\', '/').replaceAll("'", "''")
  const patch = readFileSync(join(root, 'app.patch.yml'), 'utf8')
    .replaceAll('{{ui}}', yamlPath(join(root, 'ui')))
    .replaceAll('{{apiKeys}}', yamlPath(join(keysDir, API_KEYS_FILE)))
  const target = join(home, 'campus.patch.yml')
  writeFileSync(target, patch)
  return target
}
