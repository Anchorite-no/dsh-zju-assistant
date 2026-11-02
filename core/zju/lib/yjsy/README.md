# 研究生教育管理信息系统 请求与协议

研究生院的教务系统，和本科教务网（zdbk）是两套。日常用 `yjsy timetable`，见 [命令总表](../../references/commands.md#yjsy)。本文件记录实际请求，供开发和排障使用。

- 域名：yjsy.zju.edu.cn · auth=cas network=public writes=false
- 状态：登录、当前学年学期、教学日历、课表接口 2026-11-02 用没选研究生课的本科生账号实测（本科生入口，课表为空）；有课时课表各字段照官方前端代码，还没对过真实数据
- 代码：`lib/yjsy/{index,cli}.ts`

## 登录

1. 统一身份认证给 service 签 ticket：研究生 `https://yjsy.zju.edu.cn/`，本科生 `https://yjsy.zju.edu.cn/bks`（选研究生课的本科生入口）
2. GET `/dataapi/sys/cas/client/validateLogin?ticket=&service=` → `{success, result: {token, userInfo}}`
3. 之后的请求带请求头 `X-Access-Token: <token>`

本科生的账号在研究生入口换 token 返回 500「无效的用户信息」。代码按学号首位选入口（1、2 研究生，3 本科），换不到再试另一个。

## 端点

都在 `https://yjsy.zju.edu.cn/dataapi` 下，GET 带查询串，响应 `{success, code, message, result}`。

| 用途 | 路径 | 参数 | 结果 |
|---|---|---|---|
| 当前学年学期 | `system/sysApp/queryByDm` | `dm=py_xsxk` | `dqxn`（学年的头一年，2026 即 2026-2027）、`dqxq`（11 春夏，12 秋冬） |
| 教学日历 | `system/sysJxrlXqsj/getJxrlByXnxq` | `xn, xq, sfqr=1` | `kssj` 第 1 周那天、`jssj`、`pkzcs` 周数、`xdxjKszc` 下半学期从第几周起、`sysJxrlSjdList` 每节的 `jc, kssj, jssj`（800 这样的数） |
| 本人课表 | `py/pyKcbj/queryXskbByLoginUser` | `xn, pkxq`（11 春、12 夏、13 秋、14 冬） | `kcbMap[星期][节次].pyKcbjSjddVOList`、`sjddList`（时间地点由学院另行通知的课） |

课表每一项：`kcmc` 课程名、`bjbh` 班号、`kcbjId`、`zc` 周次（逗号分隔，按大学期从第 1 周数，冬、夏学期接着秋、春数）、`xm` 教师、`xqmc` 校区、`jxl` 楼、`cdmc` 教室、`bkbj=1` 本科生课、`xkzt=12` 选课待处理。一门课占几节就在几格里各出现一次，`timetable` 把连着的节次并成一次课。

## 坑

- 官方页面把第 14 节的下课时间写死成 22:05，`timetable` 照页面给。
- 第 6 节在这边的教学日历里是 13:25–14:00，本科教务网是 13:25–14:10，照各自系统给的。
- 下一个大学期的教学日历没排出来时，`getJxrlByXnxq` 的 `kssj` 是空的，命令报「还没有这个学期的教学日历」。
