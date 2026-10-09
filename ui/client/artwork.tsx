/**
 * 插件图标。通用工具直接用 DeepSeek 自己的：网页搜索是引擎的图形，其余三个是各插件包自带的 icon.svg。
 * 校园功能没有现成的，照同一种画法画：36×36 画布，图形占中间 20 来个单位，
 * 天蓝到宝蓝的渐变为主，配青、绿、紫，叠在上面的细节用白线。
 */
import { useId, useState, type ReactNode } from 'react'
import { PluginArtworkDefault, PluginArtworkSearch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AppPlugin } from '../profile/catalog.mjs'

export type CampusArt = AppPlugin['art']

/** 引擎图标用的几组渐变。 */
interface Paints { blue: string, teal: string, green: string }

const SHAPES: Record<CampusArt, (paint: Paints) => ReactNode> = {
  wechat: paint => (
    <>
      <path d="M8 9h14a5 5 0 0 1 5 5v4a5 5 0 0 1-5 5H15l-5 4v-4H8a5 5 0 0 1-5-5v-4a5 5 0 0 1 5-5Z" transform="translate(3 0) scale(.9)" fill={paint.green} />
      <path d="M14 15h8M14 19h5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="26" cy="25" r="4.5" fill={paint.blue} />
      <path d="M24.2 25h3.6M26 23.2v3.6" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  account: paint => (
    <>
      <path d="M9.5 27.8c0-4.5 3.8-7.5 8.5-7.5s8.5 3 8.5 7.5v.4h-17v-.4Z" fill={paint.blue} fillOpacity="0.8" />
      <circle cx="18" cy="13" r="4.6" fill={paint.blue} />
    </>
  ),
  courses: paint => (
    <>
      <rect x="10" y="7.5" width="16" height="21" rx="3.2" fill={paint.blue} fillOpacity="0.8" />
      <path d="M14 14h8M14 18h8M14 22h4.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  notices: paint => (
    <>
      <path d="M18 7.8c-3.7 0-6.7 3-6.7 6.7v3.8l-1.8 3.2c-.5.8.1 1.8 1 1.8h15c.9 0 1.5-1 1-1.8l-1.8-3.2v-3.8c0-3.7-3-6.7-6.7-6.7Z" fill={paint.teal} />
      <path d="M15.1 25.5h5.8a2.9 2.9 0 0 1-5.8 0Z" fill="#617BEB" />
    </>
  ),
  activities: paint => (
    <>
      <rect x="8.5" y="11" width="19" height="14" rx="7" stroke={paint.teal} strokeWidth="3" />
      <rect x="13.8" y="16.1" width="8.4" height="3.8" rx="1.9" fill="#658EFF" />
    </>
  ),
  materials: paint => (
    <>
      <path d="M8.5 10.8c3.1-1.2 6-1 8.6.8v15.2c-2.6-1.8-5.5-2-8.6-.8V10.8Z" fill={paint.blue} fillOpacity="0.8" />
      <path d="M27.5 10.8c-3.1-1.2-6-1-8.6.8v15.2c2.6-1.8 5.5-2 8.6-.8V10.8Z" fill={paint.green} fillOpacity="0.8" />
    </>
  ),
  community: paint => (
    <>
      <rect x="15" y="8" width="13.5" height="11" rx="4" fill="#A797FC" fillOpacity="0.8" />
      <path d="M12 14.5h8.5a4 4 0 0 1 4 4v2.5a4 4 0 0 1-4 4h-4.3L12.5 28v-3H12a4 4 0 0 1-4-4v-2.5a4 4 0 0 1 4-4Z" fill={paint.blue} />
    </>
  ),
}

export function CampusArtwork({ kind }: { kind: CampusArt }) {
  // 同一个图标会在页面上出现多次，渐变的 id 每处各用一份。
  const id = `campus_art_${useId().replaceAll(':', '')}`
  const stops = (name: string, from: string, to: string, x1: number, y1: number, x2: number, y2: number) => (
    <linearGradient id={`${id}${name}`} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits="userSpaceOnUse">
      <stop stopColor={from} />
      <stop offset="1" stopColor={to} />
    </linearGradient>
  )
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      {SHAPES[kind]({ blue: `url(#${id}b)`, teal: `url(#${id}t)`, green: `url(#${id}g)` })}
      <defs>
        {stops('b', '#7AC2FF', '#4A65E8', 18, 6, 18, 30)}
        {stops('t', '#52CED8', '#617BEB', 11, 8, 27, 27)}
        {stops('g', '#45E7A4', '#05909D', 18, 9, 18, 28)}
      </defs>
    </svg>
  )
}

/** 引擎里的插件包自带的图标；包没给或者图读不出来时用引擎的默认图形。 */
export function BundleArtwork({ src }: { src: string | undefined }) {
  const [failed, setFailed] = useState<string>()
  return src === undefined || src === failed
    ? <PluginArtworkDefault size={36} />
    : <img src={src} width={36} height={36} alt="" onError={() => { setFailed(src) }} />
}

export function SearchArtwork() {
  return <PluginArtworkSearch size={36} />
}
