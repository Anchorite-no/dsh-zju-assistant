import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ensureCampusProfile, SCHEDULE_BUNDLE } from './profile.mjs'

test('新安装默认启用自动化；之后手动关闭不会被下次启动重置', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-defaults-'))
  t.after(() => { assert.ok(path.resolve(home).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(home, { recursive: true, force: true }) })
  ensureCampusProfile(home)
  const file = path.join(home, 'profiles', 'campus', 'package.json')
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(data.dsh.profile.bundles.filter(name => name === SCHEDULE_BUNDLE).length, 1)
  data.dsh.profile.bundles = data.dsh.profile.bundles.filter(name => name !== SCHEDULE_BUNDLE)
  fs.writeFileSync(file, JSON.stringify(data))
  ensureCampusProfile(home)
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).dsh.profile.bundles, data.dsh.profile.bundles)
})
