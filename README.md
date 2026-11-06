# dsh-zju-assistant

浙大校园助手，作为 dsh-go（DeepSeek Harness 手机版）插件使用。仓库只保留插件源码：十个子插件、侧栏页面、`zju` 工具和 `zju-campus` 技能。

> 学生个人项目，不是浙江大学的官方产品，和学校各系统的运营方没有关系。

## 仓库范围

仓库只放能构建、打包和安装到 dsh-go 的插件代码：

- `plugin/`：实现包 `dsh-zju-campus`，以及插件页组合包 `dsh-zju-assistant`。
- `core/`：插件调用的校园命令、课程讲解、公众号和聊天读取器。
- `scripts/`：构建、本地打包、发布检查和凭据检查。
- 根目录的 `package.json`、`package-lock.json`、`LICENSE`、`SECURITY.md`、`THIRD_PARTY_NOTICES.md`。

`node_modules/`、`.tgz` 安装包、页面构建产物和旧桌面版外壳不放在仓库里。需要时按下面的步骤重新生成。

## 功能

| 子插件 | 管的系统 | 默认 |
|---|---|---|
| 校园账号 | 统一身份认证、WebVPN；其余各项都靠它 | 开 |
| 课程与学习 | 教务网、研究生教务网、学在浙大、PTA、大物实验课、智云课堂、学习通、电子书、知网 | 开 |
| 课程讲解 | 把一次课或一份资料讲成带画面的讲解 | 关 |
| 活动与场馆 | 素质拓展平台、体育场馆 | 开 |
| 校园社区 | CC98、查老师 | 开 |
| 校园通知 | 学校部门和学院官网的通知 | 开 |
| 浙大邮箱 | 浙大邮箱 | 开 |
| 微信聊天 | 本机微信的聊天记录 | 关 |
| 钉钉聊天 | 本机钉钉的聊天记录 | 关 |
| 微信公众号 | 微信读书里加了书架的公众号 | 关 |

微信聊天和钉钉聊天读取的是 Windows、macOS 上的客户端数据。dsh-go 在 Android 上运行，这两项即使打开也用不了。

会改动账号状态的操作，比如选课、预约场馆、交作业、报名活动和发邮件，只在你明确要求时执行，执行前还要过一道 dsh 的批准。发邮件前会先显示完整草稿。

## 安装前提

- dsh-go 已经能正常打开网页界面。系统 WebView 低于 Chrome 116 时，DSH 网页界面缺 `Promise.withResolvers` 和 `AbortSignal.any`，需要带 `app/assets/web/dsh_web_compat.js` 补丁的 dsh-go 构建。官方 APK 没有这个补丁时，插件页能显示组件和开关，但进不了需要填账号的网页设置页。
- 电脑上构建源码需要 Node.js 24.18 以上的 24.x 和 npm 11。
- 微信公众号和 PTA 验证码需要 `dsh-builtin-browser`；其他功能不需要。

## 从源码构建

```bash
npm ci
npm run verify
npm run build
```

`npm ci` 会安装根目录和各 Core 的锁定依赖。`npm run verify` 检查类型并运行测试。`npm run build` 把 `plugin/client/` 打成 dsh 能加载的 `plugin/lib/client.js`。

## 打包到 dsh-go

本地安装要出两个包：实现包 `dsh-zju-campus` 和组合包 `dsh-zju-assistant`。组合包的依赖会写成 dsh-go 里的本机路径，所以两个 `.tgz` 要放在同一个目录。

```bash
node scripts/pack-local.mjs --target /root/workspace
```

默认在当前目录生成：

```text
dsh-zju-campus-0.1.2.tgz
dsh-zju-assistant-0.1.2-local.tgz
```

把两个文件拷进 dsh-go 的 guest 目录（例如 `/root/workspace/`），然后安装组合包：

