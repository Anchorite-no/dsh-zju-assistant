import test from 'node:test'
import assert from 'node:assert/strict'
import { Alerts, articlesAlert, mailAlert, cc98Alert } from './alerts.mjs'

test('提醒交给壳：一条消息带着标题、一句话的内容和点了去哪；太长的截短，没有标题的不发', () => {
  const sent = []
  const alerts = new Alerts({ send: (message) => { sent.push(message); return true } })
  assert.deepEqual(alerts.push({ title: ' CC98 新消息 ', text: '老王回复了你：\n周六打球吗', sessionId: 'ses_1', panel: 'campus.affairs' }),
    { title: 'CC98 新消息', text: '老王回复了你： 周六打球吗', sessionId: 'ses_1', sent: true })
  assert.deepEqual(sent, [{ type: 'alert', alert: { title: 'CC98 新消息', text: '老王回复了你： 周六打球吗', sessionId: 'ses_1' } }])
  const long = alerts.push({ title: '题'.repeat(40), text: '字'.repeat(100), panel: 'campus.affairs' })
  assert.deepEqual([long.title.length, long.text.length, long.panel], [30, 80, 'campus.affairs'])
  assert.throws(() => alerts.push({ text: '没有标题' }), /提醒要有标题/)
  assert.throws(() => alerts.push({ title: 42 }), /提醒要有标题/)
  assert.equal(sent.length, 2)
})

test('不是壳起的（测试、只起引擎）时没有通道：照样返回这一条，只是没交出去', () => {
  // 测试进程本身就没有和壳之间的通道。
  assert.deepEqual(new Alerts().push({ title: '提醒' }), { title: '提醒', text: '', sent: false })
  // 通道坏了也不让调用的地方出错。
  assert.equal(new Alerts({ send: () => { throw new Error('channel closed') } }).push({ title: '提醒' }).sent, false)
})

test('公众号新文章的说法：一篇写号名和标题，多篇带上一共几篇，点了去「校园事务」', () => {
  assert.equal(articlesAlert([]), undefined)
  assert.deepEqual(articlesAlert([{ from: '浙大体育与艺术', title: '临湖歌会报名' }]), { title: '公众号有新文章', text: '浙大体育与艺术：临湖歌会报名', panel: 'campus.affairs' })
  assert.equal(articlesAlert([{ from: '浙大体育与艺术', title: '临湖歌会报名' }, { from: 'ZJU微计录', title: '周报' }, { from: 'ZJU微计录', title: '招新' }]).text, '浙大体育与艺术：临湖歌会报名 等 3 篇')
})

test('邮箱和 CC98 新消息的说法：一封写发件人和主题、一条写那一行的标题，多的带上一共几封几条；点了去「校园事务」的「个人消息」', () => {
  assert.equal(mailAlert([]), undefined)
  assert.deepEqual(mailAlert([{ from: '王老师', title: '第六周作业' }]), { title: '邮箱有新邮件', text: '王老师：第六周作业', panel: 'campus.affairs:personal' })
  assert.equal(mailAlert([{ from: '王老师', title: '第六周作业' }, { from: '教务处', title: '考试安排' }]).text, '王老师：第六周作业 等 2 封')
  assert.equal(cc98Alert(undefined), undefined)
  assert.deepEqual(cc98Alert([{ title: 'carol发来私信', body: '周六打球吗' }, { title: 'bob回复了「选课咨询」' }]), { title: 'CC98 有新消息', text: 'carol发来私信 等 2 条', panel: 'campus.affairs:personal' })
})
