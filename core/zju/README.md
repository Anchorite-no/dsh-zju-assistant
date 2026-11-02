# ZJU Core

> 这是校园智能体桌面端内置的一份，从 ZJU Skill（da2e455，2026-10-07）复制过来后单独修改，和原仓库不再同步。
> 和原技能不一样的地方都在[接入应用](#接入应用)和[配置](#配置)两节：没有 `profile.env`，账号在应用的「插件」页填，学籍在设置的「个人档案」里填；运行数据不在代码目录里。

面向 AI 助手的浙江大学校园系统工具，也可以直接通过命令行使用。覆盖教务、实验课、学在浙大、浙大体艺、PTA、超星学习通、智云课堂、CC98、查老师与中国知网，另带文档转文字和 PDF 处理，统一处理配置、认证、网络访问和执行结果。

AI 使用入口为 [SKILL.md](SKILL.md)。所有模块通过同一个 CLI 调用，共用认证与传输组件；日常业务自动准备所需会话，无需先逐个登录。

## 能做什么

| 模块 | 能力 | 账号与网络 | 说明 |
|---|---|---|---|
| `zdbk` 教务 | 完整课表（起止时间、教室）、考试时间考场座位、成绩与五分制绩点、培养方案 PDF；自主选课：查教学班、保存志愿、排序、退选 | 统一认证，公网 | [教务](references/zdbk.md)、[选课](references/zdbk-selection.md) |
| `yjsy` 研究生教务 | 研究生课表（研究生，和选了研究生课的本科生）：每门课的教师、星期、节次、起止时间、地点、周次和每次课的日期 | 统一认证，公网 | [研究生教务](lib/yjsy/README.md) |
| `notice` 通知 | 本人学院官网（44 个学院自动收录，按个人档案里的学院选）、教务网、本科生院、学工部、研工部、研究生院、团委、综合服务网、信息技术中心、图书馆的通知公告：按本科生或研究生取默认来源，合并去重后的最新通知、按关键词与来源检索、全文和附件、上次查看之后的新通知；只读 | 统一认证，校内（教务网公网） | [通知](references/notice.md) |
| `ebook` 电子图书 | 图书馆主页「电子图书」入口（电子书刊导航）加超星电子书：按书名或 ISBN 查学校订购的电子图书在哪个平台有全文，给出各平台的直达地址；只查找，不下载 | 免登录，校内 | [电子图书](references/ebook.md) |
| `sztz` 二三四课堂 | 素质拓展数智平台：活动中心里能报和即将举办的活动（记点、时间地点、报名方式）、可申请认定记点的项目、本人二三四课堂记点与成绩单记录、报名和收藏的活动、平台通知；按活动名报名、取消报名、收藏 | 统一认证，校内 | [二三四课堂](references/sztz.md) |
| `lab` 实验课 | 实验课表（日期、实验名、实验室）、每门课的实验与可选周次、已选实验、公告；选、退 | 独立密码，校内 | [实验课](references/lab.md) |
| `xuezai` 学在浙大 | 课程章节与活动、课件清单与下载、作业待办与 DDL、作业要求与提交记录、下载交过的文件和批改文件、个人作业提交与撤回；GPS/雷达签到、数字签到与两路全开，当前点名与历史点名记录 | 统一认证，公网 | [学在浙大](references/xuezai.md) |
| `tyys` 浙大体艺 | 各学期体育课考勤记录；体育场馆空场、放号时间与须知、预约、本人订单与取消 | 统一认证，公网 | [浙大体艺](references/tyys.md) |
| `pta` | 作业进度、题面与本人作答、保存、提交判题、结束答题、提交记录、未决回查 | 独立账号，公网 | [PTA](references/pta.md) |
| `chaoxing` 超星学习通 | 本人课程；章节文档和「资料」栏的课件、章节视频的清单与下载，视频可选原文件或 720p 播放版；只读，不碰学习进度 | 独立账号，公网 | [超星学习通](references/chaoxing.md) |
| `zhiyun` 智云课堂 | 找课（没选的课也能找）、课次与资源、本人某几天的课次（含研究生课）、录播字幕搜索；下载回放、音频、课件、课堂截图、字幕；课堂实时字幕；本地录音转写与课件提取 | 统一认证，公网；实时字幕经校内 | [智云](references/zhiyun.md) |
| `cc98` | 十大与热门、标题搜索、看帖（多帖、多页、只看楼主、按词筛楼层）、版面、消息与私信、帖内图片视频附件下载；回帖、发主题、带图发送、赞踩评分、收藏、签到 | 独立账号，校内 | [CC98](references/cc98.md) |
| `chalaoshi` 查老师 | 教师评分与学生评论、一门课各位老师的平均绩点 | 无需账号；站点在境外 | [查老师](references/chalaoshi.md) |
| `cnki` 中国知网 | 检索中文文献（期刊、学位论文、会议、报纸），按年份、来源类别、作者、来源筛选，按相关度、时间、被引、下载排序；按篇名下载全文 PDF；只读 | 无需账号，用学校 IP 登录；校内 | [知网](references/cnki.md) |
| `doc` 文档 | PDF、Word、PPT、Excel（含 doc/ppt/xls 老格式）、HTML 转文字，本地文件或链接；图片与 Word 转 PDF、合并；PDF 找页、取页、取嵌入图片、整页渲染成图 | 校内与 CC98 链接、教务网附件自动处理登录 | [命令总表](references/commands.md#doc)、[lib/doc](lib/doc/README.md) |
| `profile` / `webvpn` / `zjuam` | 账号与学籍的脱敏查看、网络诊断、WebVPN 与统一认证的会话维护 | | [网络](lib/webvpn/README.md)、[统一认证](lib/zjuam/README.md) |

「校内」的站点默认经 WebVPN 访问，需要 WebVPN 账号；能直连校园网时可改为直连，见[配置](#配置)。

## 设计取向

最终调用者是推理能力有限的小模型，所以可确定的业务流程都放在命令里，模型只负责理解目标、传入必要信息、转述结果。

- **一个任务一次调用。** 认证、分页、匹配目标、轮询、提交、回查、重试和停止由命令完成，不需要先登录、探字段或写胶水脚本。
- **按名称定位。** 课程、作业、文件、教师、版面都写名称，可用常见简称；公开参数里没有平台内部 ID。名称不唯一时返回候选，不猜。
- **结果是整理过的视图。** 时间为北京时间，正文给全文，不透传平台原始对象。
- **成功以回查为准。** 提交、预约、选课都回查本人记录后才报告成功；无法确认时如实返回 `unknown`，不把“已提交”说成“已完成”。
- **写操作有两道闸。** 环境变量 `ZJU_ALLOW_WRITE=1` 加命令的 `--confirm`，缺一个就在登录之前拒绝。

## 快速开始

平时不用单独运行：应用启动后助手按 SKILL.md 调用。开发时在项目根目录直接跑命令，需要 **Node.js 24 LTS**（最低 22.13），TypeScript 直接运行，无需构建；依赖已经在 `core/zju/node_modules` 里。

```sh
node core/zju/scripts/zju.ts profile show
node core/zju/scripts/zju.ts --help
node core/zju/scripts/zju.ts xuezai --help
node core/zju/scripts/zju.ts tyys --help --all
```

`profile show` 列出当前读到的账号和学籍，密码只显示是否已填。帮助逐级查看，`--help --all` 展开当前范围的全部公开命令；全部命令与参数也列在 [命令总表](references/commands.md)。下文示例都把 `node core/zju/scripts/zju.ts` 写成 `zju`。

## 接入应用

本目录就是一个技能：[SKILL.md](SKILL.md) 是入口，列出用户目标与对应命令；[references](references) 是按需阅读的各模块用法。选课这类多步骤的事是应用自带的技能，在 [../skills](../skills/README.md)。应用启动时由 `ui/profile/skills.mjs` 把它挂给引擎，助手按 SKILL.md 以 `node <SKILL>/scripts/zju.ts <模块> <命令>` 调用。

应用里和本技能对接的只有三处，定义都在 `ui/profile/catalog.mjs` 一张表里：

- 「插件」页的校园功能。每个插件管本技能的几个模块，关掉一个插件就是把这些模块写进 `ZJU_DISABLED_MODULES`。
- 各插件详情页里的账号，存在档案目录的 `accounts.json`。
- 设置里「个人档案」最上面的基础信息，存在档案目录的 `identity.json`。

后两处合起来就是原技能的 `profile.env`，本技能只读不写，入口是 `lib/profile/profile.ts`。个人档案页下面的卡片不归本技能读，助手需要留存查到的个人事项时用应用的 `campus_profile_write` 写进去。

提醒、每天执行这类按时间运行的任务交给应用的自动化任务，本技能不自建定时服务，约定见 [定时任务](references/schedule.md)。

## 配置

账号在应用「插件」页对应插件的详情页里填，只填需要使用的系统。

| 在哪个插件里填 | `accounts.json` 的键 | 用途 |
|---|---|---|
| 校园账号 | `zju_username` / `zju_password` | 浙大统一身份认证账号：教务、学在、体艺、智云 |
| 校园账号 | `webvpn_username` / `webvpn_password` | WebVPN 的独立校园网账号：实验课、CC98、知网、智云实时字幕和校内链接 |
| 校园账号 | `transport` | 校内站点的访问方式，默认 `webvpn`；能直连校园网时选校园网直连（`direct`） |
| 课程与作业 | `pta_username` / `pta_password` | PTA 百腾独立账号（邮箱）与密码 |
| 课程与作业 | `lab_username` / `lab_password` | 实验课平台凭据；账号留空时使用统一认证学号 |
| 活动与场馆 | `tyys_card_password` | 体艺场馆付款用的校园卡查询密码 |
| 活动与场馆 | `tyys_buddy_username` / `tyys_buddy_password` | 场馆预约的同伴账号，须经同伴本人授权 |
| 学习资料 | `chaoxing_username` / `chaoxing_password` | 超星学习通独立账号（手机号）与密码 |
| 校园社区 | `cc98_username` / `cc98_password` | CC98 独立账号 |

CC98 的第二个账号、第二位场馆同伴页面上没有地方填，直接在 `accounts.json` 里加 `_2`、`_3` 后缀的键，页面保存时原样保留。

学籍在设置里「个人档案」的基础信息里填，本技能读 `identity.json` 里的这几项：`college`（学院，定通知来源）、`student_level`（培养层次）、`grade` / `major_code` / `major_name`（入学年份和专业，用于培养方案等查询）。本科生的学院、专业、入学年份和培养层次由应用从教务网和学号自动填。

账号体系各自独立，模块不会自动把统一认证密码用于 WebVPN、CC98、PTA、超星或实验课。公网系统按模块声明直连，不受 `transport` 影响。查老师的站点在国内公网不可达，需要本机自己有出境网络，WebVPN 帮不上忙。

运行时选项通过进程环境变量设置：

| 环境变量 | 用途 |
|---|---|
| `CAMPUS_PROFILE_DIR` | 档案目录，默认 `%APPDATA%\CampusAgent\profile`；应用启动的命令会继承它 |
| `ZJU_DATA_DIR` | 运行数据目录，默认是档案目录旁边的 `zju/`（`%APPDATA%\CampusAgent\zju`） |
| `ZJU_DISABLED_MODULES` | 以逗号分隔禁用模块；应用按「插件」页的开关设置 |
| `ZJU_ALLOW_WRITE=1` | 启用业务写操作，同时还需对应命令的 `--confirm` |
| `ZJU_ZHIYUN_REMOTE` / `ZJU_ZHIYUN_REMOTE_ROOT` | 把智云命令经 SSH 交给另一台执行机，见 [可选远程执行](references/zhiyun.md#可选远程执行) |
| `ZJU_DEBUG=1` | 向 stderr 输出调试信息 |

账号和密码只从 `accounts.json` 读，不认同名的环境变量。

## 查询与下载

以下都是只读命令，直接运行。完整的“用户目标 → 命令”对照见 [SKILL.md](SKILL.md)。

```sh
# 教务：课表、考试、成绩绩点、培养方案
zju zdbk timetable
zju zdbk exams --course 课程名
zju zdbk grades
zju zdbk plan view

# 通知：各部门最新通知、按关键词或来源找、上次之后的新通知
zju notice list --keyword "转专业、推免"
zju notice list --source 学工部
zju notice list --source 学院          # 本人学院官网；别的学院写学院名，如 控制学院
zju notice list --source 团委          # 二课、志愿服务、社会实践、社团
zju notice new

# 实验课：哪天做什么实验、在哪个实验室；一门课还能选哪些
zju lab timetable
zju lab labs --course 课程名

# 学在：作业待办、某课作业、课件
zju xuezai todos
zju xuezai homework view --course 课程名 --name 作业名
zju xuezai material list --course 课程名
zju xuezai material download --course 课程名 --name "文件一|文件二"

# 超星学习通：按章节直接下载课件或视频，章节名差一两个字也能对上
zju chaoxing course list
zju chaoxing material download --course 课程名 --chapter 章节名
zju chaoxing video list --course 课程名
zju chaoxing video download --course 课程名 --chapter 章节名 --quality playback

# PTA：还没截止的作业与进度；某份作业的小题；某题题面与本人作答
zju pta homework list
zju pta homework view --set HW02
zju pta problem view --set HW02 --problem 7-1

# 智云：找课、在录播字幕里搜老师说过的话、下载某次课的课件
zju zhiyun search courses --keyword 课程名
zju zhiyun search subtitles --course 课程名 --keyword "点名、签到"
zju zhiyun download --course 课程名 --lesson 1 --kind ppt

# 智云：上课时采集实时字幕，随时看刚才五分钟老师说了什么
zju zhiyun live start
zju zhiyun live text

# 智云：本地录音转写、课件提取
zju zhiyun trans audio --file 录音.m4a
zju zhiyun trans ppt --file 课件.pptx

# 体艺：场馆空场（今天至三天后）、放号时间与须知、本人订单
zju tyys venue list --sport 羽毛球 --campus 紫金港 --date 今天
zju tyys venue notice
zju tyys venue order list

# CC98：十大、搜索（几种说法一次给完）、看帖、消息、帖内文件
zju cc98 hot
zju cc98 search --keyword "数据结构、fds、数据结构基础"
zju cc98 topic view --id 主题ID --lz
zju cc98 account notifications
zju cc98 topic download --id 主题ID

# 查老师：教师评价与评论、一门课各位老师的绩点
zju chalaoshi teacher --name 姓名
zju chalaoshi course --name 课程名

# 知网：检索并筛选，按篇名下载全文 PDF
zju cnki search --keyword "图神经网络 综述" --year 2024-2026 --core "北大核心|CSSCI|CSCD" --sort cited
zju cnki download --title 完整篇名

# 文档：转文字、合成 PDF、找页、取页（看页面长什么样用应用自带的 Office 引擎渲染成图，不在这里）
zju doc text --url 链接
zju doc pdf --file "第1页.jpg|第2页.jpg" --out 作业.pdf
zju doc find --file 课本.pdf --keyword 习题一
zju doc pages --file 课本.pdf --pages 43-49

# 学在签到：设置 ZJU_ALLOW_WRITE=1 后执行，默认 GPS，数字与全开需明确选择
zju xuezai rollcall --confirm
zju xuezai rollcall number --confirm
zju xuezai rollcall all --confirm

# 点名与考勤的只读查询：当前有没有点名、历史记录
zju xuezai rollcall status
zju xuezai rollcall history --course 课程名
zju tyys rollcall history
```

下载类命令返回本地路径，文件默认存在 `data/output/<模块>/`（智云的下载和转写例外，放进用户「文档」里的 `CampusAgent`，见 [智云](references/zhiyun.md)），下载过的文件直接复用；智云和超星的大文件中途打断后，重跑同一条命令会接着下。

## 写操作

会改变远端记录的命令需要同时设置环境写开关和 `--confirm`：

```powershell
# PowerShell
$env:ZJU_ALLOW_WRITE = "1"
node scripts/zju.ts sztz activity signup --name 活动名 --confirm
```

```sh
# Bash / zsh，只为这条命令设置写开关
ZJU_ALLOW_WRITE=1 node scripts/zju.ts sztz activity signup --name 活动名 --confirm
```

| 业务 | 命令 |
|---|---|
| 二课活动 | `sztz activity signup`、`sztz activity favorite`（`--cancel` 是取消） |
| 场馆预约与取消 | `tyys venue book`、`tyys venue order cancel` |
| 学在作业 | `xuezai homework submit`、`xuezai homework retract` |
| PTA | `pta homework start`、`pta problem save`、`pta problem submit`、`pta homework finish` |
| 教务选课 | `zdbk selection select`、`reorder`、`drop` |
| 实验选课 | `lab select`（`--cancel` 是退） |
| CC98 | `topic reply`、`board post`、`private-message send`、`floor like / rate / edit`、`topic favorite`；`account signin` 幂等且不发布内容，只需 `--confirm` |

查询与下载已在真实环境跑通。部分写流程（场馆预约付款、PTA 提交、教务与实验选课等）目前只做过隔离验证，没有为了验收去真实选课、交作业或发帖。

### 场馆预约

```sh
ZJU_ALLOW_WRITE=1 zju tyys venue book --venue 紫金港体育馆 --sport 羽毛球 --date 明天 --time 19:00 --confirm
```

`book` 只约一次，完成验证码、同伴、确认付款与回查，范围为当天到三天后；没放号时返回预计放号时间，没空场时返回相邻时段，都不等待，被拒也不重试。`booked` / `already-booked` 才算约上，`pending-payment`、`unknown` 都不算。取消用 `tyys venue order cancel --venue 场馆 --date 日期 --time 时段 --confirm`。场馆服务器对账号有限流，命令按单个目标查询，不扫全站余量；遇到 `rate-limited` 时停下，不要连续重试。

### 作业

```sh
ZJU_ALLOW_WRITE=1 zju xuezai homework submit --course 课程名 --name 作业名 --file "报告.pdf" --confirm
```

学在目前支持个人作业的提交与撤回，提交后自动回查，`verified: true` 才算交上；小组作业提交尚未支持。

PTA 的保存、提交、开考、交卷是不同业务：`problem save` 保存客观题答案或代码草稿，`problem submit` 提交答题记录并对代码判题，`homework finish` 在教师允许时结束整份作业。查询不会自动开考。结果不明的写入用 `pta reconcile` 回查，答案格式与会话导入见 [PTA 参考](references/pta.md)。

### 选课

```sh
zju zdbk selection sections --course 课程名
ZJU_ALLOW_WRITE=1 zju zdbk selection select --course 课程名 --teacher 教师 --confirm
ZJU_ALLOW_WRITE=1 zju lab select --course 课程名 --lab 实验名 --week 周次 --confirm
```

每条命令只提交一次并回查，`--dry-run` 只做预览。多轮选课的步骤顺序和决策点见 [选课](../skills/course-selection/SKILL.md) 技能，规则要点见 [选课参考](references/zdbk-selection.md)。

### CC98 发布

```sh
ZJU_ALLOW_WRITE=1 zju cc98 topic reply --id 主题ID --content 文本 --quote 楼层号 --confirm
ZJU_ALLOW_WRITE=1 zju cc98 private-message send --user 用户名 --content 文本 --image 图片.jpg --confirm
```

帖子和回帖发出后删不掉，只能编辑；私信不能撤回。只发布用户自己写并同意发出的内容。每次写入前先记日志，结果不明时只读回查、不重发。

## 输出约定

CLI 将一个结构化 JSON 结果写入 stdout，进度和帮助写入 stderr。`ok: true` 表示命令正常完成，业务结果仍看 `status` / `message`，例如“已提交”不等于“已选上”。失败时退出码非零，读取 `error.code`、`error.message` 与 `error.detail`；业务未完成时，已取得的结果保留在 `error.detail.result`。

## 本地依赖

常规查询只需要 npm 依赖。下面几项功能需要本地环境，按需准备，互不依赖，不必先装齐才能使用其他模块：

| 功能 | 准备 | 检查 |
|---|---|---|
| 智云媒体处理（FFmpeg，应用自带）；音频转写只需模型，第一次用时自动下载 | `zhiyun setup` | `zhiyun check` |

细节见 [智云依赖检查](references/zhiyun.md#依赖检查) 与 [lib/doc](lib/doc/README.md)。场馆预约的验证码不用本地环境，交给应用里现在选的那个模型识别，见 [体艺开发参考](lib/tyys/README.md#验证码识别)。

## 目录与数据

| 路径 | 职责 |
|---|---|
| SKILL.md | 技能入口和任务路由 |
| README.md | 接入、配置和用法 |
| scripts | 唯一 CLI 入口 `zju.ts`、命令总表生成器和模块内部的处理脚本 |
| lib | 运行代码，一个模块一个目录；各模块 README 记录实际请求与协议 |
| references | 助手按需阅读的 CLI 用法与成稿模板 |
| flows | 步骤复杂的定制工作流，如多轮选课 |

账号、学籍和运行数据都不在本目录里。运行数据目录（`%APPDATA%\CampusAgent\zju`）内部：

| 路径 | 保留方式 |
|---|---|
| output | 下载、转写、笔记等用户要的文件，按模块存放；保留可避免重复下载 |
| sessions / cache | 各账号会话、课表与教师索引等缓存；由模块维护，可重建 |
| tools / models | setup 命令安装的本地处理环境和模型，不是临时缓存 |
| journal | 写操作的写前日志，用于结果不明时回查 |
| locks / pta/pending | 运行锁和 PTA 未决记录；不能当作缓存清除，PTA 先用 `pta reconcile` 回查 |
| live | 智云实时字幕的采集任务与已保存文字 |

数据目录可用 `ZJU_DATA_DIR` 更改。更改会同时改变会话、模型和工具的查找位置，不应仅为隐藏大文件而随意迁移。

## 开发

```sh
npm run typecheck
```

- [lib/README](lib/README.md)：各组件的唯一职责。
- [命令总表](references/commands.md)：由 `scripts/command-docs.ts` 从 CLI 注册表生成。
- [自带技能](../skills/README.md)：选课等跨几个系统、多步骤的事。

当前仓库不保留测试代码或 fixtures；按变更在临时环境中验证，结果写进提交说明。没有 `npm test` 或 `npm run check` 入口。
