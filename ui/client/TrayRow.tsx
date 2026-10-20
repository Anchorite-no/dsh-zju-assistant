/**
 * 设置 → 通用设置里的两行：「关闭窗口时隐藏到系统托盘」和「新消息时弹出系统通知」。
 * 开关的值存在壳那边（desktop/tray.cjs），经 preload.cjs 给的 campusShell 读和改；不在壳里打开时没有 campusShell，这两行不登记。
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

export function TrayRow() {
  // Windows 的通知被整个关掉时应用弹不出来，照实说去哪里打开。
  const [blocked, setBlocked] = useState(false)
  useEffect(() => { void window.campusShell?.notifyBlocked?.().then(setBlocked, () => {}) }, [])

  return (
    <>
      <ShellSwitch
        title="关闭窗口时隐藏到系统托盘"
        desc="开着时关闭窗口只是把它藏起来，应用留在托盘里，聊天监控、邮箱检查和定时任务照常运行；关掉则直接退出。"
        read={() => window.campusShell?.closeToTray()}
        write={on => window.campusShell?.setCloseToTray(on)}
      />
      <ShellSwitch
        title="新消息时弹出系统通知"
        desc="监控的聊天、邮箱、CC98 有新消息，或定时任务查到了结果时，在屏幕右下角弹一条通知，点它打开对应的地方。正看着本窗口时不弹。"
        warning={blocked ? 'Windows 的通知现在是关着的，应用弹不出来。到 Windows 设置 → 系统 → 通知，把「通知」打开。' : undefined}
        read={() => window.campusShell?.notify()}
        write={on => window.campusShell?.setNotify(on)}
      />
    </>
  )
}
