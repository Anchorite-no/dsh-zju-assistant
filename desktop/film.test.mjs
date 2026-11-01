import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import { EventEmitter } from 'node:events'

const require = createRequire(import.meta.url)
const { filmName, filmDirectory, createFilms } = require('./film.cjs')
const ORIGIN = 'http://127.0.0.1:5173'

test('只有应用自己地址下的 /campus-film/ 才算讲解，别的地址照旧交给阅读窗口', () => {
  assert.equal(filmName(`${ORIGIN}/campus-film/${encodeURIComponent('c87851-02 伸展树.html')}`, ORIGIN), 'c87851-02 伸展树.html')
  assert.equal(filmName('https://www.zju.edu.cn/campus-film/a.html', ORIGIN), undefined)
  assert.equal(filmName(`${ORIGIN}/api/campus/profile`, ORIGIN), undefined)
  assert.equal(filmName('不是网址', ORIGIN), undefined)
  assert.equal(filmName(`${ORIGIN}/campus-film/a.html`, ''), undefined)
})

test('页面给的只能是一个 .html 的文件名：带路径的、别的类型的都不认', () => {
  for (const name of ['../secret.html', '..\\secret.html', 'a/b.html', 'C:\\Windows\\win.ini', 'notes.md', 'a.html.exe', '']) {
    assert.equal(filmName(`${ORIGIN}/campus-film/${encodeURIComponent(name)}`, ORIGIN), '', name)
  }
  assert.equal(filmName(`${ORIGIN}/campus-film/%E0%A4%A`, ORIGIN), '')
})

test('成品文件夹在「文档」的 CampusAgent\\讲解\\dist；CAMPUS_CHATS_DIR 换掉时跟着换', () => {
  // 用这台机器上的完整路径：写死 D:\ 这样的，在 macOS 上不算完整路径。
  const docs = path.join(os.tmpdir(), 'Docs'), chats = path.join(os.tmpdir(), 'chats')
  assert.equal(filmDirectory(docs, {}), path.join(docs, 'CampusAgent', '讲解', 'dist'))
  assert.equal(filmDirectory(docs, { CAMPUS_CHATS_DIR: chats }), path.join(chats, '讲解', 'dist'))
})

test('未启用配音时放原文件；启用后加载私有朗读器，关窗口时停止服务', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-film-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.writeFileSync(path.join(root, 'a.html'), '<html>fixture</html>')
  let window, spoken = false, stopped = 0
  class Window extends EventEmitter {
    constructor() { super(); window = this; this.webContents = new EventEmitter(); this.webContents.setWindowOpenHandler = () => {}; this.calls = [] }
    isDestroyed() { return !!this.destroyed }
    async loadFile(file) { this.calls.push(['file', file]) }
    async loadURL(url) { this.calls.push(['url', url]) }
    show() {} focus() {}
    close() { this.destroyed = true; this.emit('closed') }
  }
  const films = createFilms({ BrowserWindow: Window, session: { fromPartition: () => ({}) }, directory: () => root,
    voice: async () => spoken ? 'http://127.0.0.1:43210/?token=fixture' : null, stopVoice: () => { stopped++ } })
  const open = async () => { assert.equal(films.open(ORIGIN + '/campus-film/a.html', ORIGIN), true); await new Promise(setImmediate) }
  await open()
  assert.deepEqual(window.calls.at(-1), ['file', path.join(root, 'a.html')])
  spoken = true
  await open()
  assert.deepEqual(window.calls.at(-1), ['url', 'http://127.0.0.1:43210/?token=fixture'])
  films.close()
  assert.equal(stopped, 1)
})
