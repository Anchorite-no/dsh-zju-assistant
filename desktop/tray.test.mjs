import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createTray, readCloseToTray } = require('./tray.cjs')

/** 假的托盘和菜单：只记下壳对它们做了什么。icons 是现在还在托盘上的那些。 */
function fakes() {
  const icons = []
  class Tray {
    constructor(icon) { this.icon = icon; this.handlers = {}; icons.push(this) }
    setToolTip(text) { this.tip = text }
    setContextMenu(menu) { this.menu = menu }
    on(name, handler) { this.handlers[name] = handler }
    destroy() { icons.splice(icons.indexOf(this), 1) }
  }
  return { Tray, Menu: { buildFromTemplate: items => items }, icons }
}

async function fixture(t) {
  const tempRoot = resolve(tmpdir())
  const root = await mkdtemp(join(tempRoot, 'campus-tray-'))
  t.after(async () => {
    // 递归清理只允许作用于本测试创建的临时目录。
    assert.ok(resolve(root).startsWith(tempRoot + sep))
    await rm(root, { recursive: true, force: true })
  })
  const file = join(root, 'shell.json')
  const calls = []
  const f = fakes()
  const create = () => createTray({ Tray: f.Tray, Menu: f.Menu, file, title: '校园智能体', icon: 'icon', show: () => { calls.push('show') }, quit: () => { calls.push('quit') } })
  return { file, calls, icons: f.icons, create }
}

test('默认直接退出：没存过、文件坏了、写的不是 true，都按关算，托盘上也没有图标', async (t) => {
  const f = await fixture(t)
  assert.equal(readCloseToTray(f.file), false)
  for (const text of ['不是 JSON', '{"closeToTray":"yes"}', '{}', 'null']) {
    await writeFile(f.file, text)
    assert.equal(readCloseToTray(f.file), false, text)
  }
  const tray = f.create()
  assert.equal(tray.enabled(), false)
  assert.equal(f.icons.length, 0)
})

test('打开后托盘上出现图标：点它叫回主窗口，右键菜单能打开和退出；下次启动还记得', async (t) => {
  const f = await fixture(t)
  const tray = f.create()
  assert.equal(tray.set(true), true)
  assert.deepEqual(JSON.parse(await readFile(f.file, 'utf8')), { closeToTray: true })
  assert.equal(f.icons.length, 1)
  const icon = f.icons[0]
  assert.equal(icon.tip, '校园智能体')
  icon.handlers.click()
  icon.menu.find(item => item.label === '打开主窗口').click()
  icon.menu.find(item => item.label === '退出').click()
  assert.deepEqual(f.calls, ['show', 'show', 'quit'])
  // 重复打开不会多出一个图标。
  tray.set(true)
  assert.equal(f.icons.length, 1)
  tray.dispose()
  assert.equal(f.icons.length, 0)
  // 下次启动：读到存着的选择，图标直接就在。
  assert.equal(f.create().enabled(), true)
  assert.equal(f.icons.length, 1)
})

test('关掉后图标撤走，选择也存下来', async (t) => {
  const f = await fixture(t)
  const tray = f.create()
  tray.set(true)
  assert.equal(tray.set(false), false)
  assert.equal(f.icons.length, 0)
  assert.equal(readCloseToTray(f.file), false)
  assert.equal(f.create().enabled(), false)
})
