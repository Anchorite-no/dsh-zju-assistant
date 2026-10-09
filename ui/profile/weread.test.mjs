import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WereadFeeds } from './weread.mjs'
const account = { bookId: 'MP_WXS_1234567890', biz: 'MTIzNDU2Nzg5MA==', name: '测试号' }
const article = { id: `${account.bookId}_abcdefghijk`, bookId: account.bookId, title: '测试文章', url: 'https://mp.weixin.qq.com/s/abcdefghijk', publishedAt: '2026-10-09T00:00:00Z' }
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weread-service-'))
  const world = { disabled: [], calls: [], next: null }
  const service = new WereadFeeds({ file: path.join(dir, 'feeds.json'), plugins: { disabled: () => world.disabled }, rpc: async (action, input) => {
    world.calls.push({ action, input })
    if (world.next) return world.next(action, input)
    if (action === 'publisher.subscribe') return { ok: true, status: 'already_added', account, source: { owner: 'test-owner' } }
    if (action === 'article.list') return { ok: true, account, articles: [article], source: { owner: 'test-owner' } }
    return { ok: true }
  } })
  world.service = service
  t.after(() => { service.dispose(); fs.rmSync(dir, { recursive: true, force: true }) })
  return world
}
test('remote subscription imports once, preserves source selection, and passes the bound owner', async t => {
  const w=setup(t),s=w.service
  s.setProvider({provider:'weread'});await s.add({account:account.bookId});await s.refresh()
  assert.equal(s.snapshot().accounts.length,1);assert.equal(s.snapshot().articles.length,1);assert.equal(s.provider(),'weread')
  assert.equal(w.calls.find(c=>c.action==='article.list').input._expectedOwner,'test-owner')
})
test('a captcha pauses a task, preserves old data and resumes its continuation after verified completion',async t=>{
  const w=setup(t),s=w.service;await s.add({account:account.bookId})
  w.next=async(action)=>action==='verification.status'?{ok:true,state:'complete',result:{ok:true,account,articles:[article,{...article,id:article.id+'2',title:'第二篇'}]}}:{ok:false,status:'verification_required',taskId:'test-task',message:'需要验证'}
  await s.refresh();assert.equal(s.snapshot().articles.length,1);assert.equal(s.snapshot().pending.taskId,'test-task')
  await s.verification('status');assert.equal(s.snapshot().articles.length,2);assert.equal(s.snapshot().pending,null)
})
test('verification failures clear the pending reference without erasing articles; disabled source never calls remote business APIs',async t=>{
  const w=setup(t),s=w.service;await s.add({account:account.bookId})
  w.next=async action=>action==='verification.status'?{ok:false,state:'failed',status:'verification_failed',message:'未通过'}:{ok:false,status:'verification_required',taskId:'test-task'}
  await s.refresh();await s.verification('status');assert.equal(s.snapshot().pending,null);assert.equal(s.snapshot().articles.length,1)
  w.disabled=['campus.wechat'];const before=w.calls.length
  await assert.rejects(s.discover(),/已关闭/);await assert.rejects(s.refresh(),/已关闭/);assert.equal(w.calls.length,before)
})
