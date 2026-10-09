# 定时与常驻任务

本技能运行在服务器上，由 Hermes 调用。提醒、每天执行这类需要按时间自动运行的任务，用 Hermes 自带的定时任务创建，和现有的「ZJU CC98 每日签到」是同一套机制；不自建 systemd timer 或 crontab。即时查询直接执行命令。

- 任务加载 zju 技能，工作目录 `/home/ubuntu/zju-skill`；提示词写清要执行的命令和怎样汇报结果。写操作写明 `ZJU_ALLOW_WRITE=1` 与 `--confirm`，只在用户已授权的范围内。
- 提醒用一次性任务。
- 已有的自动任务，不要重复创建：
  - Hermes 定时任务「ZJU CC98 每日签到」：每天 09:30 运行 `cc98 account signin --confirm --all`，结果发到 QQ。
- 同机还运行 zju-run-web（Docker，nginx 反代 zjurun.xyz 等站点，每天 03:20 备份）、Tailscale、privoxy。不要占用 80、443、8080、8118 端口，也不要改动这些服务。
