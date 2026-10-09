/**
 * 不选文件夹直接对话，默认就是「对话」。引擎的每个会话都要落在某个工作区里，新对话页没有工作区时连输入框都不可用；
 * 这里让不选文件夹的对话各有一个应用自己建的文件夹（文档\CampusAgent\日期\时分，和 Codex 的做法一样），
 * 在界面上把所有不属于用户自己添加的工作区的会话归到一个叫「对话」的分组里，「新会话」默认开在这个分组。
 * 引擎第一次启动时自己建的「默认工作区」我们不用：登记过就取消登记，它里面的会话和文件都留着，会话改显示在「对话」里。
 *
 * 引擎没有给这件事留扩展点，做法是两处包装，引擎升级后都要对着 dsh-client-ui-workspace 重新核一遍：
 *   1. 工作区列表（ctx.workspaces.list）读出来时，前面多一个虚构的工作区「对话」，
 *      成员是所有不属于真实工作区的会话。引擎服务端不知道这个工作区。
 *   2. uiWorkspace 服务的三个方法：connectWorkspace 遇到「对话」时由我们找或新建会话，
 *      startSession 不带工作区时默认用「对话」，restoreSelection 没有可恢复的会话时也从「对话」开始。
 */
import type { Context } from '@deepseek-ai/cordis'
import { profileApi } from './api.ts'

/** 虚构的工作区的编号和名字。 */
export const CHATS_ID = 'campus-chats'
export const CHATS_TITLE = '对话'

interface SessionSummary { blank: boolean, cwd?: string }
interface SessionList { ids: readonly string[], byId: Record<string, SessionSummary | undefined> }
interface WorkspaceItem { workspaceId: string, path: string, title: string, sessionIds: readonly string[], createdAt: string, updatedAt: string }
interface WorkspaceList { items: readonly WorkspaceItem[], archivedSessionIds: readonly string[], [key: string]: unknown }
interface Store<T> { getSnapshot: () => T, subscribe: (listener: () => void) => () => void }
interface Sessions { list: Store<SessionList>, create: (request: { cwd: string, sessionId?: string }) => Promise<string> }
interface Workspaces { list: Store<WorkspaceList>, delete: (workspaceId: string) => Promise<unknown> }
interface UiWorkspace {
  startSession: (workspaceId?: string) => void
  connectWorkspace: (workspaceId: string) => Promise<string>
  restoreSelection: (workspaces: WorkspaceList, sessions: SessionList) => Promise<void>
  openSession: (sessionId: string) => void
  selection: Store<{ sessionId?: string, subagentAddress?: unknown }>
  /** 侧栏的显示状态；这里只用到展开、折叠某个分组。 */
  view?: { setGroupExpanded?: (workspaceId: string, expanded: boolean) => void }
}

/** 引擎自己建的默认工作区：目录名和标题都是写死的 default-workspace，用户改过名字的不算。 */
const engineDefault = (workspace: WorkspaceItem) =>
  workspace.title === 'default-workspace' && /[\\/]deepseek-harness[\\/]default-workspace$/i.test(workspace.path)

