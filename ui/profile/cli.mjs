import { readFileSync } from 'node:fs'
import { ProfileStore } from './store.mjs'

// JSON input comes from stdin or a named file, so long Markdown needs no shell escaping.
const [action = 'read', inputFile] = process.argv.slice(2)
try {
  const store = new ProfileStore()
  const input = inputFile ? JSON.parse(readFileSync(inputFile, 'utf8')) : (!process.stdin.isTTY ? JSON.parse(readFileSync(0, 'utf8') || '{}') : {})
  console.log(JSON.stringify(store.dispatch(action, input, 'ai'), null, 2))
} catch (error) {
  console.error(JSON.stringify({ error: error.message }))
  process.exitCode = 1
}
