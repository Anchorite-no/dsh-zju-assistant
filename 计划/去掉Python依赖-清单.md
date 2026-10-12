# 去掉 Python 依赖：清单

2026-10-12 和用户逐条确认过的。做一项勾一项；做完把结果并进 README，这份留作记录。

## 定下来的事

- 现在的模型都能看图，课件不用专门的命令去提取：删掉 `zhiyun trans ppt`。
- 应用里凡是要 Python 的地方都改掉：微信读本机那一步、`zju doc`。（做的时候又查到一处没在清单里的：**体育场馆预约的验证码识别** `tyys venue` 要一套 Python 的识别模型——ddddocr、PaddleOCR，`core/zju/scripts/tyys/captcha.py` 621 行，`tyys venue setup` 用 uv 或 python 建环境。这个没动，要向用户汇报、等他定。除它以外应用里没有功能需要 Python；配音 IndexTTS 本来就没放进来。）
- 引擎自带 LibreOffice（`@deepseek-ai/libreoffice-kit`，已经在安装包里）：看文件长什么样、Office 转 PDF 交给它，不在 `zju doc` 里再包一层。
- `zju doc` 从 8 条缩到 4 条：`text`、`find`、`pdf`、`pages`。
- 微信公众号改成默认关。
- **不做给老用户的兼容**（用户原话：现在用的人很少，不用做 fallback，让代码变复杂了）：升级上来的人微信公众号一律是关的，要自己再打开；`doc` 去掉的命令和格式不留别名。
- FFmpeg 留着随包带。智云不拆、不改默认；转写模型照旧第一次用时自己下。（原来清单里的 D 组取消。）
- 不改版本号、不打包、不提交，等用户说。

## 查到的事实（做的时候要用）

- 应用不带 Python。开发机上的 3.14.6 是用户自己装的（`C:\Program Files\Python314`）。
- 应用自己的 Node 是 Electron 里那份（24.18.1），内置 `node:sqlite`（有 `DatabaseSync.deserialize`）和 `zlib.zstdDecompressSync`，试过。
- `zju doc` 现在在真实数据目录里是没装好的（`doc check` 返回 `ready:false`）：它要 `python -m venv` 加联网装包。
- 引擎的 Office 引擎：`node node_modules/@deepseek-ai/libreoffice-kit/lib/cli.js capabilities|convert|render|recalculate`。
  转换：doc/docx/odt → pdf/docx/odt/txt；xls/xlsx/ods → pdf/xlsx/ods/csv；ppt/pptx/odp → pdf/pptx/odp。
  渲染成 PNG：上面这些加 pdf（PDF 用 PDFium）。不支持 RTF、WPS。本机试过 docx → pdf → png；PPT 没有样本，没试。
- 引擎给模型用的 office 技能（`dsh-skill-office`）在我们的组合里没挂，助手现在不知道有这个引擎；只有右边栏预览在用（`office-to-pdf`）。
- 根目录 `node_modules` 里已经有 `sharp`（引擎的依赖），图片转正、换格式可以用它。
- npm 源连得上：`pdf-lib` 1.17.1（MIT），`pdfjs-dist` 6.4.299（Apache-2.0，带中文 PDF 要的 cMap）。不用 `mupdf`（AGPL）。
- `core/zju` 没有测试目录；应用这边的测试在 `ui/profile`、`ui/client/trace`、`desktop`。
- 校园命令单独一条执行时不进沙箱（`ui/profile/permissions.mjs` 的 `TRUSTED_SCRIPTS`）；引擎的 Office 命令行是助手自己起的，在不在沙箱里跑得起来要实测。

## 清单

### C. 微信公众号默认关

- [x] `ui/profile/catalog.mjs`：`campus.wechat` 加 `optIn`。
- [x] 壳读开关的地方（`desktop/weread.cjs`）跟着认「默认关」。
- [x] 测试跟着改：`plugins.test.mjs`、`host.test.mjs`、`wechat.test.mjs`、`feed.test.mjs`、`desktop/weread.test.mjs`。

### A. 删掉 `zhiyun trans ppt`

- [x] 删 `core/zju/lib/zhiyun/courseware.ts`、`core/zju/scripts/zhiyun/extract.py`。
- [x] `local-cli.ts`：去掉 `trans ppt`，`setup` / `check` 去掉 `ppt` 组件；`setup.ts` 去掉 Python 那一段。
- [x] 说明：`core/zju/SKILL.md`、`references/zhiyun.md`、`lib/zhiyun/README.md`。
- [x] 重新生成命令表：`node core/zju/scripts/command-docs.ts`（看它怎么用）、`node ui/client/trace/gen-commands.mjs`；`ui/client/trace/steps.ts` 删掉对应的名字。
- [x] 注意别误伤：下载课件文件的 `download --kind ppt`、资料种类里的 `courseware` 和这条命令无关。

