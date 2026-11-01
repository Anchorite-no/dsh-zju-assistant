import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
const { nodeRuntimePath } = createRequire(import.meta.url)('../desktop/node.cjs')
const { checkRuntimeDependencies, CORES } = createRequire(import.meta.url)('./runtime-deps.cjs')

test('打包检查拒绝遗漏的 Core 依赖，也不借用成品之外的父目录依赖', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-runtime-check-')), app = path.join(root, 'app')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const put = (file, value = '') => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value) }
  for (const core of ['', ...CORES]) put(path.join(app, core, 'package.json'), JSON.stringify({ name: core || 'app', dependencies: core === 'core/zju' ? { parser: '1' } : {} }))
  for (const pkg of ['sharp', '@deepseek-ai/libreoffice-kit', 'ffmpeg-static']) put(path.join(app, 'node_modules', pkg, 'package.json'), JSON.stringify({ name: pkg }))
  for (const file of ['ui/lib/client.js', 'build/licenses/NODE-LICENSE.txt', 'core/learn/engine/vendor/node_modules/gsap/dist/gsap.min.js', `node_modules/ffmpeg-static/${process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'}`]) put(path.join(app, file))
  put(path.join(root, 'node_modules/parser/package.json'), '{"name":"parser"}')
  assert.throws(() => checkRuntimeDependencies(app), /core\/zju → parser/)
  put(path.join(app, 'core/zju/node_modules/parser/package.json'), '{"name":"parser"}')
  put(path.join(root, nodeRuntimePath()))
  assert.throws(() => checkRuntimeDependencies(app), /node_modules/)
  put(path.join(app, nodeRuntimePath()))
  assert.ok(checkRuntimeDependencies(app).packages >= 4)
})
