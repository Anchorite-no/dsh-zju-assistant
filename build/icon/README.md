# 应用图标

打开的书上升起一颗星：品牌蓝底（#5A8DF5 → #2F5CC9，中间是应用的 #4176E6），校园橙的星（#F0700F）。

| 文件 | 用途 |
|---|---|
| `app-icon.svg` | 完整的一版，40 像素及以上用 |
| `app-icon-small.svg` | 简化的一版，32 像素及以下用：书和星放大，去掉小圆点 |
| `app-icon-mac.svg` | macOS 的一版：照系统的图标格，圆角方块缩在 1024 画布中间的 824 里，四周留出投影 |
| `out/app-icon-<尺寸>.png` | 16、20、24、32、40、48、64、128、256、512、1024 像素的透明 PNG（32 及以下是简化版） |
| `out/app-icon.ico` | Windows 图标，含 16–256 九个尺寸 |
| `out/app-icon-mac-1024.png` | macOS 图标，1024 像素 |

应用里用到它的地方：

- `ui/client/Brand.tsx` 的 `BrandMark`：侧栏左上角和新会话首页（同一份 SVG 写在组件里，32 像素及以下画简化版）
- `desktop/icon.ico`：主窗口和任务栏；`desktop/icon-32.png`：开发时托盘上的图标（装好的程序托盘用 exe 自己的图标）
- `build/icon.ico`：electron-builder 打包时嵌进 exe 和安装程序（默认就从 `build/` 取，不用改 package.json）
- `build/icon-mac.png`：打 Mac 版时 electron-builder 从它生成 .icns（package.json 的 build.mac.icon）；开发时程序坞上的图标也是它
- `desktop/icon-32.png`：macOS 菜单栏上的图标（当 16 点的二倍图用）

重新生成 PNG 和 ICO（在这个文件夹里）：

```bash
../../node_modules/electron/dist/electron.exe rasterize.cjs out
```

改了图标以后，把 `out/app-icon.ico` 拷到 `desktop/icon.ico` 和 `build/icon.ico`，`out/app-icon-32.png` 拷到 `desktop/icon-32.png`，`out/app-icon-mac-1024.png` 拷到 `build/icon-mac.png`，`Brand.tsx` 里的路径照两个 SVG 改。
