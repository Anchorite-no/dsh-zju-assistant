import test from 'node:test'
import assert from 'node:assert/strict'
import { APP_PLUGINS, GENERAL_PLUGINS, PLUGIN_GROUPS } from './pluginCatalog.ts'

test('插件页四类：每个插件只在一类里出现一次，没有漏掉的，也没有不认识的', () => {
  assert.deepEqual(PLUGIN_GROUPS.map(group => group.title), ['课程与学习', '消息与资讯', '校园生活', '基础能力'])
  const listed = PLUGIN_GROUPS.flatMap(group => group.plugins)
  const known = [...APP_PLUGINS.map(plugin => plugin.id), ...GENERAL_PLUGINS.map(plugin => plugin.id)]
  assert.equal(new Set(listed).size, listed.length)
  assert.deepEqual([...listed].sort(), [...known].sort())
})

test('微信、钉钉是两项；校园社区（CC98）在校园生活；校园账号仍是没有开关的基础项', () => {
  const groupOf = id => PLUGIN_GROUPS.find(group => group.plugins.includes(id))?.title
  assert.equal(groupOf('campus.wechat-chat'), '消息与资讯')
  assert.equal(groupOf('campus.dingtalk'), '消息与资讯')
  assert.equal(groupOf('campus.mail'), '消息与资讯')
  assert.equal(groupOf('campus.community'), '校园生活')
  assert.equal(groupOf('campus.account'), '基础能力')
  assert.equal(APP_PLUGINS.find(plugin => plugin.id === 'campus.account').base, true)
  // 默认开关不因为分类改变：讲解、公众号和两个聊天默认关着，别的默认开着。
  assert.deepEqual(APP_PLUGINS.filter(plugin => plugin.optIn).map(plugin => plugin.id).sort(), ['campus.dingtalk', 'campus.learn', 'campus.wechat', 'campus.wechat-chat'])
})
