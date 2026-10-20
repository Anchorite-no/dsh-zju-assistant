# 架构与接口

更新：2026-10-16。验证范围见 [verification.md](verification.md)。

## 一条主线

微信读书负责查找公众号和文章链接，统一文章入口负责浏览器取文。

主流程架构图集中维护在 [README](../README.md#架构)。调用顺序为 `cli.ts → sources.ts → article.ts → browser/runtime.ts → article/page.mjs`，具体模块边界如下。

公众号只使用微信读书，不提供本地来源或回退。

保留链接站点，不强制将微信读书链接改成微信原文。list 返回的两种 `url` 都能直接交给 read/download，均通过浏览器导航取 HTML；Web 模块不再导出正文获取方法。

## 模块

| 文件 | 职责 |
|---|---|
| scripts/weread.ts | 入口：解析命令，输出 JSON，结束时关闭浏览器 |
| lib/cli.ts | 6 个命令和它们的参数 |
| lib/sources.ts | 微信读书查找；list、read、track、new 四个操作；跟踪名单 tracked.json |
| lib/web.ts | 微信读书列表请求（续期、验证码重发）、公众号查找、文章列表、登录 |
| lib/article.ts | 链接规范化、统一取文入口、HTML → Markdown、导出文件和图片 |
| lib/article/page.mjs | 浏览器导航、读取 HTML、按页面调用对应验证码处理器、恢复后继续提取 |
| lib/browser/runtime.ts | 启动自带 Electron，或连到宿主应用提供的浏览器；经管道调用它 |
| lib/browser/service.cjs、preload.cjs | 浏览器能力本体：会话、窗口、请求、登录与授权回执桥；不依赖是谁的 Electron |
| lib/browser/host.cjs | 自带 Electron 的入口：把 service.cjs 装进去，接上 runtime.ts 开的管道 |
| lib/captcha/index.mjs | 集中的站点验证码处理：微信原文使用原页面组件，微信读书创建官方组件并返回票据 |
| lib/captcha/electron.mjs | 验证码模块：观察官方 SDK、裁题图、输入答案、取回票据 |
| lib/captcha/recognizer.mjs | 把题目交给识别模型 |
| lib/config.ts、errors.mjs | .env、数据目录、识别模型配置；统一错误类型 |

## Web 来源

登录状态只保存在自带浏览器的配置目录里，Node 一侧不接触 Cookie。web.ts 的 request 负责列表请求：登录过期时续期一次再重发；返回 -2041 时调用共享验证码模块，把票据放进 `x-wr-ticket`、`x-wr-randstr` 重发同一页；其余错误直接报出。

文章页面由 article/page.mjs 负责。微信读书正文使用真实页面导航；若响应是 text/plain，则取出浏览器显示的原始 HTML 文本。遇到 -2041 后调用同一个微信读书处理器，再用 loadURL 的请求头携带票据重新加载原链接。登录失效也只续期一次。

验证失败时命令报错结束，不保留任务；重新执行命令会重新请求并拿到新题。

公众号按名称查找时先看书架，书架没有匹配再用搜索。已跟踪的公众号用 biz 直接换算出 bookId，不再查找。

## 自带浏览器

固定依赖 Electron 44.0.0，装在项目自己的 node_modules 里。命令第一次需要 Web 列表或任意文章正文时启动，列表和直接链接共用这个进程，结束时关闭并把 Cookie 落盘。Electron 是 GUI 程序，标准流不可靠，所以 Node 开一条随机命名的管道，双方一行一条 JSON；`.env` 里的密钥不进入浏览器进程的环境变量，识别模型配置经管道传入主进程，不进入网页。一个配置目录同时只允许一个进程，冲突时返回 `browser_busy`。

请求代发仅允许 weread.qq.com；文章导航仅接受两站的已支持文章链接。普通正文及已配置模型的自动验证窗口隐藏，扫码登录或未配置模型时显示窗口。窗口内禁止打开新窗口，主框架导航限制在微信读书、微信原文和微信登录站点。微信读书验证码回执经 preload 桥送回，主进程核对当前窗口、主框架和来源。

## 被应用托管

应用自己就是 Electron 时不必再起一个：主进程引用 `lib/browser/service.cjs`，把自己的 `BrowserWindow`、`ipcMain` 和一个会话交给 `createBrowserService`，再开一条管道，每来一条连接调一次 `serve`。管道地址经 `WEREAD_BROWSER_ENDPOINT` 交给命令，runtime.ts 看到它就连过去，不启动自带的 Electron。两头说的是同一种话：一行一条 JSON，`{id, action, input, interactive}` 对 `{id, result}` 或 `{id, error}`。

托管和独立运行的差别都在 `createBrowserService` 的三个可选参数里：`parent` 让验证和登录窗口挂在应用窗口下面；`vision` 用应用自己的识别模型配置替换命令带来的，密钥不必进命令的环境；`guard` 在每次调用前执行，应用里这项功能关着时抛 `plugin_disabled`。命令这一头另有 `WEREAD_DISABLED=1`：设了就一条命令都不执行。

宿主一直开着，所以和独立运行有三处不同。可以同时有几条命令连着，用到窗口的调用排队，一次一个，不再有 `browser_busy`。连接断开时它没做完的调用被打断，窗口收掉。命令带 `interactive: false`（`WEREAD_INTERACTIVE=0`，应用后台定时检查时用）时不开任何窗口：要扫码返回 `login_required`，要验证返回 `verification_required`，由应用在页面上请用户处理后再执行一次。

为宿主加的三条命令独立运行时一样可用。`list` 不带 `--account` 时返回跟踪名单里每个号最近的文章，不动 new 的已读记录；一个号读不到只影响它自己，一个来源整体用不了时记在 `sources` 里，这次不再逐个重试。`accounts` 给出名称对应的候选，不改任何记录。`login --check` 和 `logout` 只读写浏览器里的登录状态。

## 验证码模块

所有站点的验证码入口、识别和输入代码集中在 lib/captcha，作为文章获取和列表请求可调用的共享能力。ElectronCaptcha 不依赖 Electron 包和项目其他模块，由宿主传入 WebContents、回执桥和识别器。

微信原文在导航之前启用观察，保持原页面的 appid、sid、SDK 回调和 Check 请求。需要时点击页面已有的验证按钮，腾讯成功响应只结束自动输入，必须等原页面恢复到正文才能完成取文。微信读书处理器创建官方组件并返回票据，由原请求或原页面消费。两个站点不互用验证上下文。

微信读书首页的 Nuxt 桌面页面会延迟初始化 OverlayScrollbars，期间重新插入 body 子节点会重载已存在的验证码 iframe。处理器先等根节点出现 `data-overlayscrollbars` 标记，再创建验证码；正文文本页跳过该等待。等待上限 10 秒，未就绪则明确报错，不提交旧坐标，也不通过改写 SDK 来阻止站点初始化。

题目、TDC、PoW、答案编码和提交全部由官方 TCaptcha.js 完成，模块不生成协议参数。它经 CDP 观察 SDK 的网络响应，取得题目配置和 SDK 实际加载的图片、音频字节，按配置里的区域用 Canvas 裁出题图；识别器返回选项编号、按顺序的原图坐标、缺口横坐标或语音数字；模块按真实布局把原图坐标换算成页面坐标，用 CDP 鼠标和键盘事件输入。换题或布局变化后不使用旧坐标。

支持六图/九宫格选图、文字和图形顺序点选、单拼块水平滑块、语音数字，SDK 免交互放行时无需识别模型；不认识的题型返回 `unsupported_verification`。服务端要求继续答题（30/51）时最多三轮。没有配置识别模型时等用户在窗口里完成。

删掉旧分步流程的 prepare/task/recognize、pending 采集缓存、采集任务 UUID 和独立过期时间；单次 run 内直接采集、识别、校验布局、提交。保留 SDK 回执的当前操作标识和题目版本检查，它们防止跨验证接收票据或在换题后点击旧坐标。导航、页面脚本和验证统一受关闭信号与约五分钟超时约束，结束时移除监听并关闭窗口。

题型结构的细节（prehandle 与 getsig 的两种返回结构、SDK 追加的 tkid、滑块透明边距换算）见代码注释和 [历史验证码分析](history/captcha-analysis.md)；该历史文档中的阶段结论以当时为准。第三方依据见根目录 THIRD_PARTY_NOTICES.txt 和本目录 Tencent-LICENSE。

## 跟踪

tracked.json 记录每个公众号在微信读书见过的文章标识。首次只建立基线，new 全部成功后写回，中途失败则不推进进度。
