import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
const { checkRuntimeDependencies, CORES } = createRequire(import.meta.url)('./runtime-deps.cjs')

/** 一份除了随包的 Node 什么都齐的成品；ffmpeg 是给 platform 这种系统的那一份。 */
function app(t, platform) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-runtime-check-')), dir = path.join(root, 'app')
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const put = (file, value = '') => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value) }
  for (const core of ['', ...CORES]) put(path.join(dir, core, 'package.json'), JSON.stringify({ name: core || 'app', dependencies: core === 'core/zju' ? { parser: '1' } : {} }))
  for (const pkg of ['sharp', '@deepseek-ai/libreoffice-kit', 'ffmpeg-static', '@deepseek-ai/dsh-client-shortcuts']) put(path.join(dir, 'node_modules', pkg, 'package.json'), JSON.stringify({ name: pkg }))
  for (const file of ['ui/lib/client.js', 'build/licenses/NODE-LICENSE.txt', 'core/learn/engine/vendor/node_modules/gsap/dist/gsap.min.js', `node_modules/ffmpeg-static/${platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'}`]) put(path.join(dir, file))
  put(path.join(dir, 'core/zju/node_modules/parser/package.json'), '{"name":"parser"}')
  return { root, dir, put }
}

test('打包检查拒绝遗漏的 Core 依赖，也不借用成品之外的父目录依赖', t => {
  const windows = { platform: 'win32', arch: 'x64' }
  const { root, dir, put } = app(t, 'win32')
  fs.rmSync(path.join(dir, 'core/zju/node_modules'), { recursive: true })
  put(path.join(root, 'node_modules/parser/package.json'), '{"name":"parser"}')
  assert.throws(() => checkRuntimeDependencies(dir, windows), /core\/zju → parser/)
  put(path.join(dir, 'core/zju/node_modules/parser/package.json'), '{"name":"parser"}')
  put(path.join(root, 'node_modules/node-win-x64/bin/node.exe'))
  assert.throws(() => checkRuntimeDependencies(dir, windows), /node-win-x64[\\/]bin[\\/]node\.exe/)
  put(path.join(dir, 'node_modules/node-win-x64/bin/node.exe'))
  assert.ok(checkRuntimeDependencies(dir, windows).packages >= 4)
})

test('macOS 的成品要的是那种芯片自己的 Node 和不带 .exe 的 FFmpeg', t => {
  const { dir, put } = app(t, 'darwin')
  // 带的是 Intel 的 Node，查 Apple 芯片的成品不算数。
  put(path.join(dir, 'node_modules/node-darwin-x64/bin/node'))
  assert.throws(() => checkRuntimeDependencies(dir, { platform: 'darwin', arch: 'arm64' }), /node-bin-darwin-arm64\/bin\/node/)
  assert.ok(checkRuntimeDependencies(dir, { platform: 'darwin', arch: 'x64' }).packages >= 4)
  put(path.join(dir, 'node_modules/node-bin-darwin-arm64/bin/node'))
  assert.ok(checkRuntimeDependencies(dir, { platform: 'darwin', arch: 'arm64' }).packages >= 4)
  // 没有随包 Node 的系统和芯片，直接说没有。
  assert.throws(() => checkRuntimeDependencies(dir, { platform: 'win32', arch: 'arm64' }), /win32-arm64 没有随应用提供的 Node 运行时/)
})

test('Mac 的成品要带着引擎的快捷键协议，壳的键盘桥要用它；Windows 用不着', t => {
  const { dir, put } = app(t, 'darwin')
  put(path.join(dir, 'node_modules/node-bin-darwin-arm64/bin/node'))
  fs.rmSync(path.join(dir, 'node_modules/@deepseek-ai/dsh-client-shortcuts'), { recursive: true })
  assert.throws(() => checkRuntimeDependencies(dir, { platform: 'darwin', arch: 'arm64' }), /Mac 键盘桥 → @deepseek-ai\/dsh-client-shortcuts/)
  const windows = app(t, 'win32')
  windows.put(path.join(windows.dir, 'node_modules/node-win-x64/bin/node.exe'))
  fs.rmSync(path.join(windows.dir, 'node_modules/@deepseek-ai/dsh-client-shortcuts'), { recursive: true })
  assert.ok(checkRuntimeDependencies(windows.dir, { platform: 'win32', arch: 'x64' }).packages >= 4)
})
