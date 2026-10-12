// 把外部库做成单个浏览器文件，放进这一集的 lib/；打包时它们排在场景前面，场景里直接用全局名。
//   node engine/lib.mjs lessons/<主题>/film gsap three                 常用的两个，全局名是 gsap 和 THREE
//   node engine/lib.mjs lessons/<主题>/film <包名或入口文件>=<全局名>     别的库；或者自己写一个入口文件，把要用的东西 export 出来（比如 three 再带上几个 addons）
// gsap 和 three 是引擎自带的（engine/vendor）。别的库装在这一集自己的 build/vendor 下：npm install --prefix lessons/<主题>/film/build/vendor <包名>
// 不往 engine/vendor 里装：引擎的目录是应用装着的地方，装在 C:\Program Files 下面写不进去，写得进去时升级也会把它整个换掉。
import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const modules = join(dirname(fileURLToPath(import.meta.url)), 'vendor', 'node_modules');
const [film, ...wants] = process.argv.slice(2);
if (!film || !wants.length) { console.error('用法: node engine/lib.mjs lessons/<主题>/film gsap three [包名或入口文件=全局名 ...]'); process.exit(1); }
// 这一集的目录要已经在：目录给错了（比如当前目录不是讲解目录）时，不在别处新建一个。
if (!existsSync(resolve(film))) { console.error(`找不到这一集的目录：${resolve(film)}\n在讲解目录里运行，或者把这一集的目录写成完整路径。`); process.exit(1); }
const out = join(resolve(film), 'lib'), own = join(resolve(film), 'build', 'vendor', 'node_modules'), KNOWN = { three: 'THREE' };
mkdirSync(out, { recursive: true });
const said = file => console.log(`${file}  ${(statSync(file).size / 1024).toFixed(0)} KB`);
for (const want of wants) {
  const [what, name = KNOWN[what]] = want.split('=');
  if (what === 'gsap') { const file = join(out, 'gsap.js'); copyFileSync(join(modules, 'gsap', 'dist', 'gsap.min.js'), file); said(file); continue; }     // GSAP 自带浏览器版，全局名 gsap
  if (!name) { console.error(`${what}：要写成 ${what}=全局名`); process.exit(1); }
  const file = join(out, basename(what).replace(/\.m?js$/, '') + '.js'), entry = existsSync(what);
  // 包先在这一集自己装的里面找，再找引擎自带的。
  createRequire(join(modules, 'x.js'))('esbuild').buildSync({
    ...(entry ? { entryPoints: [resolve(what)] } : { stdin: { contents: `export * from ${JSON.stringify(what)};`, resolveDir: modules } }),
    bundle: true, format: 'iife', globalName: name, minify: true, target: 'es2020', legalComments: 'none', nodePaths: [own, modules], outfile: file, logLevel: 'warning',
  });
  said(file);
}
