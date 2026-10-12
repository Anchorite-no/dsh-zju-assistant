import test from 'node:test'
import assert from 'node:assert/strict'
import { describeCall, outcomeOf, readOutcome, readShellOutcome, readToolOutcome, resultText, shellWords } from './parse.ts'

const pwsh = (command, description) => describeCall('pwsh', JSON.stringify({ command, ...(description ? { description } : {}) }))
const SKILL = 'node C:\\Users\\someone\\skills\\zju\\scripts\\zju.ts'

test('校园命令认出网站、动作和针对什么', () => {
  const action = pwsh(`${SKILL} cc98 search --keyword "高数 期末" --limit 20`)
  assert.equal(action.kind, 'campus')
  assert.equal(action.site, 'CC98')
  assert.equal(action.label, '按标题搜索帖子')
  assert.equal(action.about, '高数 期末')
  assert.equal(action.key, 'cc98 search')
})

test('命令前后有别的东西也认得出：环境变量、管道、重定向', () => {
  const action = pwsh(`$env:ZJU_ALLOW_WRITE=1; ${SKILL} sztz activity signup --name '新生杯 辩论赛' --confirm 2>&1 | Select-Object -First 20`)
  assert.equal(action.site, '素质拓展平台')
  assert.equal(action.label, '报名活动')
  assert.equal(action.about, '新生杯 辩论赛')
  assert.equal(action.write, true)
  assert.equal(pwsh(`${SKILL} zdbk timetable 2>$null`).label, '读取本学期课表')
})

test('加 --cancel 的是取消，和不加的不合成一站', () => {
  const cancel = pwsh(`${SKILL} sztz activity signup --name 辩论赛 --cancel --confirm`)
  assert.equal(cancel.label, '取消活动报名')
  assert.equal(pwsh(`${SKILL} cc98 floor like --floor 3 --cancel`).label, '给楼层点赞或点踩（取消）')
  assert.notEqual(cancel.key, pwsh(`${SKILL} sztz activity signup --name 辩论赛 --confirm`).key)
})

test('带网址的命令留下网址，针对什么只写主机名', () => {
  const action = pwsh(`${SKILL} notice view --url https://jwbinfosys.zju.example/notice/1.htm`)
  assert.equal(action.link, 'https://jwbinfosys.zju.example/notice/1.htm')
  assert.equal(action.about, 'jwbinfosys.zju.example')
})

test('不访问网站的模块、看用法、不认识的命令都算本地操作', () => {
  assert.deepEqual([pwsh(`${SKILL} doc text --file a.pdf`).kind, pwsh(`${SKILL} doc text --file a.pdf`).label], ['other', '把文档转成文字'])
  assert.equal(pwsh(`${SKILL} xuezai homework --help`).label, '查看命令用法')
  assert.equal(pwsh(`${SKILL} xuezai nosuch --course 1`).kind, 'other')
})

test('别的命令用模型自己写的说明', () => {
  const action = pwsh('Get-ChildItem D:\\Document', '列出文档目录')
  assert.deepEqual([action.kind, action.label, action.about], ['other', '运行命令', '列出文档目录'])
})

test('引擎自带的工具', () => {
  const search = describeCall('web_search', JSON.stringify({ query: '浙大 校历 2026' }))
  assert.deepEqual([search.kind, search.site, search.about], ['web', '联网搜索', '浙大 校历 2026'])
  const fetch = describeCall('web_fetch', JSON.stringify({ url: 'https://www.example.edu/calendar' }))
  assert.deepEqual([fetch.kind, fetch.site, fetch.link], ['web', 'www.example.edu', 'https://www.example.edu/calendar'])
  const read = describeCall('read', JSON.stringify({ file_path: 'D:\\notes\\课表.md' }))
  assert.deepEqual([read.kind, read.label, read.about], ['other', '读取文件', '课表.md'])
  assert.equal(describeCall('campus_profile_write', JSON.stringify({ title: '本学期课程' })).label, '更新记忆')
  const unknown = describeCall('mystery', 'not json')
  assert.deepEqual([unknown.label, unknown.command], ['其他操作', 'mystery not json'])
})

