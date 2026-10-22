# 演示截图：隔离实例和假数据

给演示视频截应用界面用的一套脚本。起一个和真实账号完全隔开的应用实例，灌进编好的一学期，按清单一张张截 2 倍图，每张配一份关键元素的坐标。软件改了以后重跑一次就是新界面。

## 一条命令重截

在仓库根目录：

```bash
node contest/video/demo/run.mjs
```

大约 8 分钟。应用窗口和讲解窗口在副本里改成了离屏渲染，屏幕上看不到，也不怕被别的窗口挡住、屏幕熄灭（只改副本里的 desktop/main.cjs、film.cjs；设 CAMPUS_DEMO_OFFSCREEN=0 照原样开窗口）。结果在 `contest/video/shots/v2/`：每张 `名字.png`（3200×2000）、同名 `名字.json`（关键元素的位置和 `id`）、`html/名字.html`（同一时刻的静态快照，关键元素带 `data-demo-id`），外加 `shots.json`（这次截了哪些）。截完可以核对快照和截图是否一致：`node_modules/electron/dist/electron.exe contest/video/demo/verify-html.cjs`（结果在 `html/verify.json`）。

- `--only affairs,memo` 只截这几组。组名：`history`（造历史对话）、`trace`、`confirm`、`now`（把钟拨到演示的「现在」）、`affairs`、`memo`、`schedule`、`learning`、`film`、`plugins`、`profile`、`newchat`、`tray`。对话那几组依赖 `history` 先跑；只截页面时可以 `--only now,affairs,schedule`。
- `--keep` 截完不关实例（调试端口 9333），可以接着手动看。
- 定时任务那几张（schedule-tasks、schedule-reminder、schedule-reminder-2、plugins-automation）：`node contest/video/demo/run.mjs --only schedules`，约 8 分钟（`shots-schedule.mjs`）。它的时间线和历史对话穿插，所以单独跑；中途会把应用关掉重开一次，让 7:30 的任务到点。
- 录动起来的片段（可选）：`node contest/video/demo/run.mjs --only history,clips`，在 `shots/v2/clips/` 下出三段 3200×2000、30 帧的 MP4：`notice-slide-in`（点刷新后三条新通知滑进来）、`memo-organize`（通知 → AI 总结后添加 → 转圈 → 左栏多一条）、`trace-grow`（问「大物最近有什么要做的」，执行过程一步步长出来直到说完）。做法是调试协议的 screencast 收每次重绘，按时刻交给项目里的 FFmpeg 重采样成恒定 30 帧（`clips.mjs`）。

## 它做了什么

1. **搭副本**（`stage.mjs`）：把仓库当前的 `desktop/`、`ui/`、`package.json`、`app.patch.yml` 拷到 `D:\CampusAgentDemo\app`，在副本里重新打包界面；`node_modules` 和大部分 `core/` 用目录联接指回仓库。`core/zju`、`core/dingtalk`、`core/wechat` 的 `scripts/` 换成 `fake/` 里的假脚本，对话里跑校园命令时读的是 `core/demo-data/core.json`（`core-data.mjs` 生成），碰不到真实账号和本机的钉钉、微信。副本里的 `api-keys.local.yaml` 是假 Key，不读仓库里的真 Key。仓库的应用代码一行没改。
2. **起实例**（`instance.mjs`）：数据目录是 `D:\CampusAgentDemo\data`（壳的 `--campus-data-dir`），「文档」「下载」换成 `D:\CampusAgentDemo\docs`、`downloads`，不碰 `%APPDATA%\CampusAgent`。模型请求经 `DEEPSEEK_BASE_URL` 指到本机的假模型服务（`model-server.mjs`，说 Anthropic Messages 的协议）。
3. **钟**：演示里的「现在」是 2026-10-21（周三）15:40，秋学期第 6 周。页面的钟由注入脚本拨（`inject.js`），引擎进程的钟由 `fake/clock.cjs` 经 `NODE_OPTIONS=--require` 拨（`clock.mjs`）。造历史对话时把引擎的钟从五天前一段段往前拨，侧栏里就有「17 小时」「3 小时」这样的时间。
4. **校园各页的数据**：注入页面的 `inject.js` 拦下发给 `/api/campus/profile` 的请求，照 `fixtures.mjs` 回编好的数据（作业、通知、备忘录、日程、学习、插件、个人档案）。没编的动作照常交给引擎，名字记在运行结束时打印的 `passed through` 里。日程表的校历和备忘里的时间用应用自己的 `calendar.mjs`、`holidays.mjs` 算。
5. **对话是真的**：脚本在页面里打字发出去，引擎去问假模型，假模型照 `chats.mjs` 的剧本一步步回（思考、正文、工具调用），工具由引擎真的去跑。所以「执行过程」是引擎自己记下来的。截执行过程的序列时，假模型在指定的步骤前停住，截完一张再放行。
6. **讲解**：用应用自带的讲解引擎现打一集（`film/avl`，「AVL 树的四种旋转」），放进假的「文档」，学习页点「播放」时壳另开窗口放它。

