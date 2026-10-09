// 把外部库做成单个浏览器文件，放进这一集的 lib/；打包时它们排在场景前面，场景里直接用全局名。
//   node engine/lib.mjs lessons/<主题>/film gsap three                 常用的两个，全局名是 gsap 和 THREE
//   node engine/lib.mjs lessons/<主题>/film <包名或入口文件>=<全局名>     别的库；或者自己写一个入口文件，把要用的东西 export 出来（比如 three 再带上几个 addons）
// 库装在 engine/vendor 下：npm install --prefix engine/vendor <包名>
import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const modules = join(dirname(fileURLToPath(import.meta.url)), 'vendor', 'node_modules');
const [film, ...wants] = process.argv.slice(2);
if (!film || !wants.length) { console.error('用法: node engine/lib.mjs lessons/<主题>/film gsap three [包名或入口文件=全局名 ...]'); process.exit(1); }
const out = join(resolve(film), 'lib'), KNOWN = { three: 'THREE' };
mkdirSync(out, { recursive: true });
const said = file => console.log(`${file}  ${(statSync(file).size / 1024).toFixed(0)} KB`);
for (const want of wants) {
  const [what, name = KNOWN[what]] = want.split('=');
  if (what === 'gsap') { const file = join(out, 'gsap.js'); copyFileSync(join(modules, 'gsap', 'dist', 'gsap.min.js'), file); said(file); continue; }     // GSAP 自带浏览器版，全局名 gsap
  if (!name) { console.error(`${what}：要写成 ${what}=全局名`); process.exit(1); }
  const file = join(out, basename(what).replace(/\.m?js$/, '') + '.js'), own = existsSync(what);
  createRequire(join(modules, 'x.js'))('esbuild').buildSync({
    ...(own ? { entryPoints: [resolve(what)] } : { stdin: { contents: `export * from ${JSON.stringify(what)};`, resolveDir: modules } }),
    bundle: true, format: 'iife', globalName: name, minify: true, target: 'es2020', legalComments: 'none', nodePaths: [modules], outfile: file, logLevel: 'warning',
  });
  said(file);
}
