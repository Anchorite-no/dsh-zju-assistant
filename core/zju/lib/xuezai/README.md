# 学在模块内部职责

CLI 用法见 [学在参考](../../references/xuezai.md)。本文件说明源码依赖、实际请求与端点；不定义额外的运行流程或安装入口。

## 组件边界

| 组件 | 唯一职责 |
|---|---|
| `profile` | 读取账号配置 |
| `core/http` | HTTP、Cookie 和连接池 |
| `webvpn/transport.openContext` | 根据声明组装传输和现有认证组件 |
| `zjuam` | CAS 密码认证、TGT 复用和 service 票据交换 |
| `xuezai/client.ts` | 学在专属 identity 回跳、站点 Cookie、XSRF、用户 ID、分页和文件传输 |
| `xuezai/rollcall.ts` | 点名的只读查询：当前点名、本人是否已签、历史点名记录 |
| `xuezai/cli.ts` / `rollcall-cli.ts` | 参数适配，创建和关闭一次任务所用的客户端 |

`openXuezai()` 是模块工厂：调用公共 `openContext`，把同一上下文注入 `Xuezai`，随后由业务请求按需准备站点会话。模块不重新读取 CAS 账号密码，也不实现密码加密或 CAS 表单提交。站点缓存有效时不会先请求 CAS；确需身份委托时，由注入的 `ctx.zjuam.service()` 完成。

`ensureSession()` 是客户端内部方法，只管理学在自己的会话。保留的 `xuezai session login` 用于诊断或显式刷新，复用同一客户端流程；业务操作不依赖先执行它。

点名查询接收已经组装的客户端，不创建认证器或另开连接。CLI 和直接导入 `index.ts` 的调用使用同一份业务实现。`index.ts` 只导出已有组件，没有第二套执行器。

## 其他内部文件

| 文件 | 职责 |
|---|---|
| `courses.ts` | 学期、课程、章节、活动及内容树 |
| `materials.ts` | 附件查询和下载 |
| `homework.ts` | 作业、提交记录、下载本人交过的文件、个人提交及撤回 |
| `todos.ts` | 原生待办和作业补查 |
| `types.ts` | 数据和日志类型 |
| `cli-common.ts` | 命令共用的客户端生命周期、写闸与日志适配 |

`courses.ts`、`materials.ts`、`homework.ts` 中的 `*Row` / `*View` 只做 CLI 输出投影（北京时间、名称、状态、正文转纯文本）；库函数、名称匹配和提交回查仍使用平台原字段。

具体参数和返回类型以各函数声明为准；使用约定、限制和验证状态只维护在学在参考文档中。

## 站点与会话

- 站点：`https://courses.zju.edu.cn`（TronClass），公网直连，统一身份认证。
- 模块：`lib/xuezai/`；CLI：`node scripts/zju.ts xuezai …`。源码分工见 [内部职责](README.md)。
- 会话：`data/sessions/xuezai.json`，按 profile 用户校验身份，TTL 12 小时。`session status` / `session logout` 只访问本地。

## 登录

业务请求由公共传输组件注入 `zjuam`，仅在学在站点会话不可用时委托 CAS。账号来自同一个认证上下文，密码认证和 RSA 始终由 `zjuam` 实现；模块内部只适配 identity 回跳、Cookie/XSRF 和用户 ID。有效的站点缓存不再触发额外 CAS 预检。`session login` 是维护动作，日常业务无需先执行。

`/user/index` → `identity.zju.edu.cn` → `zjuam.zju.edu.cn/cas/login?service=…` → CAS 委托 → identity 回跳 → `/user/index`。兼容 302/303 和 HTML meta refresh。

当前用户数字 ID 来自本人页面注入的 `ng-init="userId=…;"`，缓存在会话文件；不依赖可能为空的 `activity-reads-for-user`。`/api/user` 在当前平台返回 403，不能用来判断登录失败。

JSON 读取遇 401 或登录跳转时合并重登一次；写请求不自动重放。登录和下载错误不会输出带 ticket/token 的完整跳转 URL。

## 端点

