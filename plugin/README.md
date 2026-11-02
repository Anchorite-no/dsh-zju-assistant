# dsh-zju-campus

[ZJU All-in-One Assistant](https://github.com/Anchorite-no/dsh-zju-assistant) 的实现包：校园账号和九个子插件、页面、`zju` 工具和 `zju-campus` 技能，以及它们用到的校园命令（ZJU Core）。

单独装它没有用。请在 [DeepSeek Harness](https://www.deepseek.com/harness/) 的插件页添加 **`dsh-zju-assistant`**，它会把这个包一起装上。

源码、说明和问题反馈都在 https://github.com/Anchorite-no/dsh-zju-assistant 。许可证 GPL-3.0-only。

## dsh-go 原生界面

`package.json` 里还声明了 `dshGo`。装进 dsh-go 的本机引擎后，输入框上方会出现「今日校园」状态条，点开是今天的课、下一节、考试和截止；面板上的「刷新」会调用现有的日程表刷新逻辑。

「写入日历」胶囊和面板按钮只把一段导出指令放进输入框。助手随后调用 `campus_schedule` 的 `phone_calendar` 动作，把未来七天整理成带稳定 key 的事件；dsh-go 的 `mcp__calendar__upsert` 可用时直接写入，否则退回 `mcp__phone__intent kind=calendar` 逐条打开系统新建页。

`host/dsh-go.mjs` 只把 `schedule.days()` 的结果排成 App 能画的视图，不另存校园数据。`host/phone-calendar.mjs` 只生成事件参数，不直接访问手机日历。没有 dsh-go 桥接的主机不会注册这些界面，网页版和桌面版不受影响。
