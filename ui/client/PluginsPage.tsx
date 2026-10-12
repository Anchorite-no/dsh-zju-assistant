/**
 * 插件页。结构照引擎自带的插件页：列表里一行一个插件（图标、名字、一句话、右边的开关），
 * 点进去是详情页。校园功能的开关存在档案服务里，通用工具的开关还是引擎的。
 * 第三组「技能」是助手学到的做法，没有开关，点进去看全文、可以删（Skills.tsx）。
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { BundleInfo, ChangeResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { Button, IconChevronRightOutlineRegular, IconPluginPinwheelOutlineRegular, Switch, Tag, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import { accountReady } from '../profile/catalog.mjs'
import { AccountForm } from './AccountSettings.tsx'
import { WechatSettings } from './WechatSettings.tsx'
import { LearnSettings } from './LearnSettings.tsx'
import { NoticeFilterSettings } from './NoticeFilterSettings.tsx'
import { errorText, profileApi, type AccountSnapshot } from './api.ts'
import { BundleArtwork, CampusArtwork, SearchArtwork } from './artwork.tsx'
import { Alert, Crumb } from './controls.tsx'
import { APP_PLUGINS, GENERAL_PLUGINS, type AppPlugin, type GeneralPlugin } from './pluginCatalog.ts'
import { SkillArtwork, SkillDetail, skillId, skillName, useSkills } from './Skills.tsx'

type Slots = 'plugins.item' | 'plugins.bundle.config' | 'plugins.bundle.activation' | 'plugins.row.config' | 'plugins.detail.actions' | 'plugins.detail.badge' | 'plugins.detail.section'

interface Face {
  navigation: { getSnapshot: () => string, subscribe: (listener: () => void) => () => void }
  select: (id: string) => void
  openPanel: (id: string) => void
  list: () => Promise<BundleInfo[]>
  setEnabled: (name: string, enabled: boolean) => Promise<ChangeResult>
  subscribe: (listener: () => void) => () => void
}

interface Loaded { bundles: BundleInfo[], account: AccountSnapshot, disabled: readonly string[] }

/** 上一次读到的状态。再打开这一页时先照它画，开关不会先空着再跳出来。 */
let lastLoaded: Loaded | null = null

const COLUMNS_KEY = 'campus.pluginColumns'

/** 列表排一列还是两列。窄到放不下两列时样式会自己收成一列。 */
function useColumns(): [1 | 2, (next: 1 | 2) => void] {
  const [columns, setColumns] = useState<1 | 2>(() => localStorage.getItem(COLUMNS_KEY) === '1' ? 1 : 2)
  return [columns, (next) => { setColumns(next); localStorage.setItem(COLUMNS_KEY, String(next)) }]
}

function ColumnsToggle({ columns, onChange }: { columns: 1 | 2, onChange: (next: 1 | 2) => void }) {
  const glyph = (path: string) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><path d={path} /></svg>
  )
  return (
    <div className="campus-columns-toggle" role="group" aria-label="排列方式">
      <button type="button" aria-pressed={columns === 1} aria-label="单列" title="单列" onClick={() => { onChange(1) }}>{glyph('M2.5 4h11M2.5 8h11M2.5 12h11')}</button>
      <button type="button" aria-pressed={columns === 2} aria-label="双列" title="双列" onClick={() => { onChange(2) }}>{glyph('M2.5 4h4M2.5 8h4M2.5 12h4M9.5 4h4M9.5 8h4M9.5 12h4')}</button>
    </div>
  )
}

/** 列表里的一行。整行都能点开详情，右边的开关保留自己的点击。 */
function PluginRow({ id, icon, title, description, off, tags, end, onOpen }: {
  id: string
  icon: ReactNode
  title: string
  description: string
  off: boolean
  tags?: ReactNode
  end?: ReactNode
  onOpen: () => void
}) {
  return (
    <li className="campus-plugin-row" data-plugin={id} data-state={off ? 'off' : 'on'}>
      <span className="campus-art" aria-hidden="true">{icon}</span>
      <div className="campus-plugin-main">
        <div className="campus-titleline">
          <button type="button" className="campus-plugin-open" aria-label={`打开${title}`} onClick={onOpen}>{title}</button>
          {tags}
        </div>
        <span className="campus-plugin-desc">{description}</span>
      </div>
      <div className="campus-plugin-end">{end}</div>
    </li>
  )
}