### B. 微信读本机改用 Node

- [x] `core/weread/scripts/local/metadata.py`（89 行）改写成 `metadata.mjs`：从标准输入读解密后的库 → `node:sqlite` 载入内存 → zstd 解开 → 挑出公众号文章 → 输出 JSON。
- [x] `snapshot.cs`、`read-local.ps1`：起的程序从 Python 换成 Node（`local.ts` 把 `process.execPath` 传过去；应用里它是 Electron，环境里的 `ELECTRON_RUN_AS_NODE` 会跟着传下去）。
- [x] `local.ts`：去掉 `WEREAD_PYTHON`，`runtime_missing` 的说法改掉；`ui/client/WechatSettings.tsx` 里「要先装好 Python 3.14 才能读」那一句去掉或改掉。
- [x] 说明：`core/weread/SKILL.md`、`references/runtime.md`、`README.md`、`dev/` 里提到 Python 的地方。
- [x] 测试：`core/weread/tests/local-runtime.test.ts` 等跟着改，`npm run test:weread` 通过。
- [x] 真实验证：微信开着，在本机对同一份消息库跑旧的（Python，从 git 里取出来放到临时目录）和新的，比对输出一致。只比条数和指纹，不把内容打出来。

### F. `zju doc` 缩到 4 条，不用 Python

- [x] `core/zju/package.json` 加 `pdfjs-dist`、`pdf-lib`，`npm install --prefix core/zju`。
- [x] `text`：本地文件或链接（下载照旧：教务网会话、校内和 CC98 走 WebVPN）。PDF 用 pdf.js 逐页取文字；Word、Excel、PPT 先用引擎转成 PDF 再取；HTML、纯文本照旧。全文另存 Markdown、前两万字内联，这些输出的样子不变。
- [x] `find`：pdf.js 逐页找关键词，返回页码和前后文。
- [x] `pdf`：图片（`sharp` 按拍摄方向转正、统一成能嵌的格式）、Word（引擎转）、PDF 按顺序合成一份，A4 和原图两种页面；`pages`：取页。用 `pdf-lib`。
- [x] 删 `render`、`images`、`check`、`setup`，删 `core/zju/scripts/doc/*.py`、`ZJU_DOC_PYTHON`、`ZJU_SOFFICE`。
- [x] RTF、WPS 不再支持，照实报错。
- [x] 说明：`core/zju/SKILL.md`（第 63–73 行那张表）、`lib/doc/README.md`、命令表重新生成、`steps.ts`。
- [x] 测试：给 `core/zju` 加 `tests/doc.test.ts`，根目录加一条 `test:core`；测试不随应用打包。
- [x] 打包：`package.json` 的 `build.files` 里排除 `pdfjs-dist` 用不到的部分（阅读器界面），量一下多出来多少。

### G. 把引擎的 Office 命令行交给助手

- [x] 在模型的上下文里加一句（路径随安装位置变，由引擎侧算出来）：要看文件长什么样（课件、扫描件、版面），用它把页面渲染成 PNG 再用 `read_image` 看；Office 转 PDF 也用它。
- [x] 实测它在默认的「工作区内修改」沙箱里能不能跑（它要起一个子进程）。跑不了就把它也列进不进沙箱的名单（参数只是文件路径）。
- [x] `core/AGENT.md`、`core/zju/SKILL.md` 里读文档的写法对上。

### E. 收尾

- [x] `npm run typecheck`、`npm run typecheck:core`、`test:trace`、`test:profile`、`test:plugins`、`test:credentials`、`test:weread`、新加的 `test:core` 全过。
- [x] README：「校园插件」「微信公众号」「智云的转写和文件落点」几节，加上读文档这一块怎么变的。
- [x] 真实状态下测（用真实的数据目录和账号）：微信本机读取；让助手读一份 PDF、一份 Word、一份 PPT（取文字和看图各一次）；合成一份 PDF、取页。
- [x] 向用户汇报；不提交。

## 进度记录

（做的时候往下写：做到哪了、临时的决定、没解决的问题。）

