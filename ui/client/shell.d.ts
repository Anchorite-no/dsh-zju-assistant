/** 壳经 desktop/preload.cjs 给页面的东西。不在壳里打开（比如浏览器）时没有 campusShell。 */

/** 检查更新走到哪了（desktop/update.cjs）。available 只在 macOS 上有：新版本要自己去发布页下载。 */
interface CampusUpdateState {
  status: 'unavailable' | 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'no-access' | 'error'
  /** 现在装着的版本。 */
  current: string
  /** 正在下、已经下好或者发布页上有的那一版。 */
  version?: string
  /** 下到百分之几。 */
  percent?: number
  /** 没成功的原因。 */
  message?: string
}

/** macOS 上窗口的玻璃效果（desktop/glass.cjs）。 */
interface CampusGlassState {
  /** 设置里的开关。 */
  on: boolean
  /** 这次打开应用时开关的值；和 on 不一样，就是改过了、要重新打开应用才生效。 */
  started: boolean
  /** 这次打开时用的是哪一档：液态玻璃、毛玻璃、实底。 */
  mode: 'liquid' | 'vibrancy' | 'solid'
  /** 系统设置里打开了「减少透明度」（这时总是实底）。 */
  reduced: boolean
}

interface Window {
  campusShell?: {
    closeToTray: () => Promise<boolean>
    setCloseToTray: (on: boolean) => Promise<boolean>
    /** 新消息时弹不弹系统通知。 */
    notify: () => Promise<boolean>
    setNotify: (on: boolean) => Promise<boolean>
    /** Windows 的通知是不是被用户在系统设置里关掉了（关着时应用弹不出来）。 */
    notifyBlocked: () => Promise<boolean>
    update: () => Promise<CampusUpdateState | undefined>
    checkUpdate: () => Promise<CampusUpdateState | undefined>
    /** 装上下好的那一版并重启；macOS 上是打开新版本的发布页。 */
    installUpdate: () => Promise<void>
    /** 存下查更新时带上的 GitHub 令牌（可以不填；给空的是删掉），随后重新查一次。 */
    saveUpdateToken: (token: string) => Promise<CampusUpdateState | undefined>
    /** 托盘上点的那条消息要打开哪里：一个对话，或者侧栏上的一页；取一次就没了。 */
    takeOpen: () => Promise<{ sessionId?: string, panel?: string } | undefined>
    /** 跑在哪种系统上（win32、darwin）。 */
    platform: string
    /** 窗口的玻璃效果，macOS 才有，别的系统上是 undefined。 */
    glass: () => Promise<CampusGlassState | undefined>
    setGlass: (on: boolean) => Promise<boolean>
  }
}
