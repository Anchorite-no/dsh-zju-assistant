/**
 * 把 client/ 打成引擎能加载的单个文件 lib/client.js。
 * 格式照上游 packages/client/tsdown.client.ts：CommonJS 包在
 * window.__ModuleLoader__.load 的工厂函数里，共享模块走注入的 require。
 * 用法：node ui/build.mjs         只构建一次
 *       node ui/build.mjs --app   构建、打开应用，并在应用开着时监听改动（改完约一秒生效）
 */
import { context } from 'esbuild'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { engineFiles, engineStamp } from './profile/stamp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const id = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).name

/**
 * 页面里 import 'campus:engine-stamp' 得到的是这次构建时引擎侧代码的指纹（见 profile/stamp.mjs）。
 * 引擎侧的文件算作它的来源，监听构建时这些文件一变也会重新构建，指纹跟着变。
 */
const engineStampModule = {
  name: 'campus-engine-stamp',
  setup(build) {
    build.onResolve({ filter: /^campus:engine-stamp$/ }, args => ({ path: args.path, namespace: 'campus' }))
    build.onLoad({ filter: /.*/, namespace: 'campus' }, () => ({ contents: `export default ${JSON.stringify(engineStamp())}`, loader: 'js', watchFiles: engineFiles() }))
  },
}

/** 页面已经加载好的共享模块（上游 packages/client/web/src/platform.ts 的 PLATFORM_MODULES），不能打进包里。 */
const SHARED = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const builder = await context({
  entryPoints: [join(here, 'client', 'index.tsx')],
  outfile: join(here, 'lib', 'client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: SHARED,
  loader: { '.css': 'text' },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [engineStampModule],
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports; } });' },
  logLevel: 'info',
})

await builder.rebuild()

if (process.argv.includes('--app')) {
  await builder.watch()
  // 在 Node 里 require('electron') 得到的是可执行文件的路径。
  const electron = createRequire(import.meta.url)('electron')
  const app = spawn(electron, ['.'], { cwd: join(here, '..'), stdio: 'inherit' })
  app.once('exit', async (code) => {
    await builder.dispose()
    process.exit(code ?? 0)
  })
} else {
  await builder.dispose()
}
