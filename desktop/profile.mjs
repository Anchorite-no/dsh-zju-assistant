import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { initializeProfileFromDefault } from '@deepseek-ai/dsh/profile-boot'

export const SCHEDULE_BUNDLE = '@deepseek-ai/dsh-experimental-schedule-bundle'

/** 首次应用校园默认值时启用自动化；此后不覆盖用户在插件页的开关。 */
export function ensureCampusProfile(home, name = 'campus') {
  const directory = join(home, 'profiles', name)
  const manifest = join(directory, 'package.json')
  if (!existsSync(manifest)) initializeProfileFromDefault(name, 'web', home)
  const marker = join(directory, 'campus-defaults.json')
  if (existsSync(marker)) return
  const data = JSON.parse(readFileSync(manifest, 'utf8'))
  const bundles = data.dsh.profile.bundles
  if (!bundles.includes(SCHEDULE_BUNDLE)) {
    bundles.push(SCHEDULE_BUNDLE)
    writeFileSync(manifest, JSON.stringify(data, null, 2) + '\n')
  }
  writeFileSync(marker, JSON.stringify({ version: 1, automation: true }) + '\n')
}
