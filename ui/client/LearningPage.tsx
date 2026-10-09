/**
 * 学习：左栏是智云里本人本学期的课程，按最近一次上课的时间排；右栏是做好的总结和讲解。两栏的列表各放在定高的框里自己滚动。
 * 点一门课看它上过的课次，再点一次课是这次课的资料、总结和讲解：资料可以下到本机，总结和讲解交给助手去做（handoff.tsx）。
 * 做出来的东西落在「文档」里固定的文件夹，页面只是把那里有的画出来，所以助手做完以后回到窗口就能看到。
 * 和校园事务页一样，先照上一次读到的画，后台再去读新的。数据和缓存在引擎侧的 ui/profile/learning.mjs。
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  Button, IconChevronRightOutlineRegular, IconDownloadOutlineRegular, IconFolderOpenOutlineRegular, IconNewChatOutlineRegular,
  IconPlayOutlineRegular, IconRefreshOutlineRegular, MarkdownText, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { CAMPUS_PLUGINS } from '../profile/catalog.mjs'
import { errorText, profileApi } from './api.ts'
import { Alert, Crumb } from './controls.tsx'
import { Flow } from './Flow.tsx'
import { handToAssistant } from './handoff.tsx'
import { openPlugin } from './PluginsPage.tsx'
import { agoText, dateText, mixed, useNow } from './when.ts'

interface Course { id: string, title: string, teacher: string, term: string }
/** count 是已经上过几次，last 是最近上过的那一次。 */
interface CourseItem extends Course { count: number, last: { lesson: number, date: string | null } | null }
/** 右栏的一条。总结的 id 是「课程编号:第几次」，讲解的 id 是成品的文件名；课次来的才有 courseId 和 lesson。 */
interface Product { kind: 'summary' | 'film', state: 'done' | 'making', id: string, title: string, at: string | null, courseId?: string, lesson?: number, course?: string }
/** state：ready 能读，account 账号还没填，off 插件关着。plugin 是去插件页的哪一项处理。 */
interface Snapshot { state: 'ready' | 'account' | 'off', plugin: string, courses: CourseItem[], products: Product[], fetchedAt: string | null, error: string | null }
/** saved 是本机已经下了哪几种资料；film 是这次课的讲解做到哪了。 */
interface Lesson { lesson: number, date: string | null, time: string | null, saved: string[], summary: boolean, film: 'done' | 'making' | null }
interface CoursePage { course: Course, lessons: Lesson[], upcoming: number, fetchedAt: string | null, error: string | null }
interface Resource { kind: string, label: string, text: string, saved: boolean, busy: boolean }
/** partial：只知道有哪几种资料，完整的清单还没读过。topic 是这次课的讲解该用的主题目录名。 */
interface LessonPage {
  course: Course, lesson: { lesson: number, date: string | null, time: string | null }, resources: Resource[], partial: boolean
  summary: { text: string, at: string } | null, film: { state: 'done' | 'making', id: string, title: string } | null
  topic: string, fetchedAt: string | null, error: string | null
}
interface State { snapshot: Snapshot | null, busy: boolean, error: string }

/** 页面的状态放在组件外面：离开这一页再回来直接照上一次的画，正在进行的读取也不会断。 */
let state: State = { snapshot: null, busy: false, error: '' }
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const update = (patch: Partial<State>) => { state = { ...state, ...patch }; for (const listener of [...listeners]) listener() }
/** 点开过的课程和课次上一次读到的内容，再点开时先照它画。 */
const courses = new Map<string, CoursePage>(), lessons = new Map<string, LessonPage>()

