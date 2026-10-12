/**
 * 用真的模型把对话后复盘跑一遍用例（cases.mjs）。改了规矩（ui/profile/review-prompt.mjs）或者核对的办法（review.mjs）以后跑，
 * 看有没有变差。走的是和应用里一样的路：摘要 → 问模型 → 核对 → 落盘，只是档案换成每条用例一个临时文件夹。
 *
 * 只起引擎，不开窗口，数据目录是隔离的；用的是开发时项目根目录里的密钥和默认选的模型，会花一点 token
 *（一条用例一次约五千，大半走缓存）。不进 npm test，也不进安装包。
 *
 * 用法：npm run eval:review -- [跑几遍，默认 3] [只跑哪几条，逗号分开]
 * 结果打在屏幕上，每一次的明细（模型的原话、落盘的内容、没过的原因）存在临时文件夹里，路径最后会打出来。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cases } from './cases.mjs'

const project = fileURLToPath(new URL('../../', import.meta.url))
const rounds = Number(process.argv[2]) || 3
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-review-eval-'))
const data = path.join(work, 'engine')
for (const name of ['home', 'workspace', 'chats']) fs.mkdirSync(path.join(data, name), { recursive: true })
Object.assign(process.env, {
  CAMPUS_PROFILE_DIR: path.join(data, 'profile'), CAMPUS_KEYS_DIR: project, CAMPUS_CHATS_DIR: path.join(data, 'chats'),
  WEREAD_DATA_DIR: path.join(data, 'weread'), DSH_HOME: path.join(data, 'home'), DSH_TELEMETRY_DISABLED: '1',
})
process.chdir(path.join(data, 'workspace'))

const { resolveDshHome } = await import('@deepseek-ai/dsh-home-paths')
const { runProfile } = await import('@deepseek-ai/dsh/profile-boot')
const { campusEnvironment, writeCampusPatch } = await import('../../desktop/config.mjs')
const { ensureCampusProfile } = await import('../../desktop/profile.mjs')
const { askModel } = await import('../../ui/profile/model.mjs')
const { ProfileStore } = await import('../../ui/profile/store.mjs')
const { FlowNotes } = await import('../../ui/profile/flow-notes.mjs')
const { Review } = await import('../../ui/profile/review.mjs')

ensureCampusProfile(resolveDshHome(), 'campus')
const { ctx, shutdown } = await runProfile({
  environment: campusEnvironment(), profile: 'campus',
  patchFiles: [writeCampusPatch(project, resolveDshHome(), project)], args: ['--no-open', '--port', '0'],
})

/** 一条用例跑一次：新建一份档案，放进它开始时已有的记忆和补充，照应用里的办法复盘，返回落盘的结果。 */
async function once(item, round) {
  const root = path.join(work, `${item.id}-${round}`)
  const store = new ProfileStore(path.join(root, 'profile'))
  for (const memory of item.memories ?? []) {
    const saved = store.memory.saveByAssistant({ title: memory.title, tags: memory.tags, properties: memory.properties, body: memory.body })
    // human 是用户在页面上改成的样子：存过一次以后，这一条就不算助手写的了。
    if (memory.human) store.memory.save({ title: memory.title, from: memory.title, revision: saved.revision, tags: memory.tags, properties: [], body: memory.human })
  }
  const flowNotes = new FlowNotes({ file: store.file('flow-notes.json'), flowsDir: path.join(project, 'core', 'zju', 'flows') })
  for (const note of item.notes ?? []) flowNotes.add(note)
  const seeded = new Set(flowNotes.list().map(note => note.id))
  let answer = ''
  const review = new Review({
    store, flowNotes, sessionOf: () => ({ snapshotEvents: () => item.events }), courses: () => item.courses ?? [],
    // 和 host.mjs 里给的一样；网络断了一下就再问一次（应用里是过一阵自己重试）。
    ask: async (input) => {
      const ask = () => askModel(ctx, { ...input, reasoningEffort: 'low', maxTokens: 4000, timeoutMs: 120_000 })
      answer = await ask().catch(ask)
      return answer
    },
    settingsFile: store.file('review.json'), logFile: store.file('review-log.json'), stateFile: path.join(root, 'cache', 'review.json'),
  })
  const started = Date.now()
  const run = await review.run(item.id)
  const outcome = {
    id: item.id, round, ms: Date.now() - started, error: run?.error, dropped: run?.dropped ?? [],
    written: review.entries().map(({ before: _before, after: _after, ...entry }) => entry),
    memory: Object.fromEntries(store.memory.list().notes.map(note => [note.title, note.body])),
    notes: flowNotes.list().filter(note => !seeded.has(note.id)).map(note => note.text),
    answer,
  }
  outcome.problems = outcome.error ? [`没跑成：${outcome.error}`] : item.check(outcome)
  // 自动检查只认关键词，漏得掉「把助手讲的半句带进来」这种。这里把落盘的行里只在助手的话里出现过的
  // 符号和英文数字的词标出来，不算毛病，留给人看一眼。
  const textOf = type => item.events.filter(event => event.type === type).map(event => JSON.stringify(event.data)).join('\n')
  const user = textOf('user/message'), assistant = textOf('assistant/message')
  const lines = [...outcome.written.flatMap(entry => entry.added), ...outcome.notes].join('\n')
  outcome.borrowed = [...new Set(lines.match(/[^\s\p{Script=Han}，。；：、（）「」《》！？“”‘’·…—]{2,}/gu) ?? [])].filter(word => assistant.includes(word) && !user.includes(word))
  fs.writeFileSync(path.join(work, `${item.id}-${round}.json`), JSON.stringify(outcome, null, 1))
  return outcome
}

