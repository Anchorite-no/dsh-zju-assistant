import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { windowSize, WANT } = require('./size.cjs')

test('主窗口一开始开宽一点，右边栏展开时对话区不会被挤得太窄；屏幕放不下时按屏幕收', () => {
  const min = { width: 520, height: 600 }
  // 1920×1080，缩放 100%：任务栏占掉一截高度。
  assert.deepEqual(windowSize({ width: 1920, height: 1032 }, min), { width: 1480, height: 820 })
  // 缩放 125%：能用的是 1536×824 上下。
  assert.deepEqual(windowSize({ width: 1536, height: 824 }, min), { width: 1480, height: 784 })
  // 缩放 150%、1366 的笔记本：取能用的减去留边。
  assert.deepEqual(windowSize({ width: 1280, height: 672 }, min), { width: 1240, height: 632 })
  assert.deepEqual(windowSize({ width: 1366, height: 728 }, min), { width: 1326, height: 688 })
  // 再小也不小于窗口的下限；读不到屏幕时照想要的开。
  assert.deepEqual(windowSize({ width: 500, height: 500 }, min), { width: 520, height: 600 })
  assert.deepEqual(windowSize(undefined, min), WANT)
  // 留给对话区的：减去左栏 280 和右边栏 420，还有 780。
  assert.equal(WANT.width - 280 - 420, 780)
})
