import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { filmName, filmDirectory } = require('./film.cjs')
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
  assert.equal(filmDirectory('D:\\Docs', {}), path.join('D:\\Docs', 'CampusAgent', '讲解', 'dist'))
  assert.equal(filmDirectory('D:\\Docs', { CAMPUS_CHATS_DIR: 'E:\\tmp\\chats' }), path.join('E:\\tmp\\chats', '讲解', 'dist'))
})