```bash
mkdir -p /root/workspace
cp dsh-zju-campus-0.1.2.tgz dsh-zju-assistant-0.1.2-local.tgz /root/workspace/
dsh plugin --profile web add /root/workspace/dsh-zju-assistant-0.1.2-local.tgz
```

装完重启 dsh-go。`--target` 要和实际存放目录一致；组合包里记录的是 `file:/root/workspace/dsh-zju-campus-0.1.2.tgz`，换目录后要重新出包。

命令行安装的包不会出现在插件市场的「已安装」列表里，也没有卸载按钮。卸载用：

```bash
dsh plugin --profile web remove dsh-zju-assistant
```

## 安装后的设置

1. 打开 dsh 网页界面的插件页，在「校园账号」里填统一身份认证的学号和密码、WebVPN 的校园网账号。
2. PTA、大物实验课、学习通、校园卡查询密码和 CC98 在各自子插件的配置里填。
3. 模型在 dsh 的设置里配置，登录 DeepSeek 账号或填 API Key。
4. 要用微信公众号或 PTA 验证码时，再安装 `dsh-builtin-browser`，扫码和验证码都在它打开的窗口里完成。

dsh-go 原生的插件详情页只有组件列表和开关，没有「配置」入口。填账号必须进网页界面。

## 目录

```text
plugin/
  host/       引擎侧：账号、档案、zju 工具、各子插件和后台检查
  client/     网页界面：日程表、校园事务、学习页和设置页
  rows/       十个子插件的元数据和图标
  skill/      zju-campus 技能
  bundle/     插件页上的组合包和 cordis.patch.yml
core/
  zju/        校园系统的命令和参考文档
  learn/      课程讲解引擎
  weread/     微信公众号
  chat/       微信、钉钉共用的聊天读取
  wechat/     本机微信聊天记录
  dingtalk/   本机钉钉聊天记录
  initialize/ 初始化工作流
  skills/     选课、复习、课程学习等技能
scripts/      构建、打包和检查脚本
```

更细的安装问题和排查记录在 [plugin/README.md](plugin/README.md)。

## 数据和隐私

项目没有自己的服务器，数据留在设备上。

- 校园账号和密码保存在 `$DSH_HOME/zju-campus/profile/accounts.json`，密码用 AES-256-GCM 加密。
- 桌面系统用系统凭据库保存密钥；Android/PRoot 当前回退到同目录下权限为 `0600` 的 `keyring.json`，这是测试用方案，正式版应改用 Android Keystore。
- 各系统的登录状态和缓存在 `$DSH_HOME/zju-campus/zju` 和 `cache`。
- 下载的课件、转写和讲解在「文档」文件夹的 `CampusAgent` 下。

对话内容会发给你在 dsh 里选择的模型服务，助手查到的校园数据也会随对话一起发送。详见 [SECURITY.md](SECURITY.md)。

## 已知限制

- 官方 dsh-go APK 如果没有网页 polyfill，装完插件也进不了设置页。
- dsh-go 上不能用微信聊天和钉钉聊天。
- 课程讲解要排公式时需要 TeX，检查版面需要 Chrome 或 Edge；这些不会自动安装。
- 本地 `.tgz` 是开发安装方式，不是 npm 发布包。两个包名在 npm 上已被上游占用，升级时要重新下载、拷贝并安装。
- 插件页里关掉「校园账号」后，其余子插件都会停止工作。

## 开发

```bash
npm run verify   # 类型检查和各模块测试
npm run build    # 构建 plugin/lib/client.js
npm run security # 检查凭据和发布文件范围，需要 Gitleaks
```

改 `plugin/host/` 后重启 dsh 生效；改 `plugin/client/` 后先跑 `npm run build`。本地开发时在 `plugin/bundle/` 里执行一次 `pnpm install`，让组合包通过 link 指向仓库里的实现包。

## 许可证

项目自有代码采用 [GNU GPL v3（仅限第 3 版）](LICENSE)，SPDX 标识为 `GPL-3.0-only`。第三方代码、依赖和素材沿用各自许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
