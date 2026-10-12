import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_WIDTH, parseTrack, pinFor } from './rightpane.ts'

test('从引擎框架那一行的列里读出右边栏要多宽', () => {
  // 引擎写的是「左栏 中间 minmax(0px, 右边栏)」；右边栏没有时最后一列是 0。
  assert.equal(parseTrack('280px minmax(400px, 1fr) minmax(0px, 420px)'), 420)
  assert.equal(parseTrack('0px minmax(400px, 1fr) minmax(0px, 575.6px)'), 576)
  assert.equal(parseTrack('280px minmax(0px, 1fr) minmax(0px, 0px)'), 0)
  assert.equal(parseTrack(''), 0)
  assert.equal(parseTrack('280px 1fr'), 0)
  assert.ok(DEFAULT_WIDTH >= 300)
})

test('右边栏出现、收起时先把框架钉住，拖宽拖窄不钉', () => {
  const open = '280px minmax(400px, 1fr) minmax(0px, 420px)'
  // 打开：窗口还没加宽，框架先按加宽以后的算，右边栏在窗口外面等着露出来；列用引擎新写的。
  assert.deepEqual(pinFor({ previous: 0, track: 420, granted: 0, windowWidth: 1280, columns: '280px minmax(0px, 1fr) minmax(0px, 0px)' }), { width: 1700 })
  // 收起：窗口还没缩回去，框架留在现在的宽度，三列留在收起之前的写法，右边栏原地等窗口盖过去。
  assert.deepEqual(pinFor({ previous: 420, track: 0, granted: 420, windowWidth: 1700, columns: open }), { width: 1700, columns: open })
  assert.deepEqual(pinFor({ previous: 420, track: 0, granted: 256, windowWidth: 1536, columns: open }), { width: 1536, columns: open })
  // 壳一点都没加（最大化着）：收起时不用钉，照引擎原样。
  assert.equal(pinFor({ previous: 420, track: 0, granted: 0, windowWidth: 1920, columns: open }), undefined)
  assert.equal(pinFor({ previous: 420, track: 520, granted: 420, windowWidth: 1700, columns: open }), undefined)
})
