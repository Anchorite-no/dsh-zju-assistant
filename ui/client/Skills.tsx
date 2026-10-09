/**
 * 插件页第三组「技能」用的数据和详情页。技能是助手学到的做法：一件校园事务经过多步探索才走通之后，
 * 它把最短的走法存下来，下次遇到同类问题直接加载（引擎侧见 ui/profile/learned.mjs）。
 * 用户在这里能看每个技能写了什么，不要的可以删。
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, IconTrashOutlineRegular, MarkdownText, Modal, PluginArtworkDefault } from '@deepseek-ai/dsh-client-ui-primitives'
import { errorText, profileApi } from './api.ts'
import { Alert, Crumb } from './controls.tsx'

export interface Skill { name: string, title: string, description: string, updatedAt: string }
interface SkillText extends Skill { body: string }

const MARKDOWN_LABELS = { code: { copyLabel: '复制', copiedLabel: '已复制' }, footnotes: '注释' }
/** 插件页的导航里，技能的编号前面带这个，和插件的编号分开。 */
const PREFIX = 'skill:'
export const skillId = (name: string) => `${PREFIX}${name}`
export const skillName = (id: string) => id.startsWith(PREFIX) ? id.slice(PREFIX.length) : undefined

/** 上一次读到的。再打开插件页时先照它画。 */
let last: Skill[] | null = null

/** 学到的技能的列表。助手随时可能存下新的，回到窗口时重读一次。 */
export function useSkills(): { skills: Skill[] | null, reload: () => Promise<void> } {
  const [skills, setSkills] = useState<Skill[] | null>(last)
  const reload = useCallback(async () => {
    try { last = await profileApi<Skill[]>('skills-list'); setSkills(last) } catch { /* 读不到时列表照旧，插件页别的部分不受影响 */ }
  }, [])
  useEffect(() => {
    void reload()
    const refresh = () => { void reload() }
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener('focus', refresh) }
  }, [reload])
  return { skills, reload }
}

/** 技能的图标：引擎给没有自己图标的插件用的那一个。 */
export function SkillArtwork() {
  return <PluginArtworkDefault size={36} />
}

/** 一个技能的详情：排法照插件详情页，图标在左、删除在右，下面是名字、什么时候用和全文。 */
export function SkillDetail({ name, onBack, onDeleted }: { name: string, onBack: () => void, onDeleted: () => void }) {
  const [skill, setSkill] = useState<SkillText | null>(null)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    profileApi<SkillText>('skill-read', { name }).then((value) => { if (live) setSkill(value) }, (reason) => { if (live) setError(errorText(reason)) })
    return () => { live = false }
  }, [name])

  const remove = async () => {
    setBusy(true); setError('')
    try { await profileApi('skill-delete', { name }); onDeleted() } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }

  return (
    <div className="campus-detail" data-plugin-detail={skillId(name)}>
      <Crumb text="插件" onBack={onBack} />
      <div className="campus-detail-head">
        <span className="campus-art" aria-hidden="true"><SkillArtwork /></span>
        {skill && <Button size="sm" variant="outline" disabled={busy} icon={<IconTrashOutlineRegular size={14} />} onClick={() => { setDeleting(true) }}>删除</Button>}
      </div>
      <div className="campus-detail-main">
        <h1 className="campus-page-title">{skill?.title ?? name}</h1>
        {skill && <p className="campus-detail-desc">{skill.description}</p>}
      </div>
      {error && <div className="campus-detail-notices"><Alert>{error}</Alert></div>}
      {skill && <div className="campus-sections"><div className="campus-markdown"><MarkdownText text={skill.body} labels={MARKDOWN_LABELS} /></div></div>}
      <Modal open={deleting} title="删除这个技能？" description="删除后助手不会再按它来做，找不回。" closeLabel="关闭" onClose={() => { setDeleting(false) }}
        footer={(
          <>
            <Button variant="outline" onClick={() => { setDeleting(false) }}>取消</Button>
            <Button className="campus-danger" disabled={busy} onClick={() => { setDeleting(false); void remove() }}>删除</Button>
          </>
        )} />
    </div>
  )
}
