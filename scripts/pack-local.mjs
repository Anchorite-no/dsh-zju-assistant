// 本地安装用的两个包：dsh-zju-campus（实现）和 dsh-zju-assistant（组合层）。
//
// 发布到 npm 时组合包依赖的是 registry 上的 dsh-zju-campus@0.1.2；本地装到
// DSH（包括 dsh-go）时，要把这条依赖改成本机上的 tgz 路径，否则 pnpm 会去
// registry 拉一份没有本地改动的实现包。这里生成的是这种本地变体，文件末尾带
// `-local`，不会和发布产物混淆。
//
// 用法：
//   node scripts/pack-local.mjs [--target /root/workspace] [--out <目录>]

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
const option = name => {
  const at = args.indexOf(name)
  return at >= 0 ? args[at + 1] : undefined
}

const target = option('--target') ?? '/root/workspace'
const out = path.resolve(option('--out') ?? root)
const version = JSON.parse(fs.readFileSync(path.join(root, 'plugin', 'package.json'), 'utf8')).version

const campusName = `dsh-zju-campus-${version}.tgz`
const bundleName = `dsh-zju-assistant-${version}-local.tgz`

console.log(`packing ${campusName}`)
execFileSync('npm', ['pack', './plugin', '--pack-destination', out], { cwd: root, stdio: 'inherit' })

// package.json 里写的是手机 guest 里的绝对路径，pnpm 会直接从这个文件装。
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-zju-bundle-'))
try {
  fs.cpSync(path.join(root, 'plugin', 'bundle'), staging, { recursive: true })
  const manifestPath = path.join(staging, 'package.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  {
    manifest.dependencies = { ...manifest.dependencies, 'dsh-zju-campus': `file:${target}/${campusName}` }
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`packing ${bundleName} (dsh-zju-campus -> file:${target}/${campusName})`)
  execFileSync('npm', ['pack', staging, '--pack-destination', out], { cwd: root, stdio: 'inherit' })
  // npm 按包名+版本命名，换成带 -local 的目标名。
  const packed = path.join(out, `dsh-zju-assistant-${version}.tgz`)
  if (fs.existsSync(packed)) fs.renameSync(packed, path.join(out, bundleName))
} finally {
  fs.rmSync(staging, { recursive: true, force: true })
}

console.log(`\n两个包在 ${out}：\n  ${campusName}\n  ${bundleName}`)
console.log(`安装时先把两个包放到 ${target}，再装组合包：`)
console.log(`  dsh plugin --profile web add ${target}/${bundleName}`)
