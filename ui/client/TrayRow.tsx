/**
 * 设置 → 通用设置里的「关闭窗口时隐藏到系统托盘」一行。
 * 开关的值存在壳那边（desktop/tray.cjs），经 preload.cjs 给的 campusShell 读和改；不在壳里打开时没有 campusShell，这一行不登记。
 */
import { useEffect, useState } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'

const TITLE = '关闭窗口时隐藏到系统托盘'

export function TrayRow() {
  // 壳还没答复时不知道开没开，先不让点。
  const [on, setOn] = useState<boolean>()
  useEffect(() => { void window.campusShell?.closeToTray().then(setOn, () => {}) }, [])

  return (
    <div className="campus-setting-row">
      <div className="campus-setting-text">
        <div className="campus-setting-title">{TITLE}</div>
        <div className="campus-setting-desc">开启后关闭窗口只是把它藏起来，应用留在托盘里；不开则直接退出。</div>
      </div>
      <Switch
        checked={on === true}
        label={TITLE}
        disabled={on === undefined}
        onChange={(next) => { void window.campusShell?.setCloseToTray(next).then(setOn, () => {}) }}
      />
    </div>
  )
}
