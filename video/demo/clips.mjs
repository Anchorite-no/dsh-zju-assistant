/**
 * 录几段界面真的动起来的片段（可选）：执行过程一步步长出来、新通知滑进来、通知加到备忘录。
 * 用调试协议的 screencast 收每一次重绘的画面（2 倍像素），按收到的时刻排好，交给项目里的 FFmpeg 编成恒定 30 帧的 MP4。
 * 用法：node video/demo/run.mjs --only history,clips（clips 不在默认的清单里）
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { PHYS } from './chats.mjs'
import { REPO } from './stage.mjs'
import { sleep, WIDTH, HEIGHT, SCALE } from './driver.mjs'

const ffmpeg = createRequire(path.join(REPO, 'package.json'))('ffmpeg-static')

/** 录一段：start() 之后做 action，录到它结束再多 tail 毫秒。 */
async function record(d, name, action, { tail = 1200 } = {}) {
  const dir = path.join(d.clipsDir, `${name}-frames`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const frames = []
  const off = d.cdp.on((message) => {
    if (message.method !== 'Page.screencastFrame') return
    const { data, metadata, sessionId } = message.params
    const file = path.join(dir, `${String(frames.length).padStart(5, '0')}.jpg`)
    writeFileSync(file, Buffer.from(data, 'base64'))
    frames.push({ file, at: metadata.timestamp })
    void d.cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  await d.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: WIDTH * SCALE, maxHeight: HEIGHT * SCALE, everyNthFrame: 1 })
  await sleep(600)
  await action()
  await sleep(tail)
  await d.cdp.send('Page.stopScreencast')
  off()
  if (frames.length < 2) throw new Error(`片段 ${name} 只收到 ${frames.length} 帧`)
  // 每一帧停到下一帧来为止；FFmpeg 再按 30 帧重采样成恒定帧率。
  const list = frames.map((frame, index) => {
    const next = frames[index + 1]?.at ?? frame.at + 0.5
    return `file '${frame.file.replaceAll('\\', '/')}'\nduration ${Math.max(0.001, next - frame.at).toFixed(4)}`
  }).join('\n') + `\nfile '${frames.at(-1).file.replaceAll('\\', '/')}'\n`
  const listFile = path.join(dir, 'frames.txt')
  writeFileSync(listFile, list)
  const out = path.join(d.clipsDir, `${name}.mp4`)
  const run = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', `fps=30,scale=${WIDTH * SCALE}:${HEIGHT * SCALE}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-movflags', '+faststart', out], { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`编码 ${name} 失败：${run.stderr}`)
  const seconds = frames.at(-1).at - frames[0].at
  rmSync(dir, { recursive: true, force: true })
  console.log(`clip ${name}: ${frames.length} frames over ${seconds.toFixed(1)}s -> ${out}`)
  d.clips = [...(d.clips ?? []), { name, file: `assets/clips/${name}.mp4`, frames: frames.length, seconds: Math.round(seconds * 10) / 10 }]
}

export async function clips(d) {
  await d.clock(0)
  await d.nav('校园事务')
  await d.waitFor(`document.querySelectorAll('article.campus-notice').length >= 8`)
  await d.park()
  // 1. 通知加到备忘录：打开菜单 → AI 总结后添加 → 转圈 → 左栏多出一条、顶上提示
  const row = `[...document.querySelectorAll('article.campus-notice')].find(el => el.innerText.includes('体质健康测试'))`
  await d.waitFor(row)
  await record(d, 'memo-organize', async () => {
    await d.hover(row)
    await sleep(500)
    await d.clickAt(`${row}.querySelector('.campus-hand')`, '加到备忘录')
    await sleep(900)
    await d.clickAt(`[...document.querySelectorAll('[role=menuitem]')].find(el => el.innerText.includes('AI'))`, 'AI 总结后添加')
    await d.waitFor(`document.body.innerText.includes('已总结并加到备忘录')`, 15_000)
    await sleep(1500)
  }, { tail: 800 })
  // 2. 新通知滑进来：点右上角刷新，后台「读到」三条新的，从列表顶上滑进来
  await d.nav('校园事务')
  await d.waitFor(`document.querySelectorAll('article.campus-notice').length >= 8`)
  await sleep(4000)
  await d.park()
  await record(d, 'notice-slide-in', async () => {
    await d.eval(`__demo.incoming = [
      { id: 'clip:1', kind: 'school', view: 'campus', title: '关于2026年秋季学期期中学业预警名单确认的通知', from: '本科生院', at: '2026-10-21T15:41:00+08:00', dated: true, url: 'https://example.zju.edu.cn/notice/clip-1', foundAt: '2026-10-21T15:41:00+08:00', hidden: null },
      { id: 'clip:2', kind: 'chat', view: 'campus', title: '张老师：周六期中考试考场分两个教室，学号末位单号去东1B-203', from: '大学物理（乙）Ⅱ 课程群', at: '2026-10-21T15:41:30+08:00', dated: true, url: '', foundAt: '2026-10-21T15:41:30+08:00', platform: 'dingtalk', chatKind: 'group', mode: 'original', originals: [], hidden: null },
      { id: 'clip:3', kind: 'wechat', view: 'campus', title: '期中周｜紫金港图书馆延长开放到 23:00', from: '浙大图书馆', at: '2026-10-21T15:42:00+08:00', dated: true, url: 'https://example.zju.edu.cn/mp/clip-3', foundAt: '2026-10-21T15:42:00+08:00', hidden: null },
    ]; true`)
    await d.clickAt(`document.querySelector('.campus-page-head .campus-refresh')`, '刷新')
    await sleep(2200)
  })
  // 3. 执行过程一步步长出来：新会话里问「大物最近有什么要做的」，录到说完
  await d.clickAt(`[...document.querySelectorAll('button')].find(el => __tools.visible(el) && el.getBoundingClientRect().top < 200 && el.innerText.includes('新会话'))`, '新会话')
  await d.waitFor(`document.querySelector('[contenteditable=true], textarea')`)
  await sleep(800)
  await d.eval(`(() => { const el = [...document.querySelectorAll('[contenteditable=true], textarea')].filter(el => __tools.visible(el)).pop(); el.focus(); return true })()`)
  await d.type(PHYS.prompt)
  d.finished.delete('phys')
  await record(d, 'trace-grow', async () => {
    await sleep(500)
    await d.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
    await d.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    const until = Date.now() + 90_000
    while (!d.finished.has('phys')) { if (Date.now() > until) throw new Error('执行过程一直没有说完'); await sleep(200) }
    await sleep(2500)
  })
  writeFileSync(path.join(d.clipsDir, 'clips.json'), JSON.stringify(d.clips, null, 2) + '\n')
}
