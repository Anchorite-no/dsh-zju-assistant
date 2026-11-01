/**
 * 设置 → 通用设置里的两行：「关闭窗口时隐藏到系统托盘」和「新消息时弹出系统通知」；macOS 上再加一行「窗口的玻璃效果」。
 * 开关的值存在壳那边（desktop/tray.cjs、glass.cjs），经 preload.cjs 给的 campusShell 读和改；不在壳里打开时没有 campusShell，这几行不登记。
 * macOS 上托盘叫菜单栏，通知在右上角，说法跟着换。
 */
import { useEffect, useState } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'

function ShellSwitch({ title, desc, warning, read, write }: { title: string, desc: string, warning?: string, read: () => Promise<boolean> | undefined, write: (on: boolean) => Promise<boolean> | undefined }) {
  // 壳还没答复时不知道开没开，先不让点。
  const [on, setOn] = useState<boolean>()
  useEffect(() => { void read()?.then(setOn, () => {}) }, [])

  return (
    <div className="campus-setting-row">
      <div className="campus-setting-text">
        <div className="campus-setting-title">{title}</div>
        <div className="campus-setting-desc">{desc}</div>
        {on && warning && <div className="campus-setting-desc" role="status">{warning}</div>}
      </div>
      <Switch
        checked={on === true}
        label={title}
        disabled={on === undefined}
        onChange={(next) => { void write(next)?.then(setOn, () => {}) }}
      />
    </div>
  )
}

/** 这次打开时窗口后面垫的是什么。 */
function glassNow(glass: CampusGlassState): string {
  if (glass.mode === 'liquid') return '现在是液态玻璃。'
  if (glass.mode === 'vibrancy') return '现在是毛玻璃；液态玻璃要 macOS 26 或更新的系统。'
  return glass.reduced ? '系统设置里打开了「减少透明度」，现在是实底。' : '现在是实底。'
}

/**
 * 「窗口的玻璃效果」（desktop/glass.cjs）：左边栏透出窗口后面的东西。窗口透不透明只能在开窗口时定，所以改了要重新打开应用。
 * 液态玻璃没在每一版 macOS 上看过，哪台机器上看着不对，在这里关掉就回到实底。
 */
function GlassRow() {
  const [glass, setGlass] = useState<CampusGlassState>()
  useEffect(() => { void window.campusShell?.glass().then(setGlass, () => {}) }, [])
  if (!glass) return null

  return (
    <div className="campus-setting-row">
      <div className="campus-setting-text">
        <div className="campus-setting-title">窗口的玻璃效果</div>
        <div className="campus-setting-desc">左边栏透出窗口后面的桌面，像系统自带的应用那样。{glassNow(glass)}</div>
        {glass.on !== glass.started && <div className="campus-setting-desc" role="status">重新打开应用后生效。</div>}
      </div>
      <Switch
        checked={glass.on}
        label="窗口的玻璃效果"
        onChange={(next) => { void window.campusShell?.setGlass(next).then((on) => { setGlass({ ...glass, on }) }, () => {}) }}
      />
    </div>
  )
}

export function TrayRow() {
  // 系统的通知被整个关掉时应用弹不出来，照实说去哪里打开。
  const [blocked, setBlocked] = useState(false)
  useEffect(() => { void window.campusShell?.notifyBlocked?.().then(setBlocked, () => {}) }, [])
  const mac = window.campusShell?.platform === 'darwin'

  return (
    <>
      <ShellSwitch
        title={mac ? '关闭窗口时留在菜单栏' : '关闭窗口时隐藏到系统托盘'}
        desc={mac
          ? '开着时关闭窗口只是把它藏起来，应用留在菜单栏和程序坞里，聊天监控、邮箱检查和定时任务照常运行；关掉则直接退出。'
          : '开着时关闭窗口只是把它藏起来，应用留在托盘里，聊天监控、邮箱检查和定时任务照常运行；关掉则直接退出。'}
        read={() => window.campusShell?.closeToTray()}
        write={on => window.campusShell?.setCloseToTray(on)}
      />
      <ShellSwitch
        title="新消息时弹出系统通知"
        desc={`监控的聊天、邮箱、CC98 有新消息，或定时任务查到了结果时，在屏幕${mac ? '右上角' : '右下角'}弹一条通知，点它打开对应的地方。正看着本窗口时不弹。`}
        warning={!blocked ? undefined : mac
          ? 'macOS 现在不让应用弹通知。到 系统设置 → 通知，找到 CampusAgent，把「允许通知」打开。'
          : 'Windows 的通知现在是关着的，应用弹不出来。到 Windows 设置 → 系统 → 通知，把「通知」打开。'}
        read={() => window.campusShell?.notify()}
        write={on => window.campusShell?.setNotify(on)}
      />
      {mac && <GlassRow />}
    </>
  )
}
