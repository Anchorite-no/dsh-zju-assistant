import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_WIDTH, installRightPane } from './rightpane.ts'

test('右边栏第一次打开的宽度设成 DEFAULT_WIDTH；引擎没有这个接口时什么也不做', () => {
  const set = []
  installRightPane({ layout: { panels: { setRightbar: px => { set.push(px) } } } })()
  assert.deepEqual(set, [DEFAULT_WIDTH])
  assert.ok(DEFAULT_WIDTH >= 300)
  // 引擎升级后接口没了、或者抛错：不影响界面包启用。
  installRightPane({})()
  installRightPane({ layout: { panels: { setRightbar: () => { throw new Error('gone') } } } })()
})
