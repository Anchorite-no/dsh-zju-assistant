import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'
import { simpleParser } from 'mailparser'
import { Mail } from './mail.mjs'

async function server(t, handler) {
  const sockets = new Set()
  const instance = net.createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {}); handler(socket) })
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve))
  t.after(() => { for (const socket of sockets) socket.destroy(); return new Promise(resolve => instance.close(resolve)) })
  return instance.address().port
}

test('real mail libraries complete IMAP read-only query/read and SMTP verification/send against local protocol fixtures', { timeout: 15000 }, async t => {
  const source = Buffer.from('From: Teacher <teacher@example.com>\r\nTo: student@zju.edu.cn\r\nSubject: Protocol test\r\nDate: Sat, 17 Oct 2026 09:00:00 +0800\r\nMessage-ID: <test@example.com>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nThis message stays unread.\r\n')
  const commands = [], messages = []
  const imapPort = await server(t, socket => {
    socket.write('* OK test IMAP ready\r\n')
    let pending = '', authTag = ''
    socket.on('data', chunk => {
      pending += chunk.toString()
      while (pending.includes('\r\n')) {
        const end = pending.indexOf('\r\n'), line = pending.slice(0, end); pending = pending.slice(end + 2)
        if (authTag) { socket.write(`${authTag} OK authenticated\r\n`); authTag = ''; continue }
        const space = line.indexOf(' '), tag = line.slice(0, space), command = line.slice(space + 1)
        commands.push(command.replace(/^(LOGIN|AUTHENTICATE).*/, '$1 [redacted]'))
        if (command === 'CAPABILITY') socket.write('* CAPABILITY IMAP4rev1 AUTH=PLAIN\r\n')
        else if (command.startsWith('AUTHENTICATE PLAIN')) {
          if (command.split(' ').length === 2) { authTag = tag; socket.write('+ \r\n'); continue }
        } else if (command.startsWith('LOGIN ')) { /* accepted fixture credential */ }
        else if (command.startsWith('LIST ') || command.startsWith('LSUB ')) socket.write('* LIST (\\HasNoChildren) "/" "INBOX"\r\n')
        else if (command.startsWith('EXAMINE ')) socket.write('* FLAGS (\\Seen)\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 9] stable\r\n* OK [UIDNEXT 8] next\r\n')
        else if (command.startsWith('UID SEARCH')) socket.write('* SEARCH 7\r\n')
        else if (command.startsWith('UID FETCH')) {
          if (command.includes('BODY.PEEK[]')) {
            socket.write(`* 1 FETCH (UID 7 BODY[] {${source.length}}\r\n`); socket.write(source); socket.write(')\r\n')
          } else if (command.includes('ENVELOPE')) socket.write(`* 1 FETCH (UID 7 FLAGS () RFC822.SIZE ${source.length} ENVELOPE ("Sat, 17 Oct 2026 09:00:00 +0800" "Protocol test" (("Teacher" NIL "teacher" "example.com")) NIL NIL ((NIL NIL "student" "zju.edu.cn")) NIL NIL NIL "<test@example.com>"))\r\n`)
          else socket.write(`* 1 FETCH (UID 7 RFC822.SIZE ${source.length})\r\n`)
        } else { socket.write(`${tag} BAD unsupported fixture command\r\n`); continue }
        socket.write(`${tag} OK ${command.startsWith('EXAMINE ') ? '[READ-ONLY] ' : ''}done\r\n`)
      }
    })
  })
  const smtpPort = await server(t, socket => {
    socket.write('220 localhost test SMTP\r\n')
    let pending = '', data = false, body = []
    socket.on('data', chunk => {
      pending += chunk.toString()
      while (pending.includes('\r\n')) {
        const end = pending.indexOf('\r\n'), line = pending.slice(0, end); pending = pending.slice(end + 2)
        if (data) {
          if (line !== '.') { body.push(line.replace(/^\.\./, '.')); continue }
          messages.push(body.join('\r\n')); data = false; body = []; socket.write('250 accepted\r\n'); continue
        }
        if (/^(EHLO|HELO)/.test(line)) socket.write('250-localhost\r\n250 AUTH PLAIN\r\n')
        else if (/^AUTH PLAIN/.test(line)) socket.write('235 authenticated\r\n')
        else if (/^(MAIL FROM:|RCPT TO:|RSET)/.test(line)) socket.write('250 OK\r\n')
        else if (line === 'DATA') { data = true; socket.write('354 send data\r\n') }
        else if (line === 'QUIT') socket.end('221 goodbye\r\n')
        else socket.write('500 unsupported\r\n')
      }
    })
  })
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-mail-protocol-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const mail = new Mail({ file: path.join(root, 'mail.json'), plugins: { disabled: () => [] }, vault: { seal: async () => 'sealed', open: async () => 'testPassword1234' }, downloads: { root: async () => root },
    // Local fixtures override transport only; production always verifies TLS certificates.
    imap: options => new ImapFlow({ ...options, host: '127.0.0.1', port: imapPort, secure: false, doSTARTTLS: false, socketTimeout: 2000 }),
    smtp: options => nodemailer.createTransport({ ...options, host: '127.0.0.1', port: smtpPort, secure: false, ignoreTLS: true, socketTimeout: 2000 }),
  })
  assert.equal((await mail.connect({ address: 'student@zju.edu.cn', password: 'testPassword1234' })).connected, true)
  assert.equal(messages.length, 0)
  assert.equal((await mail.folders()).folders[0].path, 'INBOX')
  const found = await mail.list({ unread: true })
  assert.equal(found.messages[0].subject, 'Protocol test')
  assert.equal(found.messages[0].uidValidity, '9')
  assert.equal(found.messages[0].unread, true)
  assert.match((await mail.read(found.messages[0])).text, /stays unread/)
  assert.ok(commands.some(line => /^EXAMINE/.test(line)))
  assert.ok(commands.some(line => /BODY.PEEK\[\]/.test(line)))
  assert.equal(commands.some(line => /^(SELECT|UID STORE|STORE)/.test(line)), false)
  const { draft } = await mail.prepare({ to: ['receiver@example.com'], subject: 'Prepared reply', text: 'Reviewed text.' })
  assert.equal(messages.length, 0)
  assert.equal((await mail.send({ id: draft.id, revision: draft.revision, confirm: true })).draft.status, 'sent')
  assert.equal(messages.length, 1)
  const sent = await simpleParser(messages[0])
  assert.equal(sent.to.value[0].address, 'receiver@example.com'); assert.equal(sent.subject, 'Prepared reply'); assert.match(sent.text, /Reviewed text/)
})