test('脚本路径先存进变量、在循环里调用，也认得出', () => {
  const action = pwsh('$zju = "C:\\skills\\zju\\scripts\\zju.ts"\nforeach ($d in @("2026-10-12","2026-10-13")) { node $zju sztz activity list --date $d 2>$null }')
  assert.deepEqual([action.kind, action.site, action.label, action.about], ['campus', '素质拓展平台', '查看还能报名的活动', undefined])
  assert.equal(pwsh('$zju = "C:\\skills\\zju\\scripts\\zju.ts"; Get-Item $zju').kind, 'other')
})

test('编号这种纯数字的参数不当成「针对什么」', () => {
  assert.equal(pwsh(`${SKILL} cc98 topic view --id 6012345`).about, undefined)
  assert.equal(pwsh(`${SKILL} cc98 topic view --id "6012345|6012399" --only 楼主`).about, '楼主')
})

test('参数里带竖线的不会被当成管道切开', () => {
  assert.equal(pwsh(`${SKILL} xuezai material download --course 微积分 --name "讲义1.pdf|讲义2.pdf"`).about, '微积分 · 讲义1.pdf|讲义2.pdf')
})

test('切词认引号，到管道和重定向为止', () => {
  assert.deepEqual(shellWords(' a "b c" \'d e\' --x=1 2>&1 | more'), ['a', 'b c', 'd e', '--x=1'])
  assert.deepEqual(shellWords('one; two'), ['one'])
})

test('结果文字：text 块，或者再包一层 tool-result', () => {
  assert.equal(resultText([{ type: 'text', text: 'a' }, { type: 'tool-result', content: [{ type: 'text', text: 'b' }] }]), 'ab')
})

const envelope = (data, extra = {}) => JSON.stringify({ ok: true, system: 'sztz', action: 'activity.list', source: 'live', generated_at: 'x', meta: {}, data, ...extra }, null, 2)

test('完整的结果：数出条数，取前几条的标题', () => {
  const outcome = readOutcome(envelope({ now: 'x', activities: [{ title: '辩论赛' }, { name: '志愿服务' }, { id: 3 }] }), false)
  assert.deepEqual(outcome, { ok: true, count: 3, titles: ['辩论赛', '志愿服务'] })
  assert.deepEqual(readOutcome(envelope([]), false), { ok: true, count: 0 })
})

test('数据里有两份列表就不猜条数', () => {
  assert.deepEqual(readOutcome(envelope({ semesters: [{ a: 1 }], courses: [{ b: 1 }] }), false), { ok: true })
})

test('用的缓存会标出来', () => {
  assert.equal(readOutcome(envelope({ courses: [{ name: '微积分' }] }, { source: 'cache' }), false).cached, true)
})

test('命令报错：取原因', () => {
  const text = `${JSON.stringify({ ok: false, system: 'zdbk', action: 'grades', generated_at: 'x', error: { code: 'AUTH', message: '还没有填统一身份认证的密码' } }, null, 2)}\n[exit code: 3]`
  assert.deepEqual(readOutcome(text, false), { ok: false, error: '还没有填统一身份认证的密码' })
})

test('输出被截掉了开头：不报条数，只看出错标记，不看退出码', () => {
  const tail = '        "title": "某通知"\n      }\n    ]\n  }\n}\n(output truncated)'
  assert.deepEqual(readOutcome(tail, false), { ok: true })
  assert.deepEqual(readOutcome(`${tail}\n[exit code: 1]`, false), { ok: true })
  assert.deepEqual(readOutcome('', true), { ok: false })
})

test('前面有别的输出也找得到结果', () => {
  assert.equal(readOutcome(`[stderr]\n[zju] 正在登录\n${envelope([{ title: 'a' }])}`, false).count, 1)
})

