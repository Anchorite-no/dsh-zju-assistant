/**
 * 校园事务、日程表、学习、插件、个人档案这些页面的截图。数据全是 fixtures.mjs 编的。
 */
import { sleep } from './driver.mjs'

const AFFAIRS = [
  ['affairs.todo', '.campus-affairs-todo'],
  ['affairs.feed', '.campus-feed'],
  ['task', 'article.campus-task', { text: '.campus-task-open', list: true }],
  ['task.due', 'article.campus-task .campus-task-due', { list: true }],
  ['task.hand', 'article.campus-task .campus-hand', { list: true }],
  ['tasks.range', '.campus-affairs-todo .campus-section-head [role=radiogroup], .campus-affairs-todo .campus-section-head [role=group]'],
  ['tasks.more', '.campus-affairs-todo section[aria-label="作业"] .campus-more'],
  ['memo', 'section[aria-label="备忘录"] .campus-note-row', { list: true }],
  ['memo.new', 'section[aria-label="备忘录"] .campus-section-head button'],
  ['memos.more', 'section[aria-label="备忘录"] .campus-more'],
  ['feed.tab', '.campus-feed-tabs [role=tab]', { list: true }],
  ['feed.filter', '.campus-feed-filter'],
  ['notice', 'article.campus-notice', { text: '.campus-notice-open', list: true }],
  ['notice.meta', 'article.campus-notice .campus-notice-meta', { list: true }],
  ['notice.memo', 'article.campus-notice .campus-hand', { list: true }],
  ['feed.more', '.campus-feed .campus-more'],
  ['feed.folded', '.campus-feed .campus-task-note'],
  ['refresh', '.campus-page-head .campus-refresh'],
]

/** 校园事务：两栏、个人消息、收起的展开。 */
export async function affairs(d) {
  await d.nav('校园事务')
  await d.waitFor(`document.querySelectorAll('article.campus-notice').length >= 8 && document.querySelectorAll('article.campus-task').length >= 5`)
  await d.park()
  await d.shot('affairs', { spec: AFFAIRS, note: '校园事务两栏：左栏作业（两周内，先露 5 项）和备忘录，右栏校园通知（一周内，先露 8 条）' })

  // 展开全部作业和通知（长图用不上，但坐标给动画用）
  await d.clickAt(`document.querySelector('.campus-feed .campus-task-note .campus-textlink')`, '展开收起的')
  await sleep(700)
  await d.park()
  await d.shot('affairs-collapsed', { spec: AFFAIRS, note: '点了「另有 N 条和你关系不大，已收起」后面的「展开」：收起的几条（研工部、外院、医学院、招聘宣讲）回到列表，行上带 data-folded' })
  await d.clickAt(`document.querySelector('.campus-feed .campus-task-note .campus-textlink')`, '再收起')
  await sleep(400)

  await d.clickAt(`document.getElementById('campus-feed-tab-personal')`, '个人消息页签')
  await sleep(700)
  await d.park()
  await d.shot('affairs-personal', { spec: AFFAIRS, note: '右栏切到「个人消息」：私聊、浙大邮箱的新来信、CC98 的回复和私信' })
  await d.clickAt(`document.getElementById('campus-feed-tab-campus')`, '校园通知页签')
  await sleep(500)
}

