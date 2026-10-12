/**
 * Read every public-account article from a decrypted DB image on stdin; print JSON on stdout.
 * Runs on the same Node that runs the skill (node:sqlite and zstd are built in from Node 24), so the local
 * source needs nothing installed. Until 2026-10-12 this step was a Python 3.14 script; the output is the same.
 * stdout must stay ASCII: the C# caller reads it with the console code page.
 */
import { DatabaseSync } from 'node:sqlite'
import { zstdDecompressSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'
import { parseDocument } from 'htmlparser2'
import { decodeHTML } from 'entities'

const LINK_KEYS = ['__biz', 'mid', 'idx', 'sn']
const ZSTD = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** Percent-encode the way the previous implementation did: spaces as +, everything but letters, digits and _.-~ escaped. */
const quote = value => encodeURIComponent(value).replace(/%20/g, '+').replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase())

/** [biz, article id, clean link] for a public-account article link, else undefined. */
function publicArticle(raw) {
  const text = decodeHTML(raw ?? '')
  let url
  try { url = new URL(text.startsWith('//') ? 'https:' + text : text) } catch { return undefined }
  if (url.hostname !== 'mp.weixin.qq.com' || url.pathname !== '/s') return undefined
  // A key that is present but blank counts as missing.
  const values = LINK_KEYS.map(key => url.searchParams.getAll(key).find(value => value !== ''))
  if (values.some(value => value === undefined)) return undefined
  const [biz, mid, idx] = values
  return [biz, `${biz}:${mid}:${idx}`, 'https://mp.weixin.qq.com/s?' + LINK_KEYS.map((key, at) => `${key}=${quote(values[at])}`).join('&')]
}

function decodeContent(value) {
  if (value instanceof Uint8Array) {
    const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    try { return (bytes.subarray(0, 4).equals(ZSTD) ? zstdDecompressSync(bytes) : bytes).toString('utf8') } catch { return '' }
  }
  return typeof value === 'string' ? value : ''
}

/** Seconds since the epoch as Beijing time, or null for anything that is not a positive whole number. */
function timestamp(value) {
  const text = typeof value === 'string' ? value.trim() : typeof value === 'number' || typeof value === 'bigint' ? String(value) : ''
  if (!/^[+-]?\d+$/.test(text)) return null
  const seconds = Number(text)
  if (!(seconds > 0)) return null
  const date = new Date((seconds + 8 * 3600) * 1000)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 19) + '+08:00'
}

const isElement = (node, name) => node.type === 'tag' && node.name === name
const children = (node, name) => node.children.filter(child => isElement(child, name))
/** The text an element starts with (up to its first child element), or undefined when the element is missing. */
function textOf(node, name) {
  const element = node.children.find(child => isElement(child, name))
  if (!element) return undefined
  let text = ''
  for (const child of element.children) {
    if (child.type === 'text') text += child.data
    else if (child.type === 'cdata') text += child.children.map(part => part.data ?? '').join('')
    else if (child.type === 'tag') break
  }
  return text
}
/** Every <category> that sits directly under an <mmreader>, anywhere below the root element, in document order. */
function categories(root) {
  const found = []
  const walk = (node) => {
    for (const child of node.children ?? []) {
      if (child.type !== 'tag') continue
      if (child.name === 'mmreader') found.push(...children(child, 'category'))
      walk(child)
    }
  }
  walk(root)
  return found
}

const byCodePoint = (a, b) => {
  const left = [...a], right = [...b]
  for (let at = 0; at < Math.min(left.length, right.length); at++) {
    const difference = left[at].codePointAt(0) - right[at].codePointAt(0)
    if (difference !== 0) return difference
  }
  return left.length - right.length
}

export function extract(image) {
  const database = new DatabaseSync(':memory:')
  try {
    database.deserialize(image)
    const accounts = new Map()
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name).filter(name => /^Msg_[0-9a-fA-F]{32}$/.test(name)).sort()
    for (const table of tables) {
      const columns = new Set(database.prepare(`PRAGMA table_info("${table}")`).all().map(row => row.name))
      if (!columns.has('message_content')) continue
      const selected = ['message_content', 'compress_content', 'create_time'].filter(name => columns.has(name))
      for (const row of database.prepare(`SELECT ${selected.join(', ')} FROM "${table}"`).iterate()) {
        let content = decodeContent(row.message_content)
        if (!content.includes('<mmreader')) content = decodeContent(row.compress_content)
        if (!content.includes('<mmreader')) continue
        const root = parseDocument(content, { xmlMode: true }).children.find(node => node.type === 'tag')
        if (!root) continue
        for (const category of categories(root)) {
          const name = decodeHTML(textOf(category, 'name') || '').trim()
          for (const item of children(category, 'item')) {
            const parsed = publicArticle(textOf(item, 'url'))
            if (!parsed) continue
            const [biz, id, url] = parsed
            if (!accounts.has(biz)) accounts.set(biz, { biz, name: '', articles: new Map() })
            const account = accounts.get(biz)
            if (name) account.name = name
            if (!account.articles.has(id)) {
              account.articles.set(id, { id, title: decodeHTML(textOf(item, 'title') || ''), url,
                publishedAt: timestamp(textOf(item, 'pub_time') || textOf(item, 'time')) ?? timestamp(row.create_time) })
            }
          }
        }
      }
    }
    const list = [...accounts.values()].map(account => ({ ...account,
      // Newest first; articles without a time keep their order at the end.
      articles: [...account.articles.values()].sort((a, b) => (b.publishedAt ?? '') < (a.publishedAt ?? '') ? -1 : (b.publishedAt ?? '') > (a.publishedAt ?? '') ? 1 : 0) }))
    return { accounts: list.sort((a, b) => byCodePoint(a.name, b.name)) }
  } finally {
    database.close()
  }
}

/** JSON with every non-ASCII character escaped. */
export const asciiJson = value => JSON.stringify(value).replace(/[\u0080-￿]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'))

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  process.stdout.write(asciiJson(extract(Buffer.concat(chunks))) + '\n')
}
