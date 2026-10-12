import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createCipheriv, createHmac, pbkdf2Sync } from 'node:crypto'

const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
const python = process.env.WEREAD_PYTHON || ['C:/Program Files/Python314/python.exe'].find(fs.existsSync) || 'python'
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
  const helper = path.join(directory, '解析 器.py')
  fs.writeFileSync(helper, `import json, sys\ndata = sys.stdin.buffer.read()\nassert len(data) == 4096 and data[:16] == b"SQLite format 3\\0" and data[18:20] == b"\\x01\\x01"\nprint(json.dumps({"text": "中文" * 200000}, ensure_ascii=True))\n`)
  const script = `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'
    $OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
    if($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1){throw 'Expected Windows PowerShell 5.1'}
    Add-Type -TypeDefinition ([IO.File]::ReadAllText(${quote(localFile('runtime-key.cs'))})+[IO.File]::ReadAllText(${quote(localFile('snapshot.cs'))}))
    $key=[Convert]::FromBase64String(${quote(key.toString('base64'))})
    [WeixinResearch.BizSnapshot]::Inspect($key,${quote(database)},${quote(python)},${quote(helper)})`
  const run = () => execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 5 * 1024 * 1024, timeout: 20000 })
  assert.equal(JSON.parse(run()).text, '中文'.repeat(200000), 'large JSON is passed through as text, without the PS 5.1 JSON parser limit')
  const corrupt = fs.readFileSync(database); corrupt[100] ^= 1; fs.writeFileSync(database, corrupt)
  assert.throws(run, 'a modified page must fail authentication')
})

test('Python reads every account with its articles from compressed messages, newest first', { skip: process.platform !== 'win32' }, () => {
  const script = `import importlib.util, json, sqlite3, sys
from compression import zstd
spec = importlib.util.spec_from_file_location("metadata", sys.argv[1])
metadata = importlib.util.module_from_spec(spec)
spec.loader.exec_module(metadata)
con = sqlite3.connect(":memory:")
con.execute('CREATE TABLE Msg_0123456789abcdef0123456789abcdef(message_content BLOB, create_time INTEGER)')
con.execute('CREATE TABLE Other(message_content BLOB)')
pushes = [("旧名称", "MTIzNDU2Nzg5MA==", 1, 1791590400), ("中文测试号", "MTIzNDU2Nzg5MA==", 2, 1791676800), ("中文测试号", "MTIzNDU2Nzg5MA==", 2, 1791676800), ("其他公众号", "OTg3NjU0MzIxMA==", 3, 0)]
for name, biz, mid, pub_time in pushes:
    xml = '<msg><mmreader><category><name>' + name + '</name><item><title>标题 &amp;amp; ' + str(mid) + '</title><pub_time>' + str(pub_time) + '</pub_time><url>https://mp.weixin.qq.com/s?__biz=' + biz + '&amp;mid=' + str(mid) + '&amp;idx=1&amp;sn=abc&amp;scene=1</url></item><item><url>https://example.com/ad</url></item></category></mmreader></msg>'
    con.execute('INSERT INTO Msg_0123456789abcdef0123456789abcdef VALUES(?,?)', (zstd.compress(xml.encode()), 1791600000))
con.execute('INSERT INTO Msg_0123456789abcdef0123456789abcdef VALUES(?,?)', ("plain chat text", 1))
print(json.dumps(metadata.extract(con.serialize()), ensure_ascii=True))`
  const { accounts } = JSON.parse(execFileSync(python, ['-c', script, localFile('metadata.py')], { windowsHide: true, encoding: 'utf8' }))
  assert.deepEqual(accounts, [
    { biz: 'MTIzNDU2Nzg5MA==', name: '中文测试号', articles: [
      { id: 'MTIzNDU2Nzg5MA==:2:1', title: '标题 & 2', url: 'https://mp.weixin.qq.com/s?__biz=MTIzNDU2Nzg5MA%3D%3D&mid=2&idx=1&sn=abc', publishedAt: '2026-10-11T08:00:00+08:00' },
      { id: 'MTIzNDU2Nzg5MA==:1:1', title: '标题 & 1', url: 'https://mp.weixin.qq.com/s?__biz=MTIzNDU2Nzg5MA%3D%3D&mid=1&idx=1&sn=abc', publishedAt: '2026-10-10T08:00:00+08:00' },
    ] },
    { biz: 'OTg3NjU0MzIxMA==', name: '其他公众号', articles: [
      { id: 'OTg3NjU0MzIxMA==:3:1', title: '标题 & 3', url: 'https://mp.weixin.qq.com/s?__biz=OTg3NjU0MzIxMA%3D%3D&mid=3&idx=1&sn=abc', publishedAt: '2026-10-10T10:40:00+08:00' },
    ] },
  ])
})
