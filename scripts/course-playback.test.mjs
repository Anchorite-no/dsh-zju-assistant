import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { diagnose } from '../core/skills/course-playback/scripts/diagnose.mjs'
import { copyPublicTree, checkPublishedTree } from './private-paths.cjs'

const sample = (overrides = {}) => ({ atMs: 0, currentTime: 100, paused: false, readyState: 4, ...overrides })
const root = fileURLToPath(new URL('../', import.meta.url))

test('actual advancement is distinguished from a static ready pause and a saved end position', () => {
  assert.equal(diagnose({ samples: [sample(), sample({ atMs: 3000, currentTime: 106, playbackRate: 2 })] }).kind, 'advancing')
  assert.equal(diagnose({ samples: [sample({ paused: true })] }).kind, 'paused-without-error-evidence')
  assert.equal(diagnose({ samples: [sample({ paused: true, currentTime: 599.8, duration: 600 })] }).kind, 'near-end-paused')
  assert.equal(diagnose({ samples: [sample(), sample({ currentTime: 106 })] }).kind, 'insufficient-evidence')
})

test('buffering requires elapsed time and interruption evidence; manual pause takes priority', () => {
  for (const ready of [{ readyState: 2 }, { event: 'stalled' }, { event: 'waiting' }]) {
    assert.equal(diagnose({ samples: [sample(ready), sample({ ...ready, atMs: 12000 })] }).kind, 'buffering-evidence')
    assert.equal(diagnose({ samples: [sample(ready), sample({ ...ready, atMs: 3000 })] }).kind, 'insufficient-evidence')
  }
  assert.equal(diagnose({ samples: [sample(), sample({ atMs: 12000, paused: true, recentInput: true, readyState: 2 })] }).kind, 'manual-pause-evidence')
  assert.equal(diagnose({ samples: [sample(), sample({ atMs: 12000 })] }).kind, 'insufficient-evidence')
})

test('media errors, rejected playback and ended states retain separate meanings', () => {
  for (const errorCode of [1, 2, 3, 4]) assert.equal(diagnose({ samples: [sample({ errorCode })] }).kind, 'media-error')
  assert.equal(diagnose({ samples: [sample({ event: 'play-blocked' })] }).kind, 'play-blocked')
  assert.equal(diagnose({ samples: [sample({ ended: true })] }).kind, 'ended')
})

test('invalid and mixed-video observations are rejected instead of guessed', () => {
  for (const input of [null, {}, { samples: [] }, { samples: [sample({ paused: 'false' })] },
    { samples: [sample({ readyState: 8 })] }, { samples: [sample({ ended: 'false' })] },
    { samples: [sample({ duration: '600' })] }, { samples: [sample({ currentTime: -1 })] },
    { samples: [sample({ atMs: 1 }), sample()] },
    { samples: [sample(), sample({ atMs: 1000, currentTime: 1 })] }]) assert.throws(() => diagnose(input))
})

test('diagnostics do not echo extra fields, media addresses, course names or cookies', () => {
  const result = diagnose({ samples: [sample({ src: 'https://example.invalid/?signed=private', cookie: 'private-cookie', course: 'private-course' })] })
  assert.doesNotMatch(JSON.stringify(result), /signed=|private-cookie|private-course|example\.invalid/)
})

test('workflow and CLI survive the actual public package copy', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zju-playback-'))
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
  const source = path.join(root, 'core', 'skills', 'course-playback'), target = path.join(temp, 'course-playback')
  copyPublicTree(source, target, path.join(root, 'core'))
  assert.equal(checkPublishedTree(temp), 3)
  const file = path.join(temp, 'observation.json')
  fs.writeFileSync(file, JSON.stringify({ samples: [sample({ paused: true })] }))
  const script = path.join(target, 'scripts', 'diagnose.mjs')
  const passed = spawnSync(process.execPath, [script, '--file', file], { encoding: 'utf8' })
  assert.equal(passed.status, 0, passed.stderr)
  assert.equal(JSON.parse(passed.stdout).kind, 'paused-without-error-evidence')
  const missing = spawnSync(process.execPath, [script], { encoding: 'utf8' })
  assert.equal(missing.status, 1)
  assert.equal(JSON.parse(missing.stdout).status, 'error')
  fs.writeFileSync(file, '{')
  const malformed = spawnSync(process.execPath, [script, '--file', file], { encoding: 'utf8' })
  assert.equal(malformed.status, 1)
  assert.equal(JSON.parse(malformed.stdout).status, 'error')
})
