# 浙大体艺：考勤记录与场馆预约

体育课考勤只读，本技能不代签到，签到由本人在体艺 App 里完成。场馆可以查空场、须知，预约和取消本人的预约。

## 考勤记录

`tyys rollcall history [--course 课程名]` 列出各学期每次体育课的日期与状态，最近的在前。planned 是应上次数，held 是已有记录的次数；未上课次不计入缺勤。message 已汇总到勤与未到的课次，直接转述。实现与协议见 [开发参考](../lib/tyys/README.md)。

## 场馆预约

场馆命令在 `tyys venue` 下。无须先登录或读源码。

明确要求预约时直接 book，不先用 list、notice 或 check 预检；未放号、缺同伴、时段不匹配等由 book 返回。needs-time 或 needs-input 附 alternatives 时，这些已是同一次查询得到的相邻时段，不再重复查询；让用户明确选择，不能把 19:00 自动改成 19:30。

| 目标 | 命令 |
|---|---|
| 查空场 | `tyys venue list --sport 羽毛球 --campus 紫金港 --venue 体育馆 --date 今天 --time 19:00` |
| 看场馆目录 | `tyys venue list`；多个场馆符合筛选时也返回候选，不扫全站余量 |
| 查放号时间与使用规则 | `tyys venue notice` |
| 预约明确场馆 | `tyys venue book --venue 紫金港体育馆 --sport 羽毛球 --date 明天 --time 19:00 --confirm` |
| 查看本人预约 | `tyys venue order list`；可用 date、venue 筛选 |
| 取消一个明确预约 | `tyys venue order cancel --venue 场馆 --date 日期 --time 19:00-20:00 --confirm` |

book 和 order cancel 需要 `ZJU_ALLOW_WRITE=1` 与有效任务授权。现有授权不重复询问。场馆重名时只按候选问清目标，不自行选择。

日期接受今天、明天、后天、0至3天后、YYYY-MM-DD；查询和预约范围为当天到三天后。三天后始终按北京时间日历加三天，不解释成含当天第三天。命令会自行计算目标日期何时放号；not-released 的 message 已区分尚未开放、预计放号时间与超出等待时限，不能改约前一天。

time 用 HH:mm 表示从该时刻开始的一格，也可传完整区间 HH:mm-HH:mm。最多同一块场地两格连续时段，实际仍受场馆规则限制；当前须知限制羽毛球、网球每账号每日一小时，不能自动缩短用户明确要求的区间。当天已经开始的时段不预约。

duration 为最长执行秒数，默认 600，成功立即停止。用户说“挂两小时”才传 7200。等待超过该上限时直接说明结果；用户明确要求定时执行时才使用现有[定时任务](schedule.md)，不自行增加任务。

同伴用应用「插件」页的「活动与场馆」里填的同伴账号（须经同伴本人授权），自动登录取码并校验；指定同伴时传 `--buddy 姓名`，多人用竖线分隔。没填时按错误说明请用户去填，不让模型拼同伴编号或传递同伴码。校园卡查询密码也在「活动与场馆」里填。第二位及以后的同伴在账号文件里加后缀 `tyys_buddy_username_2 / tyys_buddy_password_2 …`；密码不通过命令参数传入。

用户有费用上限时加 `--max-fee 金额`。实际价格在建单后返回；超预算或缺查询密码会保留未支付订单并返回 pending-payment，附金额与可取得的有效期。免费订单也要完成零元确认。booked、already-booked 才能说约上；pending-payment、unknown 都不能说预约完成，也不要重启命令盲目重复下单。

order cancel 不自动取消收费预约；cancelled、already-cancelled 才算确认取消。recovered-previous-operation 表示只回查了上次操作，本次未创建订单或再次付款，直接转述已有订单状态。unknown 表示写入可能已执行但无法确认，提示到 App 核对。遇到 rate-limited 本次停止，不连续重新调用。

首次环境准备使用 `tyys venue setup`，检查用 `tyys venue check`；两者只处理本地 Python 和识别模型。普通查询不依赖识别环境，正常预约不临时下载模型。
