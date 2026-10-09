import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { Downloads } from './downloads.mjs'

test('downloads go under the given folder, and revealing a file only opens the file manager on it', async () => {
  const launched = []
  const downloads = new Downloads(path.join('some', 'folder'), (command, args, options) => { launched.push({ command, args, options }); return { unref() {}, on() {} } })
  assert.equal(await downloads.root(), path.resolve('some', 'folder'))
  const file = path.resolve('some', 'folder', '课程 A', '题目 1.pdf')
  downloads.reveal(file)
  assert.equal(launched.length, 1)
  const { command, args, options } = launched[0]
  if (process.platform === 'win32') {
    // 路径带空格时引号要落在路径两边，整个参数不能再被包一层。
    assert.equal(command, 'explorer.exe')
    assert.deepEqual(args, [`/select,"${file}"`])
    assert.equal(options.windowsVerbatimArguments, true)
  } else assert.ok(args.includes(file) || args.includes(path.dirname(file)))
  assert.equal(options.detached, true)
})