/** 详情页里的一行：左边一个名字，右边一个去别处的按钮。 */
function LinkRow({ title, action, disabled = false, onClick }: { title: string, action: string, disabled?: boolean, onClick: () => void }) {
  return (
    <div className="campus-linkrow">
      <span>{title}</span>
      <Button variant="outline" size="sm" disabled={disabled} onClick={onClick}>{action}</Button>
    </div>
  )
}

function PluginsPage(props: Face & PropsRenderSlots<Slots>) {
  const selected = useSyncExternalStore(props.navigation.subscribe, props.navigation.getSnapshot)
  const page = useRef<HTMLDivElement>(null)
  useEffect(() => { page.current?.scrollTo({ top: 0 }) }, [selected])

  const [data, setData] = useState<Loaded | null>(lastLoaded)
  // 正在保存的开关先按点下去的状态显示，只动这一个，别的开关不受影响。
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const saving = useRef(new Set<string>())
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [columns, setColumns] = useColumns()
  const { skills, reload: reloadSkills } = useSkills()

  const { list, subscribe } = props
  const load = useCallback(async () => {
    try {
      const [bundles, account, switches] = await Promise.all([
        list(), profileApi<AccountSnapshot>('account-read'), profileApi<{ disabled: string[] }>('plugins-read'),
      ])
      lastLoaded = { bundles, account, disabled: switches.disabled }
      setData(lastLoaded); setError('')
    } catch (err) { setError(errorText(err)) }
  }, [list])
  useEffect(() => {
    void load()
    const refresh = () => { void load() }
    // 账号文件可能在别处改过，回到窗口时重读一次。
    window.addEventListener('focus', refresh)
    const off = subscribe(refresh)
    return () => { window.removeEventListener('focus', refresh); off() }
  }, [load, subscribe])

  const open = (id: string) => { props.select(id); setNotice(''); setError('') }
  const bundleOf = (plugin: GeneralPlugin) => plugin.bundle ? data?.bundles.find(entry => entry.name === plugin.bundle) : undefined
  const generalOn = (plugin: GeneralPlugin) => !plugin.bundle || (pending[plugin.id] ?? !!bundleOf(plugin)?.enabled)
  // 还没读到状态时，默认关着的那一项先按关着画，别的按开着画。
  const campusOn = (plugin: AppPlugin) => plugin.base === true || (pending[plugin.id] ?? (data ? !data.disabled.includes(plugin.id) : plugin.optIn !== true))
  const missing = (plugin: AppPlugin) => !!data && campusOn(plugin) && plugin.requires.some(id => !accountReady(data.account.values, id))

  async function toggle(id: string, enabled: boolean, save: () => Promise<void>) {
    if (saving.current.has(id)) return
    saving.current.add(id)
    setPending(old => ({ ...old, [id]: enabled })); setError(''); setNotice('')
    try { await save() } catch (err) { setError(errorText(err)) }
    saving.current.delete(id)
    setPending(({ [id]: _done, ...rest }) => rest)
  }
  const setCampus = (plugin: AppPlugin, enabled: boolean) => toggle(plugin.id, enabled, async () => {
    const { disabled } = await profileApi<{ disabled: string[] }>('plugins-set', { id: plugin.id, enabled })
    lastLoaded = lastLoaded && { ...lastLoaded, disabled }
    setData(old => old && { ...old, disabled })
  })
  const setGeneral = (plugin: GeneralPlugin, enabled: boolean) => toggle(plugin.id, enabled, async () => {
    const result = await props.setEnabled(plugin.bundle, enabled)
    if (result.application === 'failed' || result.application === 'overridden') throw new Error(result.error?.diagnostic || '开关没有生效，请再试一次。')
    if (result.application === 'restart-required') setNotice('已保存，重新打开应用后生效')
    await load()
  })

  // 第一次还没读到状态时不画开关，免得先画成开着、读完又跳成关着。
  const campusSwitch = (plugin: AppPlugin) => plugin.base || !data ? undefined : (
    <Switch label={`启用${plugin.title}`} checked={campusOn(plugin)} onChange={(value) => { void setCampus(plugin, value) }} />
  )
  const generalSwitch = (plugin: GeneralPlugin) => {
    const bundle = bundleOf(plugin)
    if (!plugin.bundle || !data) return undefined
    return <Switch label={`启用${plugin.title}`} checked={generalOn(plugin)} disabled={!bundle || !!bundle.readOnlyReason} onChange={(value) => { void setGeneral(plugin, value) }} />
  }
  const arrow = <IconChevronRightOutlineRegular size={16} className="campus-plugin-arrow" />
  const campusIcon = (plugin: AppPlugin) => <CampusArtwork kind={plugin.art} />
  const generalIcon = (plugin: GeneralPlugin) => plugin.bundle ? <BundleArtwork src={bundleOf(plugin)?.meta?.icon} /> : <SearchArtwork />
  const campusTags = (plugin: AppPlugin) => missing(plugin) ? <Tag tone="warning">{plugin.base ? '待填写' : '待填账号'}</Tag> : null
  const generalTags = (plugin: GeneralPlugin) => bundleOf(plugin)?.error ? <Tag tone="danger">加载出错</Tag> : null

  // 开关改完要重开应用才生效时，在窗口顶上提示一下。
  const restartToast = notice ? <Toast text={notice} onDone={() => { setNotice('') }} /> : null

  const campus = APP_PLUGINS.find(plugin => plugin.id === selected)
  // 引擎别处跳过来时带的是包名。
  const general = GENERAL_PLUGINS.find(plugin => plugin.id === selected || (plugin.bundle !== '' && plugin.bundle === selected))

  const skill = skillName(selected)
  if (skill !== undefined) {
    return (
      <div className="campus-page" ref={page}>
        <SkillDetail key={skill} name={skill} onBack={() => { open('') }}
          onDeleted={() => { void reloadSkills(); open(''); setNotice('已删除') }} />
      </div>
    )
  }

  if (campus || general) {
    const plugin = (campus ?? general)!
    const bundle = general ? bundleOf(general) : undefined
    const on = campus ? campusOn(campus) : generalOn(general!)
    return (
      <div className="campus-page" ref={page}>
        <div className="campus-detail" key={plugin.id} data-plugin-detail={plugin.id}>
          <Crumb text="插件" onBack={() => { open('') }} />
          <div className="campus-detail-head">
            <span className="campus-art" aria-hidden="true">{campus ? campusIcon(campus) : generalIcon(general!)}</span>
            {campus ? campusSwitch(campus) : generalSwitch(general!)}
          </div>
          <div className="campus-detail-main">
            <div className="campus-titleline">
              <h1 className="campus-page-title">{plugin.title}</h1>
              {campus ? campusTags(campus) : generalTags(general!)}
            </div>
            <p className="campus-detail-desc">{plugin.description}</p>
          </div>
          {(error || bundle?.error) && (
            <div className="campus-detail-notices">
              {error && <Alert>{error}</Alert>}
              {bundle?.error && <Alert>{bundle.error.diagnostic || '这个插件没有加载成功，重新打开应用后再试。'}</Alert>}
            </div>
          )}
          <div className="campus-sections">
            {campus && campus.systems.length > 0 && (
              <dl className="campus-systems">
                {campus.systems.map(system => <div key={system.name}><dt>{system.name}</dt><dd>{system.does}</dd></div>)}
              </dl>
            )}
            {campus && campus.accounts.length > 0 && (
              <AccountForm accounts={campus.accounts} onSaved={(account) => {
                lastLoaded = lastLoaded && { ...lastLoaded, account }
                setData(old => old && { ...old, account })
              }} />
            )}
            {campus?.id === 'campus.notices' && on && <NoticeFilterSettings />}
            {campus?.id === 'campus.notices' && <LinkRow title="定时检查新通知" action="自动化任务" onClick={() => { open('automation') }} />}
            {campus?.backend === 'wechat' && on && <WechatSettings />}
            {campus?.backend === 'learn' && on && <LearnSettings />}
            {general?.id === 'web-search' && (
              <section className="campus-section" data-plugin-config>
                {props.renderSlot('plugins.item', { view: 'page' }, { only: 'web-search' })}
              </section>
            )}
            {general?.id === 'automation' && <LinkRow title="任务列表" action="打开任务页" disabled={!on} onClick={() => { props.openPanel('schedules') }} />}
            {general?.id === 'auto-review' && <p className="campus-text">打开后，在对话的权限选项里选「自动审查」。</p>}
            {general?.id === 'voice' && on && (
              <section className="campus-section" data-plugin-config>
                {props.renderSlot('plugins.bundle.config', { view: 'page' }, { entryKey: general.bundle })}
              </section>
            )}
          </div>
        </div>
        {restartToast}
      </div>
    )
  }

  return (
    <div className="campus-page" ref={page}>
      <header className="campus-page-head">
        <h1 className="campus-page-title">插件</h1>
        <ColumnsToggle columns={columns} onChange={setColumns} />
      </header>
      {error && <Alert>{error}<Button size="sm" variant="outline" onClick={() => { void load() }}>重试</Button></Alert>}
      {restartToast}
      <section className="campus-group" aria-label="校园功能">
        <div className="campus-group-head"><h2 className="campus-group-title">校园功能</h2><span className="campus-count">{APP_PLUGINS.length}</span></div>
        <ul className="campus-plugin-list" data-columns={columns}>
          {APP_PLUGINS.map(plugin => (
            <PluginRow key={plugin.id} id={plugin.id} icon={campusIcon(plugin)} title={plugin.title} description={plugin.description}
              off={!campusOn(plugin)} tags={campusTags(plugin)} end={plugin.base ? arrow : campusSwitch(plugin)} onOpen={() => { open(plugin.id) }} />
          ))}
        </ul>
      </section>
      <section className="campus-group" aria-label="通用工具">
        <div className="campus-group-head"><h2 className="campus-group-title">通用工具</h2><span className="campus-count">{GENERAL_PLUGINS.length}</span></div>
        <ul className="campus-plugin-list" data-columns={columns}>
          {GENERAL_PLUGINS.map(plugin => (
            <PluginRow key={plugin.id} id={plugin.id} icon={generalIcon(plugin)} title={plugin.title} description={plugin.description}
              off={!!data && !generalOn(plugin)} tags={generalTags(plugin)} end={plugin.bundle ? generalSwitch(plugin) : arrow} onOpen={() => { open(plugin.id) }} />
          ))}
        </ul>
      </section>
      {skills && (
        <section className="campus-group" aria-label="技能">
          <div className="campus-group-head"><h2 className="campus-group-title">技能</h2><span className="campus-count">{skills.length}</span></div>
          {skills.length === 0
            ? <p className="campus-plugin-none">助手还没有学到技能</p>
            : (
              <ul className="campus-plugin-list" data-columns={columns}>
                {skills.map(item => (
                  <PluginRow key={item.name} id={skillId(item.name)} icon={<SkillArtwork />} title={item.title} description={item.description}
                    off={false} end={arrow} onOpen={() => { open(skillId(item.name)) }} />
                ))}
              </ul>
            )}
        </section>
      )}
    </div>
  )
}

