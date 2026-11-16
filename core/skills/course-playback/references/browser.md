# 浏览器诊断

使用当前助手已有的浏览器工具，沿用用户选择的浏览器。先看页面；登录、验证码、活动期限与插件开关沿用 zju-campus 的规则。

## 控件与采样

2026-11-16 的页面结构供定位失败时参考，每次仍以当前 DOM 为准：

- 主页面的 `video.vjs-tech` 位于 `.video-js` 中，自定义播放按钮在外层 `.mvp-child-video-player`；输入保护监听外层才能覆盖按钮。
- 点「倍速」或当前倍速后选 `2.0x`，再读实际 playbackRate。目录项可能没有 href，按 DOM 快照中的唯一标题定位，不只依赖 link 角色。
- 切课可能不改变 URL，应重读标题与 video 节点。「下一个」是含 CSS 图标的按钮，按文字、可见性、启用状态与唯一性确认。

只读 DOM 采样，不带账号、课程编号、网页地址或媒体源；多视频时先明确目标：

```javascript
() => [...document.querySelectorAll('video')]
  .filter(v => v.getClientRects().length)
  .map(v => ({
    atMs: Date.now(), paused: v.paused, ended: v.ended,
    currentTime: v.currentTime,
    duration: Number.isFinite(v.duration) ? v.duration : null,
    playbackRate: v.playbackRate, readyState: v.readyState,
    networkState: v.networkState, errorCode: v.error?.code ?? null
  }))
```

正常调速无需保存 JSON。排障时可将同一个视频的实际样本保存为 `{ "samples": [样本1, 样本2] }`，离线运行：

```text
node <本工作流目录>/scripts/diagnose.mjs --file <样本.json>
```

只在确实观察到用户操作或相关事件时补 `recentInput: true` 或 `event: "waiting" / "stalled" / "play-blocked"`。未知字段省略。采样应按实际时间先后排列，切课、跳转或拖动进度前后的样本分别处理。不要伪造等待时间或长期轮询。

## 解释

- 位置增加表明正在推进，不证明平台完成度已更新。
- 暂停在末尾附近可能只是恢复历史位置；近期操作后暂停应保留。
- 至少 12 秒未推进，并伴随低 readyState 或 waiting/stalled，才有缓冲停滞证据；不能由此确定是网络还是 CDN。
- 媒体错误码 2、3、4 分别为网络、解码、不支持资源；play-blocked 表示播放请求被拒，可能需要手动点击播放。
- 可查看少量相关 console 错误或 OCS 终端状态。静态截图、网站脚本异常与一次成功播放均不能证明中断根因或后续联播可靠性。

此命令只分析文件，不登录、不联网、不控制播放器、不恢复播放，也不改变观看记录。
