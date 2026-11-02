/**
 * 把 client/ 打成引擎能加载的单个文件 lib/client.js，做法和 ui/build.mjs 一样：
 * CommonJS 包在 window.__ModuleLoader__.load 的工厂函数里，页面已经有的共享模块走注入的 require。
 * 用法：node plugin/build.mjs
 */
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const id = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).name

/** 页面已经加载好的共享模块，不能打进包里（和 ui/build.mjs 的 SHARED 是同一份）。 */
const SHARED = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

await build({
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
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports; } });' },
  logLevel: 'info',
})
