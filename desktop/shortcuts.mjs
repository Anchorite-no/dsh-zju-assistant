import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { ShortcutPersistence, effectiveShortcuts, parseShortcutDefinitions, parseShortcutEdit } from '@deepseek-ai/dsh-client-shortcuts/protocol'

/** One product window owns this bridge; neither paths nor arbitrary IPC are exposed. */
export function installShortcuts({ window, ipcMain, file, origin, platform = process.platform }) {
  const device = platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : 'linux'
  let definitions = [], snapshot, bindings = [], recording = false
  const held = new Set(), consumed = new Set()
  const reset = () => { held.clear(); consumed.clear() }
  const send = (channel, value) => { if (!window.isDestroyed()) window.webContents.send(channel, value) }
  const storage = new ShortcutPersistence({
    read() { try { return fs.readFileSync(file, 'utf8') } catch (e) { if (e.code === 'ENOENT') return null; throw e } },
    write(raw) {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const temp = `${file}.${randomUUID()}.tmp`
      try { fs.writeFileSync(temp, raw, { mode: 0o600 }); fs.renameSync(temp, file) }
      finally { fs.rmSync(temp, { force: true }) }
    }
  }, 'desktop', device, true, value => {
    snapshot = value
    bindings = effectiveShortcuts(definitions, value.document, 'desktop', device)
      .filter(row => row.binding && !row.issue && !row.conflicts.length).map(row => row.binding)
    reset()
    send('campus:shortcuts:changed', value)
  })
  const authorize = event => {
    let allowed = false
    try { allowed = !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && new URL(event.senderFrame.url).origin === origin() } catch {}
    if (!allowed) throw Error('Untrusted shortcut request')
  }
  const handlers = {
    'campus:shortcuts:get': async (event, input) => {
      authorize(event)
      definitions = parseShortcutDefinitions(input)
      storage.setDefinitions(definitions)
      return storage.readCurrent()
    },
    'campus:shortcuts:edit': (event, edit, revision) => {
      authorize(event)
      return storage.edit(parseShortcutEdit(edit), revision)
    },
    'campus:shortcuts:recording': (event, active) => {
      authorize(event)
      if (typeof active !== 'boolean') throw Error('Invalid recording state')
      recording = active; reset()
    },
    'campus:keyboard:close': (event, revision) => {
      authorize(event)
      if (!snapshot || snapshot.revision !== revision) throw Error('Stale shortcut revision')
      window.close()
    }
  }
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler)
  const input = (event, value) => {
    // Forward only the product main frame, never an embedded page with a different owner.
    if (window.webContents.focusedFrame !== window.webContents.mainFrame) { reset(); return }
    if (recording || value.isComposing || value.key === 'Dead' || value.key === 'Process' || !snapshot || snapshot.status === 'loading') { reset(); return }
    if (value.type === 'keyUp') {
      held.delete(value.code)
      if (consumed.delete(value.code)) event.preventDefault()
      if (/^(Meta|Control|Alt|Shift)/.test(value.code)) reset()
      return
    }
    if (value.type !== 'keyDown') return
    if (consumed.has(value.code)) { event.preventDefault(); return }
    held.add(value.code)
    const modifiers = ['control', 'alt', 'shift', 'meta'].filter(k => value[k])
    const binding = bindings.find(b => b.modifiers.length === modifiers.length && b.modifiers.every(k => modifiers.includes(k))
      && (b.code === value.code || b.secondCode === value.code) && held.has(b.code) && (!b.secondCode || held.has(b.secondCode)))
    if (!binding) return
    event.preventDefault()
    consumed.add(value.code)
    held.clear()
    if (value.isAutoRepeat) return
    send('campus:keyboard:input', {
      kind: 'keyboard', frameName: '', revision: snapshot.revision,
      code: binding.code, ...(binding.secondCode ? { secondCode: binding.secondCode } : {}),
      control: !!value.control, alt: !!value.alt, shift: !!value.shift, meta: !!value.meta, repeat: false
    })
  }
  const navigation = (_event, _url, inPlace, mainFrame) => {
    if (!mainFrame || inPlace) return
    recording = false; definitions = []; bindings = []; snapshot = undefined; storage.setDefinitions(null); reset()
  }
  window.webContents.on('before-input-event', input)
  window.webContents.on('did-start-navigation', navigation)
  window.on('blur', reset)
  const dispose = () => {
    storage.dispose()
    for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel)
    window.webContents.removeListener('before-input-event', input)
    window.webContents.removeListener('did-start-navigation', navigation)
    window.removeListener('blur', reset)
  }
  window.once('closed', dispose)
  return dispose
}
