# macOS 本地聊天接入

macOS 的微信、钉钉插件现在可通过 `wxlocal`、`dtlocal` 读取本机已经同步的聊天。
这是**可选的外部 CLI 后端**，不是免配置的内置解密器；安装 CampusAgent 本身不会安装这些工具或自动获取密钥。
Windows 保留原来的读取实现。

## 与 todohub 的关系

`core/chat/macos.mjs` 将 todohub 的「调用本地 CLI → 归一化消息」设计剥离、移植到现有 Node 聊天接口。
不需要运行 todohub，也不导入其待办库、规则打分、LLM、Web 服务或飞书远程 API。
消息进入 CampusAgent 原有的选群、轮询、原样收集/AI 整理流程。QQ 不在本次范围内。

## 准备

1. 自行准备兼容下述 JSON 契约的 `wxlocal` / `dtlocal`，完成其运行时、账号和本地读取授权配置。
   这些外部工具目前不随本仓库分发，也没有在本仓库提供安装器。已有 todohub 本地环境可以复用同一套 CLI。
2. 在终端确认 `wxlocal accounts`、`wxlocal --account <账号> sessions`、`dtlocal status` 可正常返回 JSON。
   微信需要 Python/SQLCipher 等工具自身依赖及消息分片密钥；钉钉需要工具自己的缓存/同步配置。
   不要将输出中的账号、路径、联系人或密钥贴到公开 Issue。
3. 可执行入口放在 `~/.local/bin/wxlocal`、`~/.local/bin/dtlocal`，或设置绝对路径：

   ```sh
   export CAMPUS_WXLOCAL="/absolute/path/to/wxlocal"
   export CAMPUS_DTLOCAL="/absolute/path/to/dtlocal"
   npm start
   ```

   变量指向可执行文件，不是 shell 命令。若入口需要特定 Python，使用带正确 shebang 的可执行包装脚本。
   Finder 不读取 shell 初始化文件，因此默认优先查 `~/.local/bin`，并为子进程补充 Homebrew 常用路径；不要依赖只在交互 shell 中生效的 alias。
4. 在插件页打开微信聊天或钉钉聊天，选择账号，再选择需要监控的聊天。多账号时不会自动选择最近使用的账号。
   账号绑定写入现有 track；工具切换账号后旧 track 报错，需重新选择，不能串号读取。

手动验证（输出含私密聊天，只在本机查看）：

```sh
node core/wechat/scripts/wechat.mjs profiles
node core/wechat/scripts/wechat.mjs chat list --profile '<账号>' --kind group
node core/wechat/scripts/wechat.mjs chat read --profile '<账号>' --chat '<聊天ID>' --limit 20
node core/dingtalk/scripts/dingtalk.mjs profiles
node core/dingtalk/scripts/dingtalk.mjs chat list --profile '<账号>' --kind group
node core/dingtalk/scripts/dingtalk.mjs chat read --profile '<账号>' --chat '<聊天ID>' --since 2026-10-01
```

## 能力与限制

- 支持 `status`、`profiles`、`chat list/contacts/info/read/search`，复用 `hasMore/nextCursor` 分页。
- `read/search` 必须指定 `--chat`；可按关键词、发送者、类型及时间过滤，不隐式扫描所有私聊。
- 微信 XML 引用、文件名等复用项目现有解析器；不能解码的二进制正文不作为文本返回。
  钉钉返回工具已有的可见文字摘要，不声称保留原始富媒体结构。
- 暂不支持完整成员名单、自动群主/管理员识别和媒体下载，相关命令返回 `capability_unavailable`。
  插件页请使用「所有人」收集；不会把联系人列表冒充群成员。直接 CLI 可按发送者过滤。
- 本机客户端运行时才自动轮询；手动查询可读取已有本地数据。微信的 `--offline` 不访问客户端进程；钉钉暂不提供此开关。
- 微信每次读取指定聊天的本地历史（最多 5 万条），再过滤时间并分页；不是服务端增量查询。
  钉钉将时间范围传给工具，同样最多 5 万条。结果超过上限、32 MiB 或单个子进程 120 秒时明确报错，**不推进监控水位**。
  历史很多的微信群目前可能因此无法同步；不会静默把最新 N 条当完整历史。
- 微信消息分片缺密钥时拒绝读取；底层工具本身必须保证查询完整性。只覆盖本机已经同步的数据，不补拉云端历史。

## 外部工具契约

所有命令必须返回单个 JSON 对象，退出码非零、`error` 或 `ok:false` 都作为失败处理。
错误仅显示脱敏提示，不把原始 stdout/stderr 送入 UI 或日志。

| 工具命令 | 必要输出 |
|---|---|
| `wxlocal accounts` | `accounts:[{account}]` |
| `wxlocal --account ID contacts` | `account, contacts:[{username,remark,nick_name,alias}]` |
| `wxlocal --account ID sessions` | `account, sessions:[{username,is_hidden,last_time}]` |
| `wxlocal --account ID dbs` | `account, dbs:[{path,has_key}]`，包含所有 `message_N.db` |
| `wxlocal --account ID history --chat ID --limit N` | `account, truncated, messages:[{db,local_id,local_type,real_sender,time,content,content_encoding}]` |
| `dtlocal status` | `account:{uid}`；工具应在不可用时以错误退出 |
| `dtlocal conversations --limit N` | `total, conversations:[{cid,title,type,last_message_at}]`，type 为 `group/single` |
| `dtlocal contacts --limit N` | `contacts:[{uid,nick,real_name,remark}]` |
| `dtlocal messages --cid ID --limit N [--since ISO] [--until ISO]` | `total, messages:[{cid,mid,senderId,senderName,createdAt,contentType,content}]` |

时间须带时区；标识应为字符串（数字仅允许 JS 安全整数），工具不能将大整数 ID 舍入。
钉钉 `total` 应是当前筛选条件下的总数，不能只报本页数量。微信 `truncated` 必须准确。
适配器不会执行 SQL、密钥导入、内存扫描或外部消息发送命令。

## 隐私边界

适配器本身不生成明文数据库或查询日志，但**外部工具有自己的磁盘行为**：
`dtlocal` 会刷新明文缓存和 WAL，`wxlocal` 依赖本地保存的密钥；这不等同于 Windows 后端的内存解密。
保护好工具目录、密钥和缓存，不放进仓库或云同步目录。上游选中聊天的监控缓存仍含消息原文；
只有选择 AI 整理时，这些消息才按应用既有逻辑发给已配置的模型。

自动化测试只用合成数据：`npm run test:chats`。真实账号冒烟验证不纳入 CI，也不得提交聊天样本。