export function installFolderlessChats(ctx: Context): void {
  const services = ctx as unknown as { get: (name: string) => unknown }
  const ui = services.get('uiWorkspace') as UiWorkspace | undefined
  const sessions = services.get('sessions') as Sessions | undefined
  const workspaces = services.get('workspaces') as Workspaces | undefined
  if (!ui || !sessions || !workspaces) return
  // 这两个方法在引擎的列表对象上，里面用到 this，拿出来单独调用要绑回去。
  const store = workspaces.list
  const real = { getSnapshot: store.getSnapshot.bind(store), subscribe: store.subscribe.bind(store) }

  // 对话文件夹的总目录要问引擎侧；问到之前界面上还没有「对话」这个分组。
  let root = ''
  const listeners = new Set<() => void>()
  const located = profileApi<{ root: string }>('chat-root').then((value) => {
    root = value.root
    for (const listener of [...listeners]) listener()
  }).catch((reason: unknown) => { console.warn('campus-ui: 读不到对话文件夹的位置，新会话仍按工作区走', reason) })
  const inChats = (cwd: string | undefined) => root !== '' && !!cwd && cwd.toLowerCase().startsWith(root.toLowerCase())

  let cached: { base: WorkspaceList, list: SessionList, root: string, value: WorkspaceList } | undefined
  function withChats(): WorkspaceList {
    const base = real.getSnapshot(), list = sessions!.list.getSnapshot()
    if (root === '') return base
    if (cached && cached.base === base && cached.list === list && cached.root === root) return cached.value
    const owned = new Set(base.items.flatMap(item => item.sessionIds))
    const sessionIds = list.ids.filter(id => !owned.has(id))
    const chats: WorkspaceItem = { workspaceId: CHATS_ID, path: root, title: CHATS_TITLE, sessionIds, createdAt: '', updatedAt: '' }
    const value = { ...base, items: [chats, ...base.items] }
    cached = { base, list, root, value }
    return value
  }

  /** 「对话」里的一个空白会话：已经有一个没用过的就接着用，没有才新建文件夹。 */
  async function blankChat(): Promise<string> {
    const list = sessions!.list.getSnapshot(), registry = real.getSnapshot()
    const taken = new Set([...registry.items.flatMap(item => item.sessionIds), ...registry.archivedSessionIds])
    // 只接着用我们自己建的文件夹里的空白会话；别处留下的空白会话不动。
    const spare = list.ids.find(id => !!list.byId[id]?.blank && !taken.has(id) && inChats(list.byId[id]?.cwd))
    if (spare !== undefined) {
      // 带着原来的编号再建一次是引擎接着用空白会话的办法；被别处占着时就另开一个。
      try { return await sessions!.create({ cwd: list.byId[spare]!.cwd!, sessionId: spare }) } catch { /* 另开一个 */ }
    }
    const { path } = await profileApi<{ path: string }>('chat-folder')
    return sessions!.create({ cwd: path })
  }

  ctx.effect(() => {
    const { startSession, connectWorkspace, restoreSelection } = ui
    store.getSnapshot = withChats
    store.subscribe = (listener) => {
      const offWorkspaces = real.subscribe(listener), offSessions = sessions.list.subscribe(listener)
      listeners.add(listener)
      return () => { listeners.delete(listener); offWorkspaces(); offSessions() }
    }
    ui.connectWorkspace = workspaceId => workspaceId === CHATS_ID ? blankChat() : connectWorkspace.call(ui, workspaceId)
    ui.startSession = (workspaceId) => { startSession.call(ui, workspaceId ?? (root === '' ? undefined : CHATS_ID)) }
    ui.restoreSelection = async (registry, list) => {
      await located
      if (root === '') { await restoreSelection.call(ui, registry, list); return }
      // 引擎自建的默认工作区取消登记（只是不再列出来，目录、文件和会话都不删），它的会话随即归到「对话」。
      await Promise.all(real.getSnapshot().items.filter(engineDefault).map(workspace => workspaces.delete(workspace.workspaceId).catch((reason: unknown) => {
        console.warn('campus-ui: 没能取消登记引擎的默认工作区', reason)
      })))
      // 引擎只展开当前会话所在的分组。默认开在「对话」以后，用户自己添加的工作区就都是折叠的，
      // 看上去像里面的会话全没了，所以启动时把它们展开；之后用户可以自己折叠。
      for (const workspace of real.getSnapshot().items) ui.view?.setGroupExpanded?.(workspace.workspaceId, true)
      // 上次停在一个有内容的对话上就回到它；否则从「对话」里一个新的开始。
      const saved = ui.selection.getSnapshot()
      const summary = saved.sessionId === undefined ? undefined : list.byId[saved.sessionId]
      if (saved.subagentAddress !== undefined || (summary !== undefined && !summary.blank)) { await restoreSelection.call(ui, store.getSnapshot(), list); return }
      ui.openSession(await blankChat())
    }
    return () => {
      // 包装是挂在对象自己身上的，删掉就露出引擎原来的方法。
      for (const [target, names] of [[store, ['getSnapshot', 'subscribe']], [ui, ['startSession', 'connectWorkspace', 'restoreSelection']]] as const) {
        for (const name of names) Reflect.deleteProperty(target, name)
      }
    }
  }, 'campus-ui: folderless chats')
}