try {
  const selection = ctx.get?.('agentDefaultModel')?.currentSelection()
  console.log(`模型：${selection?.provider} / ${selection?.model}；${rounds} 遍\n`)
  const picked = cases.filter(item => !only || only.has(item.id))
  const jobs = picked.flatMap(item => Array.from({ length: rounds }, (_, round) => ({ item, round: round + 1 })))
  const results = new Map(picked.map(item => [item.id, []]))
  let next = 0
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < jobs.length) { const { item, round } = jobs[next++]; results.get(item.id)[round - 1] = await once(item, round) }
  }))
  let passed = 0
  for (const item of picked) {
    const runs = results.get(item.id), good = runs.filter(run => !run.problems.length).length
    passed += good
    console.log(`${good === rounds ? '✓' : '✗'} ${item.id.padEnd(4)}${item.name}  ${good}/${rounds}`)
    for (const run of runs) {
      const wrote = run.written.map(entry => `${entry.kind === 'flow' ? '工作流' : entry.created ? '新建' : '改'}「${entry.title}」${entry.added.map(line => ` +${line}`).join('')}${entry.removed.map(line => ` −${line}`).join('')}`).join('；') || '没写'
      if (run.problems.length || run.borrowed.length || run.dropped.length || process.argv.includes('--all')) console.log(`    第 ${run.round} 遍：${wrote}${run.problems.length ? `\n      毛病：${run.problems.join('；')}` : ''}${run.borrowed.length ? `\n      只在助手的话里出现过的词：${run.borrowed.join('、')}` : ''}${run.dropped.length ? `\n      没过核对的：${run.dropped.map(drop => `${drop.what}（${drop.why}）`).join('；')}` : ''}`)
    }
  }
  console.log(`\n${passed}/${jobs.length} 次没有毛病。明细在 ${work}`)
} catch (error) {
  console.log(`没跑成：${error.stack ?? error.message}`)
} finally {
  // 引擎的数据目录等它停下来、进程要退出时再删（之前它还占着里面的文件）；删不掉就留着，是临时文件夹。
  process.chdir(os.tmpdir())
  process.on('exit', () => { try { fs.rmSync(data, { recursive: true, force: true }) } catch { /* 见上 */ } })
  await shutdown.shutdown(0)
}
