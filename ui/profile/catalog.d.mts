export type AccountId = 'zju' | 'webvpn' | 'pta' | 'lab' | 'chaoxing' | 'cc98' | 'tyys' | 'buddy'

export interface AccountField {
  /** accounts.json 里的键。 */
  key: string
  label: string
  placeholder?: string
  /** 可以留空。 */
  optional?: boolean
}

export interface Account {
  title: string
  /** 可以填好几个，再添加的在键名后加 _2、_3……。 */
  multiple?: boolean
  user?: AccountField
  secret: AccountField
}

export const ACCOUNTS: Readonly<Record<AccountId, Account>>

export const TRANSPORT: {
  readonly key: string
  readonly label: string
  readonly options: readonly { value: 'webvpn' | 'direct', label: string }[]
}

export interface AppPlugin {
  id: string
  title: string
  description: string
  art: 'account' | 'courses' | 'notices' | 'activities' | 'materials' | 'community' | 'wechat' | 'learn' | 'wechat-chat' | 'dingtalk' | 'mail'
  /** 基础能力，没有开关。 */
  base?: boolean
  /** 默认关着，要用户自己打开；没有这一项的默认开着。 */
  optIn?: boolean
  /** 这一项管的 ZJU Core 模块。 */
  modules?: readonly string[]
  /** 不是 ZJU Core 的功能背后是哪一样：公众号的 weread 技能，或者 Learning Core（learn 技能）。 */
  backend?: 'wechat' | 'learn' | 'wechat-chat' | 'dingtalk' | 'mail'
  /** 详情页里可以填写的账号。 */
  accounts: readonly AccountId[]
  /** 缺了就整项用不了的账号，列表上会提示。 */
  requires: readonly AccountId[]
  /** 详情页里逐条列的：接的是哪个系统，它能做什么。 */
  systems: readonly { name: string, does: string }[]
}

export interface CampusPlugin extends AppPlugin { modules: readonly string[] }

export const CAMPUS_PLUGINS: readonly CampusPlugin[]
export const LOCAL_PLUGINS: readonly AppPlugin[]
export const APP_PLUGINS: readonly AppPlugin[]
export const SHARED_MODULES: readonly string[]

export interface IdentityField {
  /** identity.json 的 values 里的键。 */
  key: string
  label: string
  /** ZJU Core 会读。 */
  core?: boolean
  /** 固定的几个选项，页面上用下拉菜单选。 */
  options?: readonly string[]
}

export const IDENTITY_FIELDS: readonly IdentityField[]

export function accountKeys(): string[]
export const MAX_ACCOUNTS: number
export function numberedKeys(id: AccountId, index: number): { user: string | undefined, secret: string }
export function isAccountKey(key: string): boolean
export function accountIndexes(values: Record<string, string>, id: AccountId): number[]
export function accountReady(values: Record<string, string>, id: AccountId): boolean