/** 进页面、回到窗口、点刷新时调用。先拿缓存，再让后台去智云读；刚读过的后台自己会跳过，force 时照读。 */
async function visit(force = false): Promise<void> {
  let snapshot: Snapshot
  try { snapshot = await profileApi<Snapshot>('learning-read') } catch (error) { update({ error: errorText(error) }); return }
  update({ snapshot, error: '' })
  if (state.busy || snapshot.state !== 'ready') return
  update({ busy: true })
  try { update({ snapshot: await profileApi<Snapshot>('learning-refresh', { force }) }) }
  catch (error) { update({ error: errorText(error) }) }
  finally { update({ busy: false }) }
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const MARKDOWN_LABELS = { code: { copyLabel: '复制', copiedLabel: '已复制' }, footnotes: '注释' }
const pluginTitle = (id: string) => CAMPUS_PLUGINS.find(plugin => plugin.id === id)?.title ?? '插件'

/** 课次的日期是「2026-10-08」这样的北京时间：写成几月几日加星期。 */
function dayText(date: string | null, now: number): string {
  if (!date) return '时间待定'
  const at = new Date(`${date}T00:00:00`).getTime()
  return `${dateText(at, now)} ${WEEKDAYS[new Date(at).getDay()]}`
}

/** 讲解在应用自己的窗口里放：壳认这个地址，按文件名到讲解目录里找成品（desktop/film.cjs）。 */
const play = (id: string) => { window.open(`/campus-film/${encodeURIComponent(id)}`, '_blank') }

/** 总结是按 Markdown 阅读器写的；页面里显示不了的（注释、本机图片、提示块的标记、开头和页面重复的大标题）去掉，文字都留着。 */
const readable = (text: string) => text.replace(/<!--[\s\S]*?-->/g, '').replace(/<table>[\s\S]*?<\/table>/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/^> \[![A-Za-z]+\][^\n]*\n/gm, '').replace(/^\s*# [^\n]*\n/, '').trim()

function Arrow() {
  return <span className="campus-learn-arrow" aria-hidden="true"><IconChevronRightOutlineRegular size={14} /></span>
}

/** 列表下面的小字说明，可以带一个去处理的入口。 */
function Note({ text, action, onAction }: { text: string, action?: string, onAction?: () => void }) {
  return (
    <p className="campus-note campus-task-note">
      <span>{text}</span>
      {action && <button type="button" className="campus-textlink" onClick={onAction}>{action}</button>}
    </p>
  )
}

/** 没读到时的那句话。冒号后面的原因是系统给的原话，不动它。 */
const failure = (what: string, fetchedAt: string | null, error: string, now: number) =>
  `${mixed(fetchedAt ? `${what}这次没读到，上面的还是${agoText(Date.parse(fetchedAt), now)}读到的：` : `${what}没读到：`)}${error.replace(/[。.]$/, '')}。`

/** 课程列表里的一行：课程名，下面是老师；右边是最近上过的那一次。 */
function CourseRow({ course, now, onOpen }: { course: CourseItem, now: number, onOpen: () => void }) {
  return (
    <article className="campus-notice">
      <div className="campus-notice-main">
        <button type="button" className="campus-notice-open" onClick={onOpen}>{course.title}</button>
        {course.teacher && <span className="campus-notice-meta"><span>{course.teacher}</span></span>}
      </div>
      <span className="campus-learn-side">{course.last ? `第 ${course.last.lesson} 次 · ${dayText(course.last.date, now)}` : '还没上过'}</span>
      <Arrow />
    </article>
  )
}

/** 右栏的一行。总结点进那一次课；做好的讲解点了就放；还在做的点不开。 */
function ProductRow({ item, now, onOpen }: { item: Product, now: number, onOpen: () => void }) {
  const from = item.courseId && item.lesson ? `${item.course || '课程'} 第 ${item.lesson} 次` : '自己的资料'
  const title = item.kind === 'summary' ? `${item.title} 第 ${item.lesson} 次` : item.title
  const making = item.state === 'making'
  return (
    <article className="campus-notice" data-idle={making ? '' : undefined}>
      <div className="campus-notice-main">
        {making ? <span className="campus-notice-open">{item.courseId ? from : item.title}</span> : <button type="button" className="campus-notice-open" onClick={onOpen}>{title}</button>}
        <span className="campus-notice-meta">
          <Tag>{item.kind === 'summary' ? '总结' : '讲解'}</Tag>
          {item.kind === 'film' && !making && <span>{from}</span>}
          {making ? <span>正在做</span> : item.at && <time dateTime={item.at}>{agoText(Date.parse(item.at), now)}</time>}
        </span>
      </div>
      {!making && (item.kind === 'film'
        ? <Button className="campus-hand" size="sm" variant="outline" aria-label="播放" tabIndex={-1} icon={<IconPlayOutlineRegular size={14} />} onClick={onOpen} />
        : <Arrow />)}
    </article>
  )
}

/** 一门课里的一行课次：第几次，下面是哪天；右边标出本机已经有的东西。 */
function LessonRow({ lesson, now, onOpen }: { lesson: Lesson, now: number, onOpen: () => void }) {
  return (
    <article className="campus-notice">
      <div className="campus-notice-main">
        <button type="button" className="campus-notice-open" onClick={onOpen}>第 {lesson.lesson} 次</button>
        <span className="campus-notice-meta"><span>{dayText(lesson.date, now)}{lesson.time ? ` ${lesson.time}` : ''}</span></span>
      </div>
      <span className="campus-learn-tags">
        {lesson.saved.length > 0 && <Tag>已下载</Tag>}
        {lesson.summary && <Tag>总结</Tag>}
        {lesson.film && <Tag>{lesson.film === 'done' ? '讲解' : '讲解在做'}</Tag>}
      </span>
      <Arrow />
    </article>
  )
}

/** 点开的一门课：上过的课次，新的在上。先照上一次读到的画，再去智云读。 */
function CourseView({ id, title, now, onBack, onOpen }: { id: string, title: string, now: number, onBack: () => void, onOpen: (lesson: number) => void }) {
  const [data, setData] = useState<CoursePage | null>(() => courses.get(id) ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    const apply = (next: CoursePage) => { courses.set(id, next); if (live) setData(next) }
    void (async () => {
      try {
        apply(await profileApi<CoursePage>('learning-course', { id }))
        if (live) setBusy(true)
        apply(await profileApi<CoursePage>('learning-course-refresh', { id }))
      } catch (reason) { if (live) setError(errorText(reason)) } finally { if (live) setBusy(false) }
    })()
    // 助手下了资料、写了总结以后回到窗口，标记跟着出现。
    const again = () => { profileApi<CoursePage>('learning-course', { id }).then(apply, () => {}) }
    window.addEventListener('focus', again)
    return () => { live = false; window.removeEventListener('focus', again) }
  }, [id])

  const course = data?.course
  const empty = !data ? '' : data.lessons.length > 0 ? '' : busy && !data.fetchedAt ? '第一次读这门课，要等一会儿。' : data.fetchedAt ? '这门课还没有上过的课次。' : ''
  return (
    <div className="campus-detail">
      <Crumb text="学习" onBack={onBack} />
      <div className="campus-detail-head" data-wrap="">
        <div className="campus-detail-main"><h1 className="campus-page-title">{course?.title ?? title}</h1></div>
      </div>
      {error && <div className="campus-detail-notices"><Alert>{error}</Alert></div>}
      {course && (course.teacher || course.term) && (
        <dl className="campus-props">
          {course.teacher && <div><dt>教师</dt><dd>{course.teacher}</dd></div>}
          {course.term && <div><dt>学期</dt><dd>{course.term}</dd></div>}
        </dl>
      )}
      <div className="campus-sections">
        <section className="campus-section" aria-label="课次">
          <div className="campus-titleline">
            <h2 className="campus-section-title">课次</h2>
            {data && data.lessons.length > 0 && <span className="campus-count">{data.lessons.length}</span>}
          </div>
          {data && (
            <Flow items={data.lessons} keyOf={lesson => String(lesson.lesson)} label="课次">
              {lesson => <LessonRow lesson={lesson} now={now} onOpen={() => { onOpen(lesson.lesson) }} />}
            </Flow>
          )}
          {empty && <p className="campus-task-empty">{empty}</p>}
          {data && data.upcoming > 0 && <p className="campus-note">还没上的有 {data.upcoming} 次。</p>}
          {data?.error && !busy && <Note text={failure('这门课的课次', data.fetchedAt, data.error, now)} />}
        </section>
      </div>
    </div>
  )
}

/** 点开的一次课：资料、总结、讲解。先照上一次读到的画，再去智云读完整的资料清单。 */
function LessonView({ id, number, title, now, onBack }: { id: string, number: number, title: string, now: number, onBack: () => void }) {
  const key = `${id}:${number}`, input = { course: id, lesson: number }
  const [data, setData] = useState<LessonPage | null>(() => lessons.get(key) ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  /** 正在下载的那几种，和没下成的各自的原因。 */
  const [fetching, setFetching] = useState<readonly string[]>([])
  const [failed, setFailed] = useState<Record<string, string>>({})
  const live = useRef(true)
  const apply = (next: LessonPage) => { lessons.set(key, next); if (live.current) setData(next) }
  useEffect(() => {
    live.current = true
    void (async () => {
      try {
        apply(await profileApi<LessonPage>('learning-lesson', input))
        if (live.current) setBusy(true)
        apply(await profileApi<LessonPage>('learning-lesson-refresh', input))
      } catch (reason) { if (live.current) setError(errorText(reason)) } finally { if (live.current) setBusy(false) }
    })()
    // 助手做完总结或讲解以后回到窗口，这里跟着出现。
    const again = () => { profileApi<LessonPage>('learning-lesson', input).then(apply, () => {}) }
    window.addEventListener('focus', again)
    return () => { live.current = false; window.removeEventListener('focus', again) }
  }, [key])

  const download = async (kind: string) => {
    setFetching(old => [...old, kind]); setFailed(({ [kind]: _gone, ...rest }) => rest)
    try { apply(await profileApi<LessonPage>('learning-download', { ...input, kind })) }
    catch (reason) { if (live.current) setFailed(old => ({ ...old, [kind]: errorText(reason) })) }
    finally { if (live.current) setFetching(old => old.filter(item => item !== kind)) }
  }
  const reveal = async (kind: string) => {
    try { apply(await profileApi<LessonPage>('learning-reveal', { ...input, kind })) } catch (reason) {
      if (live.current) setFailed(old => ({ ...old, [kind]: errorText(reason) }))
      // 多半是文件被挪走了：重读一次，这一行就变回「下载」。
      profileApi<LessonPage>('learning-lesson', input).then(apply, () => {})
    }
  }
  const hand = (text: string) => { handToAssistant(text).catch((reason: unknown) => { if (live.current) setError(errorText(reason)) }) }

  const course = data?.course, lesson = data?.lesson
  // 交给助手时替用户写好的话。课程名、第几次照原样写，助手要拿它们去智云找；日期写具体的，过几天再看也不会错。
  const which = course && lesson ? `智云上《${course.title}》第 ${lesson.lesson} 次课（${[lesson.date ? dateText(new Date(`${lesson.date}T00:00:00`).getTime(), now) : '', course.teacher ? `${course.teacher}老师` : ''].filter(Boolean).join('，')}）` : ''
  const askSummary = () => { hand(`帮我总结${which}。先把这次课的课件和字幕下载到本机，没有字幕就下回放转写；通读以后按笔记模板写，存成这次课文件夹里的「总结.md」。写完告诉我有没有作业和要注意的事。`) }
  const askFilm = () => { hand(`用 learn 技能把${which}讲给我听。先把这次课的课件、课堂截图和字幕下载到本机当资料；讲解的主题目录叫 ${data?.topic ?? ''}，建在讲解目录的 lessons 里。`) }

  const down = (item: Resource) => item.busy || fetching.includes(item.kind)
  const film = data?.film ?? null
  return (
    <div className="campus-detail">
      <Crumb text={course?.title ?? title} onBack={onBack} />
      <div className="campus-detail-head" data-wrap="">
        <div className="campus-detail-main"><h1 className="campus-page-title">第 {number} 次</h1></div>
      </div>
      {error && <div className="campus-detail-notices"><Alert>{error}</Alert></div>}
      {data && lesson && (
        <dl className="campus-props">
          <div><dt>时间</dt><dd>{dayText(lesson.date, now)}{lesson.time ? ` ${lesson.time}` : ''}</dd></div>
          {course?.teacher && <div><dt>教师</dt><dd>{course.teacher}</dd></div>}
        </dl>
      )}
      {data && (
        <div className="campus-sections">
          <section className="campus-section" aria-label="资料">
            <div className="campus-titleline">
              <h2 className="campus-section-title">资料</h2>
              {data.resources.length > 0 && <span className="campus-count">{data.resources.length}</span>}
            </div>
            {data.resources.length > 0 ? (
              <ul className="campus-rows">
                {data.resources.map(item => (
                  <li className="campus-row" key={item.kind}>
                    <span className="campus-learn-kind">{item.label}</span>
                    <span className="campus-task-file">
                      {item.text}
                      {failed[item.kind] && <span className="campus-form-error">{failed[item.kind]}</span>}
                    </span>
                    {item.saved
                      ? <Button size="sm" variant="outline" icon={<IconFolderOpenOutlineRegular size={14} />} onClick={() => { void reveal(item.kind) }}>打开文件夹</Button>
                      : (
                        <Button size="sm" variant="outline" icon={<IconDownloadOutlineRegular size={14} />} disabled={down(item)} onClick={() => { void download(item.kind) }}>
                          {down(item) ? '下载中' : '下载'}
                        </Button>
                      )}
                  </li>
                ))}
              </ul>
            ) : <p className="campus-unset">{busy ? '第一次读这次课，要等一会儿。' : '这次课在智云上没有能下载的资料。'}</p>}
            {data.error && !busy && <Note text={failure('这次课的资料', data.fetchedAt, data.error, now)} />}
          </section>
          <section className="campus-section" aria-label="总结">
            <div className="campus-section-head">
              <h2 className="campus-section-title">总结</h2>
              {data.summary
                ? <Button size="sm" variant="outline" icon={<IconFolderOpenOutlineRegular size={14} />} onClick={() => { void reveal('summary') }}>打开文件夹</Button>
                : <Button size="sm" variant="outline" icon={<IconNewChatOutlineRegular size={14} />} onClick={askSummary}>让助手总结这次课</Button>}
            </div>
            {failed['summary'] && <p className="campus-form-error">{failed['summary']}</p>}
            {data.summary
              ? <div className="campus-markdown"><MarkdownText text={readable(data.summary.text)} labels={MARKDOWN_LABELS} /></div>
              : <p className="campus-unset">这次课还没有总结。</p>}
          </section>
          <section className="campus-section" aria-label="讲解">
            <div className="campus-section-head">
              <h2 className="campus-section-title">讲解</h2>
              {film?.state === 'done' && <Button size="sm" variant="outline" icon={<IconPlayOutlineRegular size={14} />} onClick={() => { play(film.id) }}>播放</Button>}
              {!film && <Button size="sm" variant="outline" icon={<IconNewChatOutlineRegular size={14} />} onClick={askFilm}>让助手讲这次课</Button>}
            </div>
            {film?.state === 'done' ? <p className="campus-learn-film">{film.title}</p> : <p className="campus-unset">{film ? '讲解正在做。' : '这次课还没有讲解。'}</p>}
          </section>
        </div>
      )}
    </div>
  )
}

export function LearningPage() {
  const { snapshot, busy, error } = useSyncExternalStore(subscribe, () => state)
  const now = useNow()
  /** 点开的课程和课次；空着是列表。 */
  const [view, setView] = useState<{ course: string, lesson: number | null } | null>(null)
  const page = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const refresh = () => { void visit() }
    refresh()
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener('focus', refresh) }
  }, [])
  useEffect(() => { page.current?.scrollTo({ top: 0 }) }, [view?.course, view?.lesson])

  const titleOf = (id: string) => snapshot?.courses.find(course => course.id === id)?.title ?? courses.get(id)?.course.title ?? ''
  if (view?.lesson != null) {
    return (
      <div className="campus-page campus-learn" ref={page}>
        <LessonView key={`${view.course}:${view.lesson}`} id={view.course} number={view.lesson} title={titleOf(view.course)} now={now}
          onBack={() => { setView({ course: view.course, lesson: null }) }} />
      </div>
    )
  }
  if (view) {
    return (
      <div className="campus-page campus-learn" ref={page}>
        <CourseView key={view.course} id={view.course} title={titleOf(view.course)} now={now}
          onBack={() => { setView(null); void visit() }} onOpen={(lesson) => { setView({ course: view.course, lesson }) }} />
      </div>
    )
  }

  const list = snapshot?.courses ?? [], products = snapshot?.products ?? []
  // 列表空着的时候说清楚是哪一种空：真的没有、还在第一次读、还是根本没法读（下面另有说明）。
  const empty = !snapshot || list.length > 0 || snapshot.state !== 'ready' ? ''
    : snapshot.fetchedAt ? '智云里没有你本学期的课程。' : busy ? '第一次读取，要等一会儿。' : ''
  const open = (item: Product) => {
    if (item.kind === 'film') play(item.id)
    else if (item.courseId && item.lesson) setView({ course: item.courseId, lesson: item.lesson })
  }
  return (
    <div className="campus-page campus-learn" ref={page}>
      <header className="campus-page-head">
        <h1 className="campus-page-title">学习</h1>
        <div className="campus-actions">
          {snapshot?.fetchedAt && <span className="campus-note">{agoText(Date.parse(snapshot.fetchedAt), now)}更新</span>}
          <button type="button" className="campus-refresh" aria-label="刷新" title="刷新" aria-busy={busy} onClick={() => { void visit(true) }}>
            <IconRefreshOutlineRegular size={16} />
          </button>
        </div>
      </header>
      {error && <Alert>{error}</Alert>}
      <div className="campus-affairs-columns">
        <section className="campus-section" aria-label="课程">
          <div className="campus-section-head">
            <div className="campus-titleline">
              <h2 className="campus-section-title">课程</h2>
              {list.length > 0 && <span className="campus-count">{list.length}</span>}
            </div>
          </div>
          {snapshot && (
            <div className="campus-notice-scroll">
              <Flow items={list} keyOf={course => course.id} label="课程">
                {course => <CourseRow course={course} now={now} onOpen={() => { setView({ course: course.id, lesson: null }) }} />}
              </Flow>
            </div>
          )}
          {empty && <p className="campus-task-empty">{empty}</p>}
          {snapshot?.state === 'off' && <Note text={`「${pluginTitle(snapshot.plugin)}」在插件页关着，这里不读智云的课程。`} action="去打开" onAction={() => { openPlugin(snapshot.plugin) }} />}
          {snapshot?.state === 'account' && <Note text={`「${pluginTitle(snapshot.plugin)}」还没填好，读不到智云的课程。`} action="去填写" onAction={() => { openPlugin(snapshot.plugin) }} />}
          {snapshot?.state === 'ready' && snapshot.error && !busy && <Note text={failure('智云', snapshot.fetchedAt, snapshot.error, now)} action="再试一次" onAction={() => { void visit(true) }} />}
        </section>
        <section className="campus-section" aria-label="总结和讲解">
          <div className="campus-section-head">
            <div className="campus-titleline">
              <h2 className="campus-section-title">总结和讲解</h2>
              {products.length > 0 && <span className="campus-count">{products.length}</span>}
            </div>
          </div>
          {snapshot && (
            <div className="campus-notice-scroll">
              <Flow items={products} keyOf={item => `${item.kind}:${item.state}:${item.id || item.title}`} label="总结和讲解">
                {item => <ProductRow item={item} now={now} onOpen={() => { open(item) }} />}
              </Flow>
            </div>
          )}
          {snapshot && products.length === 0 && <p className="campus-task-empty">还没有总结和讲解。</p>}
        </section>
      </div>
    </div>
  )
}
