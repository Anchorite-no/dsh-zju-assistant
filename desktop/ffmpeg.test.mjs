import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { bundledFfmpeg, ffmpegEnv } = require('./ffmpeg.cjs')

test('自带的 FFmpeg 在应用的 node_modules 里，并且跑得起来', () => {
  const file = bundledFfmpeg()
  assert.ok(file, 'ffmpeg-static 没装上，或者装包时没下到当前系统的 FFmpeg')
  assert.ok(path.isAbsolute(file))
  assert.match(execFileSync(file, ['-hide_banner', '-version'], { encoding: 'utf8' }), /^ffmpeg version /)
})

test('交给引擎的是 FFMPEG_PATH；用户自己设过的不覆盖', () => {
  assert.deepEqual(ffmpegEnv({}), { FFMPEG_PATH: bundledFfmpeg() })
  assert.deepEqual(ffmpegEnv({ FFMPEG_PATH: 'D:\\tools\\ffmpeg.exe' }), {})
})