// 下面几条的输出照 2026-10-12 的两次真实对话写：一次让它往 D 盘根目录写文件，一次读学在浙大的作业附件。
test('别的命令行：退出码不是 0 就是没成功，引擎没标出错也算；原因取它自己报的第一句', () => {
  const denied = [
    '[stderr]',
    "Set-Content: Access to the path 'D:\\campus-sandbox-test.txt' is denied.",
    'Get-Content: 找不到路径“D:\\campus-sandbox-test.txt”，因为该路径不存在。',
    '[sandbox: file access denied under workspace-write mode]',
    '[sandbox: escalation available — retry this exact command once with sandbox_permissions (the narrowest wider mode that suffices) + justification; the approval prompt asks the user]',
    '[exit code: 1]',
  ].join('\n')
  assert.deepEqual(readShellOutcome(denied, false), { ok: false, error: "对话的权限不让读写这个位置：Set-Content: Access to the path 'D:\\campus-sandbox-test.txt' is denied." })
  assert.deepEqual(readShellOutcome('hello\n', false), { ok: true })
  assert.deepEqual(readShellOutcome('Monday\n[stderr]\nWARNING: 慢\n', false), { ok: true })
  assert.deepEqual(readShellOutcome('(no output)\n[exit code: 2]', false), { ok: false, error: '命令没有成功，退出码 2' })
  assert.deepEqual(readShellOutcome('正在下载\n[timed out after 120000ms]\n[killed by signal: SIGTERM]', false), { ok: false, error: '等了 120 秒没有跑完，被停掉了' })
  assert.deepEqual(readShellOutcome('一半\n[killed by signal: SIGKILL]', false), { ok: false, error: '被中止了（SIGKILL）' })
  // 输出里有一行长得像标记、但不在最后，不算。
  assert.deepEqual(readShellOutcome('[exit code: 1]\n上一次的日志\n', false), { ok: true })
})

test('引擎自带的工具：只看出错标记，原因是结果里写的那句', () => {
  const glob = 'Error: glob search failed (exit 2): rg: C:\\文档\\课程: 系统找不到指定的文件。 (os error 2)'
  assert.deepEqual(readToolOutcome(glob, true), { ok: false, error: 'glob search failed (exit 2): rg: C:\\文档\\课程: 系统找不到指定的文件。 (os error 2)' })
  // 读到的文件最后一行碰巧是这个，不是这一步的退出码。
  assert.deepEqual(readToolOutcome('日志的最后一行\n[exit code: 1]', false), { ok: true })
  assert.deepEqual(readToolOutcome('', true), { ok: false })
  assert.deepEqual(readToolOutcome('Error: 写不进去\n[sandbox: file access denied under read-only mode]', true), { ok: false, error: '对话的权限不让读写这个位置：写不进去' })
})

test('按是哪一种调用来读结果；不访问网站的校园命令也看信封', () => {
  const missing = `${JSON.stringify({ ok: false, system: 'doc', action: 'text', generated_at: 'x', error: { code: 'DEPENDENCY_MISSING', message: '文档解析环境尚未安装', hint: 'zju doc setup' } }, null, 2)}\n[exit code: 1]`
  const doc = pwsh(`${SKILL} doc text --file a.pdf`)
  assert.equal(doc.kind, 'other')
  assert.deepEqual(outcomeOf(doc, missing, false), { ok: false, error: '文档解析环境尚未安装' })
  assert.equal(outcomeOf(pwsh('Get-ChildItem D:\\'), '(no output)\n[exit code: 1]', false).ok, false)
  assert.equal(outcomeOf(describeCall('glob', '{"pattern":"**/*"}'), 'Error: 找不到', true).error, '找不到')
  assert.equal(outcomeOf(describeCall('web_fetch', '{"url":"https://www.example.edu/"}'), 'Error: 404', true).error, '404')
  // 校园命令的退出码不作数（见 readOutcome），但没等它说完就被停掉的算没成功。
  const campus = pwsh(`${SKILL} cc98 search --keyword 高数`)
  assert.deepEqual(outcomeOf(campus, `${envelope([{ title: 'a' }])}\n[exit code: 1]`, false), { ok: true, count: 1, titles: ['a'] })
  assert.deepEqual(outcomeOf(campus, '[stderr]\n[zju] 正在登录\n[timed out after 120000ms]\n[killed by signal: SIGTERM]', false), { ok: false, error: '等了 120 秒没有跑完，被停掉了' })
})
