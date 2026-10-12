import test from 'node:test'
import assert from 'node:assert/strict'
import { KEPT, grownBefore, rememberGrown } from './grown.ts'

test('长出来过的行按「哪个对话的第几轮」记着，没看过的是空的', () => {
  assert.equal(grownBefore('s1\n1').size, 0)
  rememberGrown('s1\n1', new Set(['ask', 'c1']))
  rememberGrown('s1\n1', new Set(['ask', 'c1', 'c2']))
  assert.deepEqual([...grownBefore('s1\n1')], ['ask', 'c1', 'c2'])
  assert.equal(grownBefore('s1\n2').size, 0)
  assert.equal(grownBefore('s2\n1').size, 0)
})

test('只留最近看过的那些轮', () => {
  rememberGrown('old\n1', new Set(['ask']))
  rememberGrown('kept\n1', new Set(['ask']))
  for (let turn = 0; turn < KEPT - 1; turn++) {
    rememberGrown(`many\n${turn}`, new Set(['ask']))
    // 中途又看了一眼的不算旧。
    rememberGrown('kept\n1', new Set(['ask', 'answer']))
  }
  assert.equal(grownBefore('old\n1').size, 0)
  assert.equal(grownBefore('kept\n1').size, 2)
  assert.equal(grownBefore(`many\n${KEPT - 2}`).size, 1)
})