/** 通知加到备忘录：菜单 → AI 总结中 → 加好了（提示和左栏多出一条）→ 打开这条备忘。 */
export async function memoAi(d) {
  await d.nav('校园事务')
  await d.waitFor(`document.querySelectorAll('article.campus-notice').length >= 8`)
  const row = `[...document.querySelectorAll('article.campus-notice')].find(el => el.innerText.includes('体质健康测试'))`
  await d.waitFor(row)
  await d.hover(`${row}`)
  await sleep(300)
  await d.shot('memo-ai-1', { spec: AFFAIRS, note: '要加的那条通知：学工部《关于开展2026年秋季学期学生体质健康测试的通知》，鼠标在这一行上' })
  await d.clickAt(`${row}.querySelector('.campus-hand')`, '加到备忘录按钮')
  await sleep(500)
  await d.shot('memo-ai-2', { spec: [...AFFAIRS, ['menu', '[role=menu]'], ['menu.item', '[role=menuitem]', { list: true }]], note: '点了行右边的「加到备忘录」：两个选项，直接添加 / AI 总结后添加' })
  await d.eval(`__demo.holdSummary = true`)
  await d.clickAt(`[...document.querySelectorAll('[role=menuitem]')].find(el => el.innerText.includes('AI'))`, 'AI 总结后添加')
  await sleep(900)
  await d.park()
  await d.shot('memo-ai-3', { spec: AFFAIRS, note: '模型在整理：这一行右边的按钮转圈（aria-busy），左栏还没有这条' })
  await d.eval(`__demo.holdSummary = false; __demo.release?.()`)
  await d.waitFor(`document.body.innerText.includes('已总结并加到备忘录')`, 10_000)
  await sleep(600)
  await d.shot('memo-ai-4', { spec: [...AFFAIRS, ['toast', '[role=status], [class*=toast], [class*=Toast]']], note: '整理完：顶上提示「已总结并加到备忘录，查看」，左栏备忘录第一条是「体质健康测试」，通知行上的按钮变成勾' })
  await d.clickAt(`[...document.querySelectorAll('section[aria-label="备忘录"] .campus-note-open')].find(el => el.innerText.includes('体质健康测试'))`, '打开新备忘')
  await d.waitFor(`!document.body.innerText.includes('已总结并加到备忘录')`, 10_000, '提示消失')
  await sleep(500)
  await d.park()
  await d.shot('memo-ai-5', { spec: [['memo.title', '.campus-detail .campus-page-title'], ['memo.props', '.campus-detail .campus-props'], ['memo.prop', '.campus-detail .campus-props > div', { list: true }], ['memo.body', '.campus-detail .campus-markdown, .campus-detail [class*=markdown]']], note: '打开 AI 整理好的备忘：时间、截止、来源排进属性，正文是要点' })
  await d.clickText('校园事务', { loose: false })
  await sleep(500)
}

const GRID = [
  ['grid', '.campus-grid'],
  ['grid.head', '.campus-grid-head', { list: true }],
  ['grid.period', '.campus-grid-period', { list: true }],
  ['grid.day', '.campus-grid-day', { list: true }],
  ['block', '.campus-block', { list: true }],
  ['pin', '.campus-pin', { list: true }],
  ['grid.now', '.campus-grid-now'],
  ['plan.week', '.campus-plan-week'],
  ['plan.nav', '.campus-plan-nav button', { list: true }],
  ['schedule.tabs', '.campus-schedule-tabs [role=tab], .campus-schedule-tabs button', { list: true }],
]

export async function schedule(d) {
  await d.nav('日程表')
  await d.waitFor(`document.querySelectorAll('.campus-block').length >= 10`)
  await d.park()
  await d.shot('schedule', { spec: GRID, note: '日程表这一周（第 6 周，双周）：课（含双周的上机和物理实验）、考试、作业截止、带时间的备忘' })
}

const LEARN = [
  ['learn.course', '.campus-learn-a article.campus-notice', { text: '.campus-notice-open', list: true }],
  ['learn.lesson', '.campus-learn-b article.campus-notice, .campus-learn-b .campus-row', { list: true }],
  ['learn.made', 'article.campus-learn-made'],
  ['learn.source', '.campus-learn-title [role=radio], .campus-learn-title button', { list: true }],
  ['section', '.campus-section[aria-label]', { list: true }],
  ['resource', '.campus-learn-lesson .campus-row', { list: true }],
  ['summary', '.campus-learn-lesson .campus-markdown'],
  ['summary.h2', '.campus-learn-lesson .campus-markdown h2', { list: true }],
  ['film', '.campus-learn-film'],
  ['row', '.campus-learn-c .campus-row, .campus-learn-c article', { list: true }],
]

