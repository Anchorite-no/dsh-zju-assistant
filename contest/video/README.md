# 演示视频

这里是做片子的工程，不放成品。**初赛交上去的影片在 `contest/round1/4-演示视频-校园智能体.mp4`。**

片子的工程在 `film/`，用花叔的 [huashu-motion](https://github.com/alchaincyf/huashu-motion) 做：一个 HTML 页面加一条 GSAP 时间线，逐帧渲染成 MP4，配乐和音效也由它从页面里声明的东西生成。第一版深色样片在 `film/archive/v0/`，留作对照。

## 结构

| 位置 | 内容 |
|---|---|
| `film/index.html` | 整片：舞台、样式、配乐谱（`om-score`），按顺序引入各场景 |
| `film/main.js` | 把场景按小节排到一条时间线上（120 BPM，一小节 2 秒） |
| `film/lib/kit.js` | 共用的动画工具：截图做成的窗口、摄像机、光标、描框、压暗、抠出浮起、引线标注 |
| `film/scenes/` | 16 个场景，文件名就是顺序 |
| `film/assets/shots/` | 演示实例的 2 倍截图（来自 `shots/v2/`）和元素坐标 `rects.js` |
| `film/assets/clips/` | 演示实例里录的真实界面（`memo-organize`、`trace-grow`），和从一集真实讲解里逐帧录的两段（`lesson-months60`、`lesson-zig60`，60 帧，片子里一律原速、整句放完） |
| `film/assets/lesson/` | 那一集讲解的副本 `avl-film.html`（只把课程名和标题改成演示里的「数据结构基础 · 第 5 次课」「AVL 树的四种旋转」），和从里面取的两张定格 |
| `film/tools/score.py` | 生成配乐谱：每段的和弦、配器、力度 |
| `film/tools/lesson-capture.cjs` | 把讲解引擎做出的一集逐帧录成视频（`--from`/`--to` 只录一段） |
| `film/tools/lesson-stills.cjs` | 从一集讲解里截几张定格，挑镜头用 |
| `film/tools/final.sh` | 把渲染出的母版压成交比赛用的 MP4（约 188 MB） |
| `film/treatment.md`、`film/directions/` | 分镜和三个方向的关键帧 |
| `film/out/` | 渲染出来的母版（`film-v8.mp4` 是交上去那版压缩前的高清母版），不是成品，不进仓库 |
| `film/archive/v0/` | 第一版深色样片：页面、`render.cjs`、用到的两张截图和渲染出的 `样片.mp4` |
| `film/archive/v4/` | 发给老师的那一版（7 分 44 秒）的场景、页面、配乐谱和成片 `演示视频-7分44秒.mp4` |
| `film/archive/v6-removed/` | 拿掉的几场：交作业先确认、个人档案、插件（并进了「技能和定时任务」） |
| `film/assets/brand/` | 应用图标（`build/icon/app-icon.svg` 的副本） |
| `shots/v2/`、`demo/` | 隔离实例和假数据，一条命令重截：`node contest/video/demo/run.mjs` |

## 三段和时长（8 分 20 秒）

| 段 | 场景 | 时长 |
|---|---|---|
| 作品概述 | 开场：产品名和五个亮点（32 秒）· 信息涌来 · 为什么通用 AI 帮不上 · 产品登场 · 渠道层和技能层 | 1:52 |
| 核心场景实操 | 初始化（架构图）· 消息按人送达 · 问助手看执行过程 · 学习与讲解 · 这一讲是怎么做出来的 · 插件、技能和定时任务 · 日程表 · 通知变备忘录 | 5:14 |
| 应用成效与反思 | 实测数字 · 边界和还做不到的 · 落版 | 1:14 |

开头 32 秒先亮产品名和五个亮点（一次初始化拼成一份档案、消息按人送达、问一句跑 7 个网站、没听懂的课重讲一遍、技能和定时任务），再讲问题。「执行前要你确认」不当卖点，片子里不讲。第二段也是亮点在前、放慢：消息按人送达、问一句跨 7 个网站、学习和讲解（含讲解怎么生成，72 秒）；档案、备忘录、日程表、插件压短放后面。

画面里的数字都来自申报书的实测；界面数据是演示实例里编的（第二段开头写明了「数据为虚构，人物为化名」）。

「这一讲是怎么做出来的」用的是一集真实讲解的产物（`D:\Learn\lessons\ADS-L01-AVL`）：底稿里的观众基础、鱼骨图（主线 12 条、挂着的 58 条、例题 3 道、待核对 6 处）、`plan/code` 验算的输出、讲稿第 6 幕原文、字幕行和画面代码（`film/scenes/40-act6.js`，节选）、带读法的字幕（319 行里 144 行）。五步照 `core/learn/SKILL.md` 的五个阶段。

## 常用命令

om 是 huashu-motion 的命令行（`~/.huashu-motion/om`，包了一层把完整版 FFmpeg 放进 PATH）。在 `film/` 里：

```bash
~/.huashu-motion/om check .
```

```bash
~/.huashu-motion/om still . --at 12.5,130
```

```bash
~/.huashu-motion/om studio . --no-open
```

```bash
python tools/score.py && ~/.huashu-motion/om sound .
```

```bash
~/.huashu-motion/om render . --blur
```

```bash
sh tools/final.sh out/film-vN.mp4 out/校园智能体-演示视频.mp4
```

`om studio` 打开预览编辑器：按 C 在画面上点一下写意见，改动会精确落到那一处。

## 配乐

`tools/score.py` 生成 23 个声部、236 小节的谱，用 huashu-motion 的真实乐器采样演奏（Salamander 钢琴 CC BY 3.0、VSCO 2 弦乐 CC0 等）。有一个产品动机 5-1-2-3-5（「校园智能体」五个字）：开头钢琴轻轻起，中间换乐器说，片尾钢琴加钟收。每段换主配器（钢琴、电钢琴、拇指琴、颤音琴、拨弦、断奏弦乐、圆号），产品登场、讲解放出来、实测数字是三个高点；开场比产品登场低一档。改了场景长度要同时改 `score.py` 里对应段的小节数。