- C 做完：`catalog.mjs` 标了 `optIn`；壳的 `guard` 改成「`plugins.json` 的 `enabled` 里有它才算开」；`test:profile` 104、`test:plugins` 49 通过。
- A 做完：删了 `courseware.ts`、`scripts/zhiyun/extract.py`，`setup` / `check` 去掉 `ppt`；`command-docs.ts` 里手写的两句也改了；命令表重新生成过（164 条）；`typecheck:core`、`test:trace` 通过。F 做完以后命令表还要再生成一次。
- B 做完，只差真实比对：`metadata.mjs` 用 `htmlparser2`（XML 模式）和 `entities`（都加进了 `core/weread/package.json`）；PowerShell 和 C# 那两步改成起 Node（带 `--no-warnings`），`local.ts` 传 `process.execPath`。`test:weread` 46 项通过。用一份造出来的库（13 个号、98 篇，含表情名、全角、CDATA、坏 XML、怪链接）对照旧的 Python 脚本，输出完全一致。**真实比对没做成：当时微信没开着（`wechat_not_running`）。** 微信开着以后跑：旧脚本在临时目录 `scratchpad/oldlocal`（从 git 的 HEAD 里取），比对脚本 `scratchpad/compare.mjs`；临时目录没了就照清单里写的重新取一遍。
- B 的真实比对做了（用户把微信打开以后）：旧的 Python、系统的 Node、应用自己的 Node（Electron 当 Node）三种跑法，94 个号、3793 篇，指纹一样；`weread.ts accounts --source local` 用应用的 Node 走完整入口也通。过程中发现一处：Windows PowerShell 5.1 用 `&` 起带窗口的程序（应用里的 Node 就是）时不等它、也接不到输出，原来放在 `read-local.ps1` 里的自检因此总是失败（`runtime_missing`）；自检挪进了 `local.ts`（在进程里查 `node:sqlite` 和 zstd），C# 那一步用管道起它没有问题。
- F 进行中：`core/zju` 装了 `pdfjs-dist` 6.4.299、`pdf-lib` 1.17.1（装的时候带 `--omit=optional`，不要 `@napi-rs/canvas`）。pdf.js 在两种 Node 上都取得到中文；它导入时往 `console.warn` 写三句缺 canvas 的警告，要压掉；`cMapUrl` 要用正斜杠结尾的路径。
- F 的代码写完并跑通：`core/zju/lib/doc/` 现在是 `index.ts`（下载照旧 + 取文字的总入口）、`pdf.ts`（pdf.js 取文字和找页、pdf-lib 合成和取页、sharp 处理图片）、`office.ts`（引擎的 Office 库转 PDF / 纯文本，先拷进临时文件夹换成它认识的扩展名）、`sniff.ts`（按文件头认格式）、`cli.ts`（四条命令）。`scripts/doc/` 删了。命令行实测过：PDF、docx（中文文件名、扩展名不对的）、html、图片、rtf（照实说不支持）、find、pdf 合成（jpg 带方向 + 透明 png + docx + pdf）、pages、越界报错、`doc render` 报未知命令。`typecheck:core` 通过。**还没做**：说明（SKILL.md 第 63–73 行、`lib/doc/README.md`）、命令表重新生成、`steps.ts`、测试文件、打包排除项。
- G 的主体做完：引擎的 Office 命令行在默认的「工作区内修改」沙箱里实测能跑（隔离引擎里：渲染 PDF、渲染 docx、docx 转 PDF 各约 1 秒；「仅可查看」下写不了输出，报的是标准的沙箱拒绝），所以**不用**列进免沙箱名单。它的参数：`render --input 文件 --output-dir 新文件夹 --pages 1,2,3 [--dpi 144]`（页码只认逗号分开，不认 1-3），`convert --input 文件 --output 结果.pdf`。新加 `ui/profile/office.mjs`，`host.mjs` 里登记了上下文段 `campus-files`（order 27），`host.test.mjs` 加了一条断言。**还没做**：SKILL.md 读文档那几行、`lib/doc/README.md`、命令表、`steps.ts`、`core/zju/tests/doc.test.ts` 和 `test:core`、打包排除项、README、真实状态测试。
- F 的说明改完：`core/zju/SKILL.md`（读文档两行）、`lib/doc/README.md`（重写）、`core/zju/README.md`、`references/cc98.md`、`lib/cc98/api.ts` 里的一句提示；`steps.ts` 删了四个名字；命令表重新生成（160 条），`test:trace` 35 项通过。**还没做**：`core/zju/tests/doc.test.ts` 和 `test:core`、打包排除项、根目录 README、真实状态测试、最后的汇报（要提场馆验证码那一处 Python）。
- F、G 全部做完：`core/zju/tests/doc.test.ts` 5 项通过，根目录加了 `npm run test:core`；`package.json` 的 `build.files` 排除了 `pdfjs-dist` 的 `build`、`web`、`legacy/web` 和 `pdf-lib` 的 `dist`、`es`、`src`、`ts3.4`，以及 `core/zju/tests`（**这几条排除没有打包验证过**，用户说先不打包）。剩下 E：全部检查、根目录 README、真实状态测试、汇报。
- E 做完（2026-10-12）：两项类型检查和六组测试全过（`test:trace` 35、`test:profile` 104、`test:plugins` 49、`test:credentials` 4、`test:weread` 46、`test:core` 5）；根目录 README 加了「读文档」一节和微信公众号下「默认关，读本机不再要 Python」一小节。
- 真实状态测试的做法和结果：用户自己的应用开着（占着真实的数据目录），所以没有再开一个窗口，改成只起引擎（`desktop/host.mjs`，隔离的数据目录，真的模型和 API Key）。结果：微信公众号默认关、关着时壳拒绝读本机、打开以后经应用自己的 Node 读到 94 个号；让助手读一份老 `.ppt` 的文字（14 页）、看一份截图 `.pptx` 的第 5 页（渲染 + `read_image`），13 秒答完、内容对。PDF、Word、合成、取页是在命令行上跑的，没有在对话里再让助手各做一次。测试用的进程和目录都清掉了。
- **没验证的**：Excel 走引擎；`build.files` 的排除（没打包）；装好的应用里从 `core/zju` 引用根目录的 Office 引擎和 sharp；在用户真实的数据目录里走一遍（要用户重开应用，并在插件页把微信公众号重新打开）。
- **留给用户定的**：体育场馆预约的验证码识别（`zju tyys venue`，`core/zju/scripts/tyys/captcha.py`）还要 Python，这次没动。
- 场馆验证码定了也做了（2026-10-12，另一个会话里；用户原话：之前需要模型是因为没有 AI，和微信的那个一样把验证码交给 AI 即可）：`core/zju/lib/tyys/captcha.ts` 重写成调 DeepSeek 的 `deepseek-flash`，Key 用密钥文件里对话的那个；删了 `scripts/tyys/captcha.py`、`tyys venue setup`、`tyys venue check`（没留别名），`module.json`、`steps.ts`、命令表（158 条）、三处说明和根目录 README 跟着改；加了 `core/zju/tests/tyys-captcha.test.ts`。`typecheck:core`、`test:core` 11、`test:trace` 40 通过。照搬微信那边的问法不行（真实校验 6 道过 3 道），改成放大三倍、先认全图里的字、认不齐换题以后，取 9 道 8 道作答全过；各种问法的对照在 `core/zju/lib/tyys/README.md` 的「验证码识别」。**没验证的**：改完以后的一次真实预约；装好的应用里引用根目录的 js-yaml。**要用户知道的**：只登录了 ChatGPT、没填 DeepSeek Key 的人约不了要验证码的场地（这台机器上装好的那一份应用的密钥文件里现在就没有 DeepSeek Key）；测试时碰到过场馆的取题次数限制，约六分钟后恢复。
- 上一条里「只认 DeepSeek Key」的限制去掉了（2026-10-12，用户定：走引擎的模型服务，登录 ChatGPT 的也要能用）：命令不再自己调 DeepSeek、不再读密钥文件，改成经一条管道找引擎，用用户现在选的那个模型问。新加 `ui/profile/vision.mjs`（引擎这头听管道）和它的测试；`ui/profile/model.mjs` 的 `askModel` 能带一张图（存进引擎的附件库再引用，问完删掉）；`desktop/host.mjs` 启动时定下管道地址放进 `CAMPUS_MODEL_ENDPOINT`；`core/zju/lib/tyys/captcha.ts` 改成连这条管道，没有这个环境变量时（不在应用里跑）报 `DEPENDENCY_MISSING`。起了一个隔离的引擎（DeepSeek）复测：存下的 20 道题两遍，作答的里面各 15 道在 10 像素内；真实题目 4 道，3 道作答全过、1 道换题；问完附件库里不留图。**没验证的**：GPT 认得准不准（这台机器没有登录着的 ChatGPT 账号）；真实预约；打开的应用里命令读不读得到那个环境变量；装好的应用。
- 没有改版本号、没有打包、没有提交。
