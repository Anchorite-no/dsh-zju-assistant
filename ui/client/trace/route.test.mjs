import test from 'node:test'
import assert from 'node:assert/strict'
import { describeCall } from './parse.ts'
import { buildRoutes, formatDuration } from './route.ts'

const SKILL = 'node C:\\skills\\zju\\scripts\\zju.ts'
let seq = 100
/** 一次调用；done 给 false 是没成功，不给是还没结果。 */
function call(step, command, done, turn = 1) {
  seq += 1
  const action = command.startsWith('@')
    ? describeCall(command.slice(1), '{}')
    : describeCall('pwsh', JSON.stringify({ command: `${SKILL} ${command}` }))
  return {
    callId: `c${seq}`, turn, step, seq, at: seq * 1000, action,
    ...(done === undefined ? {} : { done: { at: seq * 1000 + 2000, outcome: { ok: done } } }),
  }
}
const turn = (number, startSeq, open = false, extra = {}) => ({ turn: number, startSeq, startAt: startSeq * 1000, ...(open ? {} : { endAt: startSeq * 1000 + 60000 }), open, aborted: false, ...extra })
/** 主线上的本地操作写成「本地×几次」；支线上的站用「→」连，同一个岔口的几条支线用「|」隔开、外面加方括号。 */
const shape = route => route.segments.map((segment) => {
  if (segment.type === 'local') return `本地×${segment.stop.calls.length}`
  const branches = segment.branches.map(branch => branch.map(stop => `${stop.site}×${stop.calls.length}`).join(' → '))
  return branches.length === 1 ? branches[0] : `[${branches.join(' | ')}]`
})
const only = route => route.segments[0].branches[0][0]

test('同一步里做的不同的事从同一个岔口分出去；接着在其中一个网站上做的，接在那条支线下面', () => {
  const [route] = buildRoutes({
    turns: [turn(1, 50)],
    asks: [{ seq: 51, text: '下周有哪些二课活动能报' }],
    calls: [call(1, 'zdbk timetable', true), call(1, 'sztz activity list', true), call(2, 'sztz activity mine', true)],
  })
  assert.equal(route.question, '下周有哪些二课活动能报')
  assert.deepEqual(shape(route), ['[教务网×1 | 素质拓展平台×1 → 素质拓展平台×1]'])
  assert.deepEqual(route.sites, ['教务网', '素质拓展平台'])
  assert.equal(route.queries, 3)
  assert.equal(route.ms, 60000)
})

test('换了一个网站另起一条支线，不和上一条共用岔口', () => {
  const [route] = buildRoutes({
    turns: [turn(1, 50)],
    asks: [],
    calls: [call(1, 'zdbk timetable', true), call(2, 'sztz activity list', true), call(3, 'zdbk timetable', true)],
  })
  assert.deepEqual(shape(route), ['教务网×1', '素质拓展平台×1', '教务网×1'])
})

test('同一个网站上的同一种动作合成一站：同一步的几次，和连着的几步；换了动作接在同一条支线上', () => {
  const [route] = buildRoutes({
    turns: [turn(1, 50)],
    asks: [],
    calls: [
      call(1, 'cc98 search --keyword 高数'), call(2, 'cc98 search --keyword 微积分', true), call(2, 'cc98 search --keyword 数分', true),
      call(3, 'cc98 topic view --id 1', true), call(4, 'cc98 topic view --id 2', true), call(4, 'cc98 topic view --id 3', false),
    ].map(item => item.done ? item : { ...item, done: { at: item.at + 1000, outcome: { ok: true } } }),
  })
  assert.deepEqual(shape(route), ['CC98×3 → CC98×3'])
  const view = route.segments[0].branches[0][1]
  assert.equal(view.failed, 1)
  assert.equal(view.status, 'done')
})

test('连着几步都是同样的几件事并排做，各自接在自己那条支线上', () => {
  const [route] = buildRoutes({
    turns: [turn(1, 50)],
    asks: [],
    calls: [
      call(1, 'cc98 topic view --id 1', true), call(1, 'cc98 search --keyword a', true),
      call(2, 'cc98 topic view --id 2', true), call(2, 'cc98 topic view --id 3', true), call(2, 'cc98 search --keyword b', true),
      call(3, 'cc98 search --keyword c', true), call(3, 'cc98 topic view --id 4', true),
    ],
  })
  assert.deepEqual(shape(route), ['[CC98×4 | CC98×3]'])
  assert.deepEqual(route.segments[0].branches.map(branch => branch[0].label), ['看帖', '搜帖子标题'])
})

test('同一步的两件事接不到两条不同的支线上，就另起一个岔口', () => {
  const [route] = buildRoutes({
    turns: [turn(1, 50)],
    asks: [],
    calls: [
      call(1, 'cc98 search --keyword a', true),
      call(2, 'cc98 topic view --id 1', true), call(2, 'cc98 board list', true),
      call(3, 'cc98 search --keyword b', true), call(3, 'zdbk timetable', true),
    ],
  })
  assert.deepEqual(shape(route), ['CC98×1', '[CC98×1 | CC98×1]', '[CC98×1 | 教务网×1]'])
})

test('本地操作合成主线上的一站；夹在中间时把前后的支线隔开', () => {
  const [route] = buildRoutes({
    turns: [turn(1, 50)],
    asks: [],
    calls: [call(1, '@skill', true), call(1, 'zdbk timetable', true), call(2, '@read', true), call(3, '@write', true), call(4, 'zdbk timetable', true)],
  })
  assert.deepEqual(shape(route), ['本地×1', '教务网×1', '本地×2', '教务网×1'])
  assert.deepEqual(route.sites, ['教务网'])
  assert.equal(route.queries, 2)
})

test('状态：还在跑、全没成功、这一轮结束了却没等到结果', () => {
  const live = buildRoutes({ turns: [turn(1, 50, true)], asks: [], calls: [call(1, 'zdbk grades')] })[0]
  assert.equal(only(live).status, 'running')
  assert.equal(only(live).ms, undefined)
  assert.equal(live.ms, undefined)
  const cut = buildRoutes({ turns: [turn(1, 50, false, { aborted: true })], asks: [], calls: [call(1, 'zdbk grades')] })[0]
  assert.equal(only(cut).status, 'stopped')
  assert.equal(cut.aborted, true)
  const failed = buildRoutes({ turns: [turn(1, 50)], asks: [], calls: [call(1, 'zdbk grades', false)] })[0]
  assert.equal(only(failed).status, 'failed')
})

test('每一轮配自己的提问；没有提问也没有调用的轮不出现；只聊天的轮没有站', () => {
  const routes = buildRoutes({
    turns: [turn(1, 10), turn(2, 20), turn(3, 30), { turn: 4, open: false, aborted: false }],
    asks: [{ seq: 11, text: '第一问' }, { seq: 31, text: '第三问' }],
    calls: [call(1, 'zdbk exams', true, 3), call(1, 'zdbk exams', true, 4)],
  })
  assert.deepEqual(routes.map(route => [route.turn, route.question, route.segments.length]), [[1, '第一问', 0], [3, '第三问', 1], [4, undefined, 1]])
})

test('用时的写法', () => {
  assert.deepEqual([400, 3200, 60000, 80000].map(formatDuration), ['1 秒', '3 秒', '1 分', '1 分 20 秒'])
})