## 假数据

一名化名「林同学」的 2025 级计算机学院本科生，2026-2027 秋学期第 6 周。都在这几个文件里，改了重跑就行：

| 文件 | 内容 |
|---|---|
| `data.mjs` | 学生、9 门课和课表（含单双周）、考试、12 份作业、10 条备忘、AI 总结出来的那条备忘 |
| `notices.mjs` | 73 条通知和消息：学校各部门、学院、公众号、二课、课程群和班级群、私聊、邮件、CC98；6 条标成和这位学生关系不大 |
| `learning.mjs` | 智云课次、课后总结（带时间点分节）、讲解、学在浙大课件、学习通的大物实验、个人档案里的记忆 |
| `chats.mjs` | 对话剧本：13 段历史对话、「大物最近有什么要做的」（13 步、7 个网站）、交作业前请求确认 |
| `core-data.mjs` | 对话里那些校园命令返回什么 |

贯穿各页的一条线：张老师 10 月 20 日 20:15 在钉钉课程群说「第三次作业延后两天，改到周五 23:59」。作业卡写着「已延后两天」，备忘录有「大物第三次作业延后到周五」，日程表周五 23:59 有两张截止卡，通知栏里那条群消息带着「已在备忘录」的勾，对话里助手也照这个时间说。

没有真实的人名、学号、手机号：老师一律「X老师」，学号 3250000000、手机号 13800000000 这类明显假的，链接都是 `example.zju.edu.cn`。

## 改了界面以后

截图跟着仓库当前的代码走。页面结构变了导致某一步点不到时，运行结束会列出 `FAILED` 的组；对着 `shots-pages.mjs`、`shots-chats.mjs` 里那一步的选择器改。坐标 JSON 里的选择器（每张图的 `spec`）也在这两个文件里。

## 文件

| 文件 | 作用 |
|---|---|
| `run.mjs` | 总入口 |
| `stage.mjs` | 搭隔离副本 |
| `instance.mjs` | 起隔离实例 |
| `cdp.mjs` | 连调试端口的小客户端 |
| `driver.mjs` | 点、等、截图、量坐标 |
| `inject.js` | 注入页面的假接口和钟 |
| `fixtures.mjs` | 页面数据 |
| `model-server.mjs` | 本机假模型服务 |
| `clock.mjs`、`fake/clock.cjs` | 引擎进程的钟 |
| `fake/zju.ts`、`fake/chat.mjs` | 副本里的假 core 和假聊天读取器 |
| `shots-pages.mjs`、`shots-chats.mjs` | 截图清单 |
| `clips.mjs` | 录片段（可选） |
| `snapshot.js` | 注入页面、把当时的页面存成静态 HTML |
| `verify-html.cjs` | 用 Electron 离屏打开快照，和截图逐像素比 |
| `film/avl/` | 讲解的源文件（打包结果在 `film/avl/build/`） |
