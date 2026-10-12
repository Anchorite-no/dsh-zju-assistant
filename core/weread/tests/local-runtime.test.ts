import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createCipheriv, createHmac, pbkdf2Sync } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { zstdCompressSync } from 'node:zlib'
// @ts-expect-error 没有类型声明的脚本
import { extract, asciiJson } from '../scripts/local/metadata.mjs'

const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'"
const localFile = (name: string) => fileURLToPath(new URL('../scripts/local/' + name, import.meta.url))

test('Windows PowerShell 5.1 compiles, authenticates and pipes a snapshot through Unicode paths', { skip: process.platform !== 'win32' }, t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'weread-本地 兼容-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  // Entirely synthetic page/key; this test never opens WeChat or a user's database.
  const key = Buffer.alloc(32, 7), salt = Buffer.alloc(16, 9), iv = Buffer.alloc(16, 11)
  const plain = Buffer.alloc(4016)
  plain.write('SQLite format 3\0'); plain.writeUInt32BE(1, 28)
  const cipher = createCipheriv('aes-256-cbc', key, iv); cipher.setAutoPadding(false)
  const payload = Buffer.concat([cipher.update(plain.subarray(16)), cipher.final(), iv])
  const macKey = pbkdf2Sync(key, salt.map(b => b ^ 0x3a), 2, 32, 'sha512')
  const signature = createHmac('sha512', macKey).update(payload).update(Buffer.from([1, 0, 0, 0])).digest()
  const database = path.join(directory, 'biz_message_0.db')
  fs.writeFileSync(database, Buffer.concat([salt, payload, signature]))
  // 解析那一步由跑技能的这一份 Node 来做；这里换成一个只核对输入、回一大段 JSON 的替身。
  const helper = path.join(directory, '解析 器.mjs')
  fs.writeFileSync(helper, `const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const data = Buffer.concat(chunks)
if (data.length !== 4096 || data.subarray(0, 16).toString('latin1') !== 'SQLite format 3\\0' || data[18] !== 1 || data[19] !== 1) process.exit(1)
process.stdout.write(JSON.stringify({ text: '中文'.repeat(200000) }).replace(/[\\u0080-\\uffff]/g, c => '\\\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '\\n')
`)
  const script = `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'
    $OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
    if($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1){throw 'Expected Windows PowerShell 5.1'}
    Add-Type -TypeDefinition ([IO.File]::ReadAllText(${quote(localFile('runtime-key.cs'))})+[IO.File]::ReadAllText(${quote(localFile('snapshot.cs'))}))
    $key=[Convert]::FromBase64String(${quote(key.toString('base64'))})
    [WeixinResearch.BizSnapshot]::Inspect($key,${quote(database)},${quote(process.execPath)},${quote(helper)})`
  const run = () => execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 5 * 1024 * 1024, timeout: 20000 })
  assert.equal(JSON.parse(run()).text, '中文'.repeat(200000), 'large JSON is passed through as text, without the PS 5.1 JSON parser limit')
  const corrupt = fs.readFileSync(database); corrupt[100] ^= 1; fs.writeFileSync(database, corrupt)
  assert.throws(run, 'a modified page must fail authentication')
})

test('every account is read with its articles from compressed messages, newest first', () => {
  const table = 'Msg_0123456789abcdef0123456789abcdef'
  const source = new DatabaseSync(':memory:')
  source.exec(`CREATE TABLE ${table}(message_content BLOB, create_time INTEGER)`)
  source.exec('CREATE TABLE Other(message_content BLOB)')
  const insert = source.prepare(`INSERT INTO ${table} VALUES(?,?)`)
  const pushes: [string, string, number, number][] = [['旧名称', 'MTIzNDU2Nzg5MA==', 1, 1791590400], ['中文测试号', 'MTIzNDU2Nzg5MA==', 2, 1791676800], ['中文测试号', 'MTIzNDU2Nzg5MA==', 2, 1791676800], ['其他公众号', 'OTg3NjU0MzIxMA==', 3, 0]]
  for (const [name, biz, mid, published] of pushes) {
    const xml = `<msg><mmreader><category><name>${name}</name><item><title>标题 &amp;amp; ${mid}</title><pub_time>${published}</pub_time><url>https://mp.weixin.qq.com/s?__biz=${biz}&amp;mid=${mid}&amp;idx=1&amp;sn=abc&amp;scene=1</url></item><item><url>https://example.com/ad</url></item></category></mmreader></msg>`
    insert.run(zstdCompressSync(Buffer.from(xml)), 1791600000)
  }
  // 不是推送的消息、没压缩的推送、带 CDATA 的写法、缺参数的链接。
  insert.run('plain chat text', 1)
  insert.run('<msg><mmreader><category><name><![CDATA[未压缩的号]]></name><item><title><![CDATA[直接存的 <标题>]]></title><time>1791680400</time><url><![CDATA[http://mp.weixin.qq.com/s?__biz=QUJD&mid=9&idx=2&sn=x+y&chksm=1]]></url></item><item><title>缺参数</title><url>https://mp.weixin.qq.com/s?__biz=QUJD&amp;mid=&amp;idx=1&amp;sn=z</url></item></category></mmreader></msg>', 5)
  const image = source.serialize()
  source.close()
  const result = extract(image)
  assert.deepEqual(result.accounts, [
    { biz: 'MTIzNDU2Nzg5MA==', name: '中文测试号', articles: [
      { id: 'MTIzNDU2Nzg5MA==:2:1', title: '标题 & 2', url: 'https://mp.weixin.qq.com/s?__biz=MTIzNDU2Nzg5MA%3D%3D&mid=2&idx=1&sn=abc', publishedAt: '2026-10-11T08:00:00+08:00' },
      { id: 'MTIzNDU2Nzg5MA==:1:1', title: '标题 & 1', url: 'https://mp.weixin.qq.com/s?__biz=MTIzNDU2Nzg5MA%3D%3D&mid=1&idx=1&sn=abc', publishedAt: '2026-10-10T08:00:00+08:00' },
    ] },
    { biz: 'OTg3NjU0MzIxMA==', name: '其他公众号', articles: [
      { id: 'OTg3NjU0MzIxMA==:3:1', title: '标题 & 3', url: 'https://mp.weixin.qq.com/s?__biz=OTg3NjU0MzIxMA%3D%3D&mid=3&idx=1&sn=abc', publishedAt: '2026-10-10T10:40:00+08:00' },
    ] },
    { biz: 'QUJD', name: '未压缩的号', articles: [
      { id: 'QUJD:9:2', title: '直接存的 <标题>', url: 'https://mp.weixin.qq.com/s?__biz=QUJD&mid=9&idx=2&sn=x+y', publishedAt: '2026-10-11T09:00:00+08:00' },
    ] },
  ])
  // 交回给 C# 的那一行只有 ASCII：它是按控制台的代码页读的。
  assert.match(asciiJson(result), /^[\x20-\x7e]+$/)
  assert.deepEqual(JSON.parse(asciiJson(result)), result)
})