export async function learning(d) {
  await d.nav('学习')
  await d.waitFor(`document.querySelectorAll('.campus-learn-a article.campus-notice').length >= 5`)
  await sleep(1200)
  await d.park()
  await d.shot('learning', { spec: LEARN, note: '学习页（智云）：左栏本学期有录播的课，按最近上课排；右栏是点好的第一门课' })
  // 数据结构基础 → 课次列表
  await d.clickAt(`[...document.querySelectorAll('.campus-learn-a .campus-notice-open')].find(el => el.innerText.includes('数据结构基础'))`, '数据结构基础')
  await sleep(1200)
  await d.park()
  await d.shot('learning-course', { spec: LEARN, note: '点中「数据结构基础」：右栏是它在智云上的课次，带总结、讲解的有标记' })
  // 点最近的一次课：左栏换成课次，右栏是这次课
  await d.clickAt(`[...document.querySelectorAll('button')].find(el => __tools.visible(el) && el.getBoundingClientRect().left > 900 && /第\\s*\\d+\\s*次/.test(el.innerText))`, '最近一次课')
  await d.waitFor(`document.querySelector('.campus-learn-lesson .campus-markdown')`, 10_000, '课后总结')
  await sleep(1400)
  await d.park()
  await d.shot('learning-lesson', { spec: LEARN, note: '数据结构基础的课次列表（左）和最近一次课（右）：回放、课件、截图、字幕，下面是课后总结' })
  // 右栏往下滚：带时间点的分节总结和「讲解」那一节
  await d.eval(`(() => { document.querySelector('.campus-learn-lesson section[aria-label="讲解"]')?.scrollIntoView({ block: 'end' }); return true })()`)
  await sleep(800)
  await d.park()
  await d.shot('learning-summary', { spec: LEARN, note: '同一次课往下滚：课后总结按时间点分节（00:28:50 四种旋转、00:57:20 伸展树……），最下面是讲解「AVL 树的四种旋转」和播放按钮' })
}

export async function plugins(d) {
  await d.nav('插件')
  await d.waitFor(`document.querySelectorAll('.campus-plugin-row').length >= 5`)
  await sleep(800)
  await d.park()
  await d.shot('plugins', { spec: [['plugin', '.campus-plugin-row', { list: true }], ['group', '.campus-group', { list: true }], ['group.title', '.campus-group-title', { list: true }]], note: '插件页：按用途分组，学校的各个系统和聊天、邮箱、讲解都接上了' })
  // 技能在插件页里
  const skills = await d.eval(`!!__tools.byText('技能')`)
  if (skills) {
    await d.eval(`(() => { const h = [...document.querySelectorAll('.campus-group-title, h2, h3')].find(el => el.innerText.trim() === '技能'); h.closest('section, .campus-group')?.scrollIntoView({ block: 'start' }); return true })()`)
    await sleep(900)
    await d.park()
    await d.shot('skills', { spec: [['skill', '.campus-plugin-row, .campus-row', { list: true }]], note: '插件页里的技能：应用自带的工作流和助手学到的' })
  }
}

export async function profile(d) {
  await d.nav('校园事务')
  await d.nav('设置')
  await sleep(800)
  await d.clickText('个人档案')
  await d.waitFor(`document.querySelectorAll('.campus-note-row').length >= 5`)
  await sleep(600)
  await d.park()
  await d.shot('profile', { spec: [['identity', 'section[aria-label="基础信息"]'], ['identity.field', 'section[aria-label="基础信息"] .campus-props > div, section[aria-label="基础信息"] dl > div', { list: true }], ['memory', '.campus-note-row', { list: true }]], note: '设置 → 个人档案：基础信息和记忆（课程、平台入口、偏好；计算机组成那条写着待核实）' })
  await d.clickAt(`[...document.querySelectorAll('.campus-note-open')].find(el => el.innerText.includes('计算机组成'))`, '计算机组成记忆')
  await sleep(800)
  await d.park()
  await d.shot('profile-note', { spec: [['note.title', '.campus-detail .campus-page-title'], ['note.prop', '.campus-detail .campus-props > div', { list: true }], ['note.body', '.campus-detail .campus-markdown, .campus-detail [class*=markdown]']], note: '记忆「计算机组成」：Lab 报告的提交方式待核实' })
  await closeSettings(d)
}


/** 关掉设置对话框：点它右上角的叉（对话框里最靠右上的按钮）。 */
export async function closeSettings(d) {
  for (let i = 0; i < 3; i++) {
    const box = await d.eval(`(() => {
      const dialog = document.querySelector('[role=dialog]')
      if (!dialog) return null
      const buttons = [...dialog.querySelectorAll('button')].filter(el => __tools.visible(el))
      const named = buttons.filter(el => /关闭|close/i.test((el.getAttribute('aria-label') ?? '') + (el.title ?? '')))
      const pick = named.pop() ?? buttons.sort((a, b) => (b.getBoundingClientRect().right - b.getBoundingClientRect().top) - (a.getBoundingClientRect().right - a.getBoundingClientRect().top))[0]
      if (!pick) return null
      const r = pick.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })()`)
    if (!box) return
    await d.mouse(box.x, box.y)
    await sleep(500)
  }
}