| 功能 | 方法与路径 | 主要参数 / 响应 |
|---|---|---|
| 学期 | GET `/api/my-semesters` | `fields=id,name,sort,is_active,code` → `semesters[]` |
| 本人课程 | GET `/api/my-courses` | `conditions` JSON、`page/page_size` → `courses[], pages, total` |
| 课程详情 | GET `/api/courses/{course}` | 课程原字段，含教师、学期、章节 |
| 章节 | GET `/api/courses/{course}/modules` | `modules[].syllabuses[]` |
| 活动 | GET `/api/courses/{course}/activities` | `activities[]`，含 `module_id/syllabus_id/type/uploads/data` |
| 活动详情 | GET `/api/activities/{activity}` | 正文在 `data.description`，附件在 `uploads[]`；作业详情用 |
| 文件下载 | GET `/api/uploads/{upload}/blob` | 302 到 `tcmedia.zju.edu.cn` 等签名下载地址，流式读取 |
| 课程作业 | GET `/api/courses/{course}/homework-activities` | 分页 `homework_activities[]`，包含已提交/未提交/已结束 |
| 本人提交记录 | GET `/api/activities/{activity}/students/{user}/submission_list` | `list[]`，包含草稿状态、附件、正文、提交时间和批改字段 |
| 小组提交记录 | GET `/api/activities/{activity}/groups/{group}/submission_list` | 当前前端可确认的接口；本次无小组样本实测 |
| 原生待办 | GET `/api/todos?no-intercept=true` | `todo_list[]`，作业、考试、测验等 |
| 申请上传（写） | POST `/api/uploads` | JSON `{name,size,parent_type:"submission_upload",parent_id:0,is_scorm:false,embed_material_type:""}` → `{id,upload_url}` |
| 上传字节（写） | PUT 返回的 `upload_url` | multipart `file`，签名 URL 自带授权，不带 Cookie |
| 提交作业（写） | POST `/api/course/activities/{activity}/submissions` | JSON `{uploads:[附件ID],comment,slides:[],is_draft:false}` |
| 撤回（写） | PUT `/api/submissions/{submission}/retract` | JSON `{}`，需平台允许撤回 |
| 当前点名 | GET `/api/radar/rollcalls` | `rollcalls[]`，含 `rollcall_id/is_radar/is_number/status` |
| 本人历史点名 | GET `/api/course/{course}/student/{user}/rollcalls` | `rollcalls[]`：`rollcall_time`（UTC）、`source`（radar/number/qr）、`status`（on_call_fine/absent）、`student_status`（on_call/absent）、`rollcall_status`（finished）；无点名为空数组。同课程的 `/api/course/{course}/rollcalls`、`students_rollcalls` 是教师接口，学生 403；`rollcall-score` 只给次数汇总，不使用。2026-09-28 核对 |

课程条件使用 `semester_id: [ID, …]`、`keyword`、`status: ["ongoing","notStarted","ended"]`。查询自动翻页。章节和活动分开返回，内容树函数按 ID 关联，空章节和未分章活动也保留。

- **当前学期不能只看 `is_active`。** 平台只把长学期标成当前（2026-10 实测只有 `2026-2027秋冬`），同学年的 `2026-2027秋` 不带标记，但秋学期的课正在上。`currentSemesters()` 取带标记的学期，加上同一学年里名称互相包含的学期（秋、冬 ⊂ 秋冬）；待办补查、课程列表默认范围和同名课程的优先级都用它。只按 `is_active` 会漏掉短学期课程的作业。
- **课程 `status` 不能用来判断在不在上。** 2026-10 实测 36 门课里 34 门是 `ongoing`（含去年的课），`end_date` 大多为空。
- 活动列表已带 `data.description`（作业要求、页面正文）和 `data.link`（链接类活动的地址），课程详情不必逐个请求活动详情。
- 文件清单里的 `size` 与下载到的字节数一致（2026-10 实测），用来判断本地文件能否复用。默认保存到 `data/output/xuezai/<课程名>/<文件名>`；同一门课里重名的文件在名字后带平台编号。
- 撤回只针对最近一次提交（网页上的「撤回」按钮同此），所以命令不接收提交记录编号。
- 本人交过的文件与课件走同一个下载接口（`/api/uploads/{id}/blob`），`homework download` 取最近一次提交（与撤回同一条记录），存到 `data/output/xuezai/<课程名>/我的提交/<作业名>/`，老师传回的文件在其下的 `老师批改/`。重交时同名文件内容会变，所以每次重新下载，不按大小复用。
- `submission_correct.uploads` 里名为 `markattatchment.txt` 的不是老师传回的文件，而是平台保存网页批注笔迹的数据（URL 编码的 JSON，内容是各页的 SVG 路径；2026-10 实测，老师在网页上批注一次产生一到两个）。它只用来说明「老师在网页上批注过」（`annotation`），不列入文件、不下载；把笔迹画回 PDF 未做。
- 没有文件的提交记录有两种：老师代为登记的（`submit_by_instructor: true`，如线下交的作业、考试成绩）和纯文字提交，`homework download` 在 `note` 里分别说明。

## 参考实现

参考端点与协议，模块代码独立实现：

- 本地 `ZJU-Course-Autosign` 的 `809a0e0^`：课程分页、活动附件、待办补查。
- [login-zju](https://github.com/5dbwat4/login-zju/blob/main/src/courses.ts)：CAS/identity 与 meta refresh 登录链。
- [vibe-learning-in-zju](https://github.com/EviterLesRoses2/vibe-learning-in-zju/blob/main/zju-mcp.mjs)：两段式上传、提交和撤回接口。
- 当前学在浙大前端与真实只读响应：章节、文件、作业和个人/小组提交记录路径。
