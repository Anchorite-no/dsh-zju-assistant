# 浙大体艺 请求与协议

CLI 用法见 [体艺](../../references/tyys.md)。本文件记录后端地址、会话签名和接口，供开发和排障使用。考勤只读，不提交签到；场馆支持查询、预约、本人订单和取消。

## 后端、会话与签名

| 用途 | 地址 |
|---|---|
| App CAS service | `http://www.tyys.zju.edu.cn/cgapp-server/cas/appLogin` |
| App 用户信息 | `http://tyys.zju.edu.cn/cgapp-server` |
| 课程考勤后端 | `http://www.tyys.zju.edu.cn/ptm` |
| 网页入口 | [体育管理入口](http://www.tyys.zju.edu.cn/ptm/)；跳转 `/ggtypt/login` 并要求 CAS |

模块声明 `auth=cas, network=public`。`openContext` 注入现有 CAS 与 HTTP 组件；体艺只负责将 CAS 委托结果解析为 App 令牌。会话存放在 `data/sessions/tyys.json`，按账号校验，最长缓存 12 小时，并检查 JWT 到期时间。损坏或错账号的 App 缓存自动丢弃并重新认证；令牌格式异常单独报告，仅有效 JWT 的 sub 确实不同才报告登录会话账号不一致。收到 HTTP/业务 401 或业务 2001 时刷新一次。客户端只发 GET。`session login` 仅为维护入口。

五段 `jwtToken` 的前三段作为 `cgAuthorization`，第四段解出签名材料。请求携带 `cgAuthorization/timestamp/sign/app-key/v1/imei`，路径为 `/api/...`，不包含 `/ptm`。

## 考勤接口

下列路径相对 `/ptm`，都是只读。

| 用途 | 方法与路径 | 参数 | 说明 |
|---|---|---|---|
| 学期 | GET `/api/l/v6/termlist` | 无 | 2020 年起全部学期，`thisTerm=true` 为当前；历史学期同样可查课程、考勤与课次 |
| 本人课程 | GET `/api/l/v6/student/courselist` | `termId, schoolYear, uid` | 使用字符串 `courseId` |
| 本人考勤 | GET `/api/l/v6/student/attendancelist` | `uid, courseId` | `detail[]` 含 `teachingWeek, status, isEarly, time, type`，只列已有记录的课次；`time` 是业务记录附带的时间，可能因补记晚于上课日，不能用来判断上课日期。课次日期取 course_times。汇总 `shouldReach` 为应上次数，`lack` 把还没上的课次也算入，历史记录按 `detail` 自算 |
| 课次表 | GET `/api/l/v6/course_times` | `courseId` | 行含 `date, teachingWeek, isDelete` 等；课次由教师动态建立，可能尚无当天或未来课次，不能当完整课表 |

状态码：-1 停课、0 未考勤、1 到、2 缺勤、3 早退、4 病假、5 事假、6 迟到、7 未确认。

## 场馆预约

2026-09-25/26 按网页前端逐项核对，并在本机直连只读实测到预下单为止；验证码只取题未校验，未提交、未支付。2026-10-03 补核预约须知接口、前端日期计算与单场馆当日查询，均为只读；正常查询已返回 200。

当前实现：`venue.ts` 负责网页客户端、签名、须知和时段；`booking.ts` 负责一次调用的预约、同伴、支付、订单和取消；`captcha.ts` 把点字验证码交给多模态模型认（见下面「验证码识别」）。CLI 注册仍在 `cli.ts`。

网页会话按账号隔离缓存四小时，目录和须知缓存一天。业务码 408 立即停止；不会启用批量扫描、全局请求预算或自行设置数日封禁。放号前根据须知和该场馆当前可选天数等待，放号后最初五秒沿用单目标 250 毫秒轮询，此后五秒一轮，命中立即走下单与回查。请求不并行。

写前 JSONL 按账号保存到 `data/journal/tyys-venue-<hash>.jsonl`。begin 必须落盘才提交；确认或明确拒绝后记 resolved。相同日期与时段再次调用时，先回查该目标的未决操作；响应丢失不重放提交或付款。对已有未支付订单可以在当前授权内完成付款，但一次调用返回 recovered-previous-operation 时只恢复上次记录，不接着做新操作。

### 验证码识别

2026-10-12 用户定的：和微信公众号插件一样，把验证码交给模型认，不再用本地的识别模型。原来那一套是 Python（ddddocr、PaddleOCR、PaddlePaddle，装好 893 MB），连同 `scripts/tyys/captcha.py`、`tyys venue setup`、`tyys venue check` 一起删了，没有留别名。

做法（`captcha.ts`）：题图是 310×155 的 PNG，用 pngjs 双线性放大三倍，连题目一起交给模型。让模型把图里的字全认一遍并给出每个字的中心坐标（图里通常四个字，一个是干扰项），只要 JSON；题目里的三个字各认出正好一个，才按题目顺序把坐标除以三交去校验，否则这道题不答，换一道。一次预约最多取三道题。

模型用的是校园智能体里用户现在选的那一个（2026-10-12 用户定的：走引擎的模型服务，登录 ChatGPT 的也要能用）。这条命令是引擎启动的另一个进程，够不着引擎的模型服务，所以中间有一条管道：

- 引擎进程一启动就定下管道的地址，放进环境变量 `CAMPUS_MODEL_ENDPOINT`（`desktop/host.mjs`），它后面启动的命令都读得到。引擎这一头在 `ui/profile/vision.mjs` 听着。
- 一条连接问一次。命令写一行 JSON `{ text, image, mediaType }`（image 是 base64），引擎回一行 `{ ok: true, text }` 或 `{ ok: false, code, message }`。
- 引擎那头用新对话默认的那个模型问：先看它收不收图，不收就回 `needs_user`；思考开到这个模型最低的一档（DeepSeek 是 `off`，GPT 关不掉，用 `low`）。引擎的模型服务不直接收图，图要先存进它的附件库再引用，问完就从库里删掉（`ui/profile/model.mjs`）。
- 没有 `CAMPUS_MODEL_ENDPOINT`（脱离应用单独用这份 core，或者在终端里直接跑命令）时报 `DEPENDENCY_MISSING`，约不了要验证码的场地。开发时要测这一段，得先起一个引擎（`node desktop/host.mjs`，事先把 `CAMPUS_MODEL_ENDPOINT` 设成一个自己知道的管道名），再带着同一个环境变量跑命令。

实测分两轮。第一轮是定问法，命令直接调 DeepSeek 的 chat-completions 接口（`deepseek-flash`，temperature 0，要 JSON）；第二轮是改成走引擎以后的复测，在下面单列。

第一轮（2026-10-12，本机直连，真实账号；只取题和校验，没有预下单、没有提交）：

| 问法 | 场馆校验的结果 |
|---|---|
| 照微信公众号插件的问法：原图、要像素坐标、思考 high | 6 道过 3 道。字认对了，坐标偏 10 到 50 像素 |
| 放大三倍、只要三个字的坐标、不开思考 | 6 道过 3 道。坐标准了，错在把旋转的字认成别的字或者认不出 |
| 放大三倍、先把图里的字认全、认不齐换题、不开思考（现在的做法） | 取 9 道：8 道作答，全部通过；1 道没认齐，换题。每道 0.8 到 1.5 秒 |

存下的 20 道题离线比过（参考坐标是旧本地识别的框中心，或者实测通过的坐标；只调模型）：

| 问法 | 有参考且作答的题里，三个点都在 10 像素内的 | 平均耗时 |
|---|---|---|
| 现在的做法（用正式的 `CaptchaSolver` 跑的） | 17 道里 16 道；1 道把两个旋转的字认反了，另有 1 道没认齐换题 | 0.9 秒 |
| 同样的问法，不放大 | 17 道里 1 道 | 1.0 秒 |
| 同样的问法，开思考 | 17 道里 14 道 | 4.3 秒 |
| 放大用 sharp 的 lanczos 而不是 pngjs | 17 道里 16 道，和 pngjs 一样 | 1.0 秒 |

旧的本地识别在其中 14 道上跑过：3 道解不出，每道约 3 秒，另加 5.5 秒预热。

第二轮，走引擎的模型服务（2026-10-12）。起了一个隔离的引擎（数据目录是临时的，密钥文件是开发用的那份的副本，模型是引擎默认选的 DeepSeek），正式的 `CaptchaSolver` 经管道问它：

| 检查 | 结果 |
|---|---|
| 存下的 20 道题，跑了两遍 | 第一遍：作答 17 道，15 道三个点都在 10 像素内，1 道偏 12 像素，1 道把旋转的字认反；1 道换题。第二遍：作答 16 道，15 道在 10 像素内，1 道偏 16 像素；2 道换题 |
| 耗时 | 一般 0.8 到 1.4 秒，比直接调接口慢零点几秒。两遍里各有一道等了十几秒（11 秒、15 秒），原因没查，可能是第一次没问成、照默认的思考强度又问了一次 |
| 真实题目（取题、识别、校验） | 4 道：3 道作答，全部通过，各约 1.1 秒；1 道没认齐，换题 |
| 附件库 | 问完就删：同样 20 道跑第二遍以后，库里第一遍留下的 20 张图也没了。另有一份上传记录 `llm-deepseek/files-v3.json`，一张图约 0.4 KB，是引擎自己记的，没有动 |

取题有次数限制：这次测试约 12 分钟里取了 29 道（最后 25 秒里 9 道）以后，再取时返回「验证码次数超出限制，请稍后再操作！」。这是业务拒绝，不是 408；约六分钟后再取已经正常，限制按什么窗口算没有细测。所以一次预约最多取三道，开发时也不要连着取题。

没有验证的：

- 登录 ChatGPT 时用 GPT 认。这台机器上没有登录着的 ChatGPT 账号，只有自动测试里用假模型核过「关不掉思考就用最低一档」这条路。GPT 给的坐标准不准、要等多久，都没有数据。
- 改完以后的一次真实预约（预下单、验证码、提交连起来）。
- 在打开的应用里由助手跑 `tyys venue book` 时，命令是不是读得到 `CAMPUS_MODEL_ENDPOINT`。隔离引擎的测试里，这个环境变量是我在命令这一头自己设的。
- 装好的应用。

后端 `http://www.tyys.zju.edu.cn/venue-server`，与课程考勤 `/ptm` 是两套系统。App 内的场馆预约只是 WebView 打开同一网页；签到用的 App JWT 直接作 `cgAuthorization/cgappauthorization` 发来返回 401，所以用网页登录：

1. CAS service `http://tyys.zju.edu.cn/venue-server/sso/manageLogin`，回跳到 `/venue/login?oauth_token=…`。
2. POST `/api/login`，头 `oauth-token`，空表单；返回 `roles` 与 `token.access_token`。
3. POST `/roleLogin`，表单 `roleid=3`（学生，账号只有这一个角色），头 `cgAuthorization` 为上一步令牌；返回新令牌、`ruleList`。令牌有效期 4 小时，之后请求都带 `cgAuthorization`。

请求约定（前端 `emitAjax` 与 `$http`）：表单编码；GET 参数进查询串并自动加 `nocache=timestamp`；值为 null/undefined 的字段不发送。签名 `md5(salt + path + Σ(key+value) + timestamp + " " + salt)`，key 按字典序，跳过空串、null 和对象值，path 为 `/api/...`（不含 `/venue-server`）；头 `app-key/timestamp/sign`。salt 与 app-key 同旧项目 zju-room-booker `signer.py`。不需要 Referer/Origin。业务码：200 成功，401「请登录后访问」，250「最多只能查看3天后的预约」，408「访问频繁，限制访问中...」。408 是按账号的频率限制：2026-09-26 约 20 分钟内发出约 300 个请求（其中一次 15 秒内约 100 个）后触发，之后所有 day/info 都返回 408，间隔 0.7 秒也不放行；登录接口仍可用。用户以前被封过 72 小时。开发探测只查单个场地、少量请求，不做批量扫描。

| 用途 | 方法与路径 | 学生实际发送的参数 | 说明 |
|---|---|---|---|
| 预约须知与放号时间 | GET `/api/front/website/protocols/code/RESERVATION_PROTOCOL`（未登录）；GET `/api/protocols/code/RESERVATION_PROTOCOL`（登录后） | 无 | 预约页弹窗实际使用的接口，返回 `title, content, protocolCode, autoPopup, staySec` 等；`content` 为 HTML。公开入口无需账号登录，仍按前端附请求签名。含校区和场馆放号时间、同伴码及预约规则 |
| 网站通知列表与正文 | GET `/api/front/website/articles`；GET `/api/front/website/articles/{id}` | 列表 `page=0, size=20`，可选 `catalogTitle` | 这是普通通知栏目，与预约须知分开；本次公开列表为空。不能据此判断没有预约须知 |
| 场地目录 | GET `/api/reservation/campus/venue/info` | 无 | `venueSiteInfo` 按场馆分组；历史 54 个场地中 29 个 `isArt=1`（琴房、艺术教室，已迁出，过滤）；`sportName` 部分为 null。`reservationNumMax=2` 是一次最多选的格数；`advanceReservationDays` 是含当天的当前可选天数，前端最大日期为 `today + advanceReservationDays - 1`，不能直接作为“几天后”偏移量；当日时段响应可覆盖目录值 |
| 某日时段 | GET `/api/reservation/day/info` | `venueSiteId, searchDate` | 可查范围按场地而定：多数场地为今天到后天，足球场（47、48、59、62）可到 4 天后；新的一天在该场地放号前返回 250，放号后才出现（紫金港羽毛球、网球 9/26 14:00 前已放出后天，华家池 41、64 此时仍为 250）。`reservationDateSpaceInfo[date]` 每个场地（`id, spaceName`）以 timeId 为键给出时段：`reservationStatus` 1 空闲、2 不开放、3 未支付占位、4 已预约，`startDate/endDate`，`orderType=5` 为管理员批量订场。放号前该日场地没有时段键。`token` 供预下单和提交使用，`reservationDateList[0]` 即 weekStartDate |
| 预下单 | POST `/api/reservation/order/info` | `venueSiteId, reservationDate, weekStartDate, reservationOrderJson, schoolType=1, token` | `reservationOrderJson=[{"spaceId","timeId","venueSpaceGroupId":null}]`。返回 `venueInfoBean`（`buddyNumMin/Max, isFee, reserveTip`）、`phone`、`buddyList`（`id,name,userId,userRoleId…`）、`isCaptchaCheck`、`orderDetailList`（无价格）。实测不占场、不生成订单 |
| 验证码取题 | GET `/api/captcha/get` | `captchaType=clickWord, clientUid, ts` | `repData`：`token, secretKey, wordList`（3 个汉字）、`originalImageBase64`（310×155 PNG） |
| 验证码校验 | POST `/api/captcha/check` | `captchaType, pointJson, token` | 按顺序点 3 字，坐标取图片像素；有 secretKey 时 `pointJson=AES-ECB-PKCS7(JSON(points))`，`captchaVerification=AES(token+"---"+JSON(points))`，均 Base64；`repCode=0000` 为通过 |
| 提交 | POST `/api/reservation/order/submit` | 预下单字段 + `phone, buddyIds, buddyNo, captchaVerification, isOfflineTicket=1`，`token` 仍为 day/info 的 | `reservationOrderJson` 最多 2 格；连续两小时即同一场地相邻两个 timeId。`buddyIds` 为同伴记录 id 逗号串（`GET /api/buddies` 的 `id`）；账号带 `VipCheckBuddyNo` 规则时 `buddyNo` 为对应同伴的 5 位同伴码。返回 `orderInfo`（`id, tradeNo, amountFee, expireTime`） |
| 同伴码 | POST `/api/vip/view/buddy_no` | 无 | 只能看登录账号本人的码：5 位数字字符串，连续查看两次不变。用户说明每次被使用后刷新，所以要在提交前以同伴账号登录读取。`POST /api/vip/check/buddy_no`（`buddyUserId, buddyRoleId, buddyNo`）返回 `checkResult` 可预先校验 |
| 支付确认 | POST `/api/venue/finances/order/pay` | `venueTradeNo, isApp=0`；收费单另加 `payType=1, paySecret` | 零元单不发 `payType`；不确认约 3 分钟后订单取消。`payType=1` 为校园卡，`paySecret` = AES-CBC-PKCS7(校园卡查询密码, key `c1h2i5n6g2o2k4a7`, iv `C2H3I4N5G2O3K1E4`) 的十六进制密文（前端 `keySetPassword`） |
| 我的订单 | GET `/api/orders/mine` | `page, size` | 分页 `content[]`：`tradeNo, venueSiteId, reservationDateDetail, reservationStartDate, orderStatus`（1 正常、2 已取消、3 占用）、`payStatus`（1 未支付、2 已支付、3–5 退款）、`amountFee, promiseStatus` |
| 取消 | POST `/api/venue/finances/order/cancel` | `venueTradeNo` | 公告：付费场地一经预约不予取消；逾期未入场且未取消影响后续资格 |

旧项目的琴房经验：提交距预下单过快会被拒（「预约步骤流程耗时异常」），当时稳定值为 1.5 秒。

### 预约须知与日期口径

2026-10-03 从当前前端 `chingo.2fa40da1.js` 及其懒加载块定位：预约页块 `chunk-3cc3ae64` 按是否登录选择上述 protocol 接口；日期选择块 `chunk-7fcac090` 的 `disabledDate` 和下一天按钮都使用 `advanceReservationDays - 1`。业务码 250 的文案不能取代这个日期计算。

预约须知正文列明每日释放预约名额的时刻：紫金港网球 08:00、紫金港羽毛球 09:00、玉泉羽毛球 12:00、华家池羽毛球与膜顶网球 18:00。该段落署期 2024-10-17，目前仍由官方接口返回；不是场馆每天开门营业的时刻。正文还明确同伴码预约成功后失效；稀缺场地按一小时/场次、每账号每日最多一场次，最终可选格数仍要结合场馆实际规则校验。

2026-10-03 北京时间 02:43，目录及紫金港体育馆羽毛球当天的 day/info 均返回 `advanceReservationDays=2`，当天查询成功；查询 10-06（真实三天后）返回 250。已有 09-26 13:57 原始记录显示该场馆 09-28 已开放、09-29 仍为 250。结合前端计数与 09:00 放号规则，现有证据支持“放号前含当天两天、放号后含当天三天”的解释，尚未对本次放号边界做前后实测。

因此 CLI 必须分开处理用户的日历偏移与平台当前开放窗口。用户说三天后就是日历加三天，不能改成加两天；以该场馆现有规则推算，目标日历加三天的预约要等次日 09:00 才进入窗口。若规则或服务端结果变化，应保留目标日期重新判断，不回退到其他日期。公开输入按用户要求限定为今天至三天后，历史足球场更长窗口不扩大该范围。