/** 别的页面要跳到某个插件的详情页（比如去填账号）时用。插件页登记好以后才会真的跳。 */
let jump: (id: string) => void = () => {}
export function openPlugin(id: string): void { jump(id) }

/** 登记插件页和侧栏入口，同时接住引擎别处「打开某个插件」的跳转。 */
export function installPluginsPage(ctx: Context): void {
  const panelId = 'plugins' as MainPanelId
  let selected = ''
  const listeners = new Set<() => void>()
  const select = (id: string) => { selected = id; for (const listener of listeners) listener() }
  const face: Face = {
    navigation: { getSnapshot: () => selected, subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } } },
    select,
    openPanel: (id) => { ctx.layout.selectPanel(id as MainPanelId) },
    list: async () => { const response = await ctx.remote.pluginManager.listBundles(); if (!response.ok) throw response.error; return response.value },
    setEnabled: async (name, enabled) => { const response = await ctx.remote.pluginManager.setBundleEnabled(name, enabled); if (!response.ok) throw response.error; return response.value },
    subscribe: (listener) => {
      const off = [ctx.remote.$on('plugin-manager/changed', listener), ctx.on('connection/reset', listener)]
      return () => { for (const dispose of off) dispose() }
    },
  }
  ctx.effect(() => {
    jump = (id) => { select(id); ctx.layout.selectPanel(panelId) }
    return () => { jump = () => {} }
  }, 'campus-ui: open a plugin from another page')
  ctx.effect(() => ctx.reflect.provide('pluginNavigation', { openBundle: (name: string) => { select(name); ctx.layout.selectPanel(panelId) } }), 'campus-ui: plugin navigation')
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: panelId,
    inject: () => face,
    children: {
      'plugins.item': { kind: 'list', scope: 'root' },
      'plugins.bundle.config': { kind: 'keyed', scope: 'root' },
      'plugins.bundle.activation': { kind: 'keyed', scope: 'root' },
      'plugins.row.config': { kind: 'keyed', scope: 'root' },
      'plugins.detail.actions': { kind: 'list', scope: 'root' },
      'plugins.detail.badge': { kind: 'list', scope: 'root' },
      'plugins.detail.section': { kind: 'list', scope: 'root' },
    },
  }, PluginsPage))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: panelId, order: 0, label: '插件' }, ({ size }) => <IconPluginPinwheelOutlineRegular size={size} />))
}
