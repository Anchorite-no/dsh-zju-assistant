# dsh-zju-campus

[ZJU All-in-One Assistant](https://github.com/Anchorite-no/dsh-zju-assistant) 的实现包：校园账号和九个子插件、页面、`zju` 工具和 `zju-campus` 技能，以及它们用到的校园命令（ZJU Core）。

单独装它没有用。请在 [DeepSeek Harness](https://www.deepseek.com/harness/) 的插件页添加 **`dsh-zju-assistant`**，它会把这个包一起装上。

源码、说明和问题反馈都在 https://github.com/Anchorite-no/dsh-zju-assistant 。许可证 GPL-3.0-only。

## 在 dsh-go（手机版）上安装时遇到的问题

2026-11-03 在 HUAWEI Mate 70（CLS-AL00，Android 12，系统 WebView Chrome 114）上，
把本地打出来的 `dsh-zju-plugin-0.1.2-local-calendar-20261103.tgz` 装进 dsh-go 1.0.8
debug 包时遇到的问题，按出现顺序记在这里。

### 1. 安装包缺少组合层，装完什么也看不到

`dsh plugin --profile web add <tgz>` 只把 `dsh-zju-campus` 装成 profile 的一个依赖，
插件的组合层（`plugin/bundle/cordis.patch.yml`，负责插入「校园账号」「课程与学习」
等十行）没有打进 tgz，也没有任何地方声明它。

结果：profile 的 `cordis.patch.yml` 仍是 `[]`，引擎 `--dump-config` 里没有一行 zju，
插件页看不到条目，侧栏也没有「日程表」。

处理：把 `bundle/cordis.patch.yml` 补进安装包，并在包的 `package.json` 里声明
`dsh.bundle.patch`。

### 2. `dsh.bundle.patch` 的字段形状

先写成字符串 `"bundle": "./bundle/cordis.patch.yml"`，引擎报：

```
dsh: skipping profile bundle "dsh-zju-campus":
Error: dsh.bundle.patch must be a file path or a list of file paths
```

正确的形状是对象：

```json
"dsh": { "bundle": { "patch": "./bundle/cordis.patch.yml" } }
```

### 3. 只在 dependencies 里不够，还要被 profile 选中

包已经在 `package.json` 的 `dependencies` 里，`listBundles` 也能看到它（标为未启用），
但引擎只组合 `dsh.profile.bundles` 里列出的包。要让行真正加载，profile 的
`dsh.profile.bundles` 必须包含 `dsh-zju-campus`：

```json
"dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-zju-campus"] } }
```

改完重启引擎，`dsh web --dump-config` 末尾才出现 `# == dsh-zju-campus` 那一段。

### 4. 命令行装的插件不进市场列表，也不能从插件页卸载

用 `dsh plugin add` 装的包没有走插件管理器的登记，插件页里能显示出组合包和组件，
但市场的「已安装」列表里没有它，也没有卸载按钮。卸载只能再来一次
`dsh plugin --profile web remove dsh-zju-campus`，并手动清 profile 的 patch。

### 5. Flutter 插件页只有开关，进不了插件自己的设置页

dsh-go 原生的插件详情页只列出「包含的组件」和开关，点组件行没有反应。
「校园账号」这类由插件客户端渲染的设置页只存在于 DSH 网页界面里，
所以填学号、密码必须先打开网页界面。

### 6. 旧系统 WebView 上网页界面连不上，插件设置页因此打不开

在系统 WebView 为 Chrome 114 的机器上，网页界面一直显示「重新连接中…」，
`/api/remote.mux` 的 WebSocket 握手成功后立刻被关闭。抓到的异常是：

```
TypeError: Promise.withResolvers is not a function        （需要 Chrome 119+）
TypeError: AbortSignal.any is not a function              （需要 Chrome 116+）
```

这两处都是 DSH 客户端启动阶段调用的，失败后实时连接建不起来，插件设置页无法打开。

处理：dsh-go 在网页加载前用 `WebViewCompat.addDocumentStartJavaScript` 注入
`app/assets/web/dsh_web_compat.js`，补上这两个 API（已存在的实现不覆盖）。

这条改动目前只在本地的 dsh-go 工作副本里，没有提交，也没有进任何 release。所以只装这两个
tgz 是不够的：官方 APK 上网页界面仍然连不上，插件设置页仍然打不开。装之前先确认手上的
dsh-go 构建里有这个注入。

### 7. proot 里 `/sdcard` 挂不上，安装包要先放进 guest

dsh-go 的 proot 启动参数里有 `-b /storage/emulated/0:/sdcard`，实际运行时报：

```
proot warning: can't sanitize binding "/storage/emulated/0": Permission denied
```

于是 `/sdcard/Download/xxx.tgz` 在 guest 里读不到，pnpm 报 ENOENT。可行的做法是先把
tgz 拷到 guest 自己的目录（例如 `/root/workspace/`）再安装。另外不设 `PROOT_TMP_DIR`
时 proot 会报 `can't create temporary directory`，需要在环境里指一个可写目录。

### 8. `file:` 依赖指向的 tgz 不能删

`dsh plugin add` 把依赖记成 `"dsh-zju-campus": "file:/root/workspace/zju-plugin.tgz"`。
这个 tgz 删掉以后，再执行任何 pnpm 操作都会失败。要么保留它，要么改成正式发布的
包名重新安装。

### 9. 组合包名必须是 `dsh-zju-assistant`，否则行上没有「配置」

客户端把每一行的配置页注册在 `plugins.row.config` 槽上，键是

```
`${BUNDLE}#${行 id}`，BUNDLE = 'dsh-zju-assistant'
```

如果直接把 `dsh-zju-campus` 当成组合包装进 profile，行能显示、开关能用，
但 DSH 找不到 `dsh-zju-assistant#zju-account` 这一项，于是组件行上没有「配置」，
进不去「校园账号」的表单，也就没地方填学号和密码。

正确的两层结构：

- `dsh-zju-assistant`：组合包，只有 `cordis.patch.yml`，`dsh.bundle.patch` 指向它，
  依赖 `dsh-zju-campus`；profile 的 `dsh.profile.bundles` 里写这个包名。
- `dsh-zju-campus`：实现包，`package.json` 里不要声明 `dsh.bundle`。

本地装的时候两层都要打进 profile，缺一层都表现为「插件页里能看到组件，但点不进设置」。

### 10. 手机上保存账号报「无法使用系统凭据库」

`systemEntry()` 原来只看 `CAMPUS_FILE_KEYRING`、`ANDROID_DATA`、`ANDROID_ROOT` 决定用不用
私有密钥文件。dsh-go 的 proot 没有后两个变量，于是它去连 Linux 的 Secret Service，
在手机上必然失败，填完账号点保存会报：

```
无法使用系统凭据库。请解锁系统钥匙串或凭据管理器后重试；现有账号文件不会改为明文。
```

处理：Android 判定加上 `/system/build.prop` 是否存在，手机上一律用
`$DSH_HOME/zju-campus/profile/keyring.json`（0600）存包装密钥，密码仍是 AES-256-GCM 密文。

另外注意 `$DSH_HOME/.env` 在 dsh-go 里不会被引擎读进环境，靠写 `.env` 设
`CAMPUS_FILE_KEYRING=1` 没有用。

### 本地出包（dsh-go / 本机安装）

`npm run pack:plugin` 只出实现包 `dsh-zju-campus-<version>.tgz`，组合层在
`plugin/bundle/` 下，需要单独出一个 `dsh-zju-assistant` 包，否则装完插件页里
没有配置入口（见上面第 1、2、9 条）。

```bash
node scripts/pack-local.mjs --target /root/workspace
```

产出两个文件：

```
dsh-zju-campus-0.1.2.tgz         实现包（含 core/、host/、skill/、lib/client.js）
dsh-zju-assistant-0.1.2-local.tgz 组合包，依赖写成 file:/root/workspace/dsh-zju-campus-0.1.2.tgz
```

把两个包放到 `<target>` 目录，装组合包即可：

```bash
dsh plugin --profile web add /root/workspace/dsh-zju-assistant-0.1.2-local.tgz
```

`-local` 后缀表示这条依赖指向本机文件；发布到 npm 的版本用的是 registry 上的
`dsh-zju-campus@0.1.2`，不要拿本地变体去发布。

## 发版：为什么是 GitHub Release 里的 tgz

`dsh-zju-assistant` 和 `dsh-zju-campus` 这两个包名在 npm 上已经被上游维护者占用
（0.1.2，2026-11 可查），本仓库没有发布权限，也不打算用同名包覆盖，所以手机版走
GitHub Release 挂两个压缩包：

- `dsh-zju-campus-0.1.2.tgz`：实现包；
- `dsh-zju-assistant-0.1.2-local.tgz`：组合包，依赖写成本机路径。

代价：升级要重新下载、拷进 guest、再跑一次 `dsh plugin add`。走 npm 的话，
`dsh plugin add <包名>@<版本>` 一条就够了，安装器还会去 registry 查版本和 `engines`。

要注意版本号撞车：这里发布的 0.1.2 包含 Android 凭据回退和手机日历适配，npm 上同为 0.1.2
的包没有这些改动。以后如果真的要发 npm，先升版本号（比如 0.1.3），别让两个内容不同的包
共用一个版本号。
