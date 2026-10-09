# 界面和讲解画面用的字体

2026-10-04 用户定：选最接近苹方的。苹方是苹果的授权字体，不能拿到 Windows 上用，所以用这一对代替：

- `harmonyos-sans-sc/`：HarmonyOS Sans SC 的常规、中等、粗体三个字重，中文和日文假名用它。华为与汉仪合作的字体，按华为的 HarmonyOS Sans Fonts License Agreement 免费使用。
  取自 npm 包 `harmonyos-sans` 1.0.0 里的官方字体包（经 registry.npmmirror.com 下载）。
- `inter/`：Inter 的可变字重拉丁子集，英文和数字用它，观感接近苹果的 SF。SIL OFL 1.1，许可证见同目录的 LICENSE。
  取自 npm 包 `@fontsource-variable/inter` 5.3.0。

这些文件不进 Git。朗读器通过配音服务的 `/fonts/` 把它们提供给界面和讲解画面，
在 CSS 里合成一个叫 `Learn Sans` 的字体。换字体时改 `app.html` 里的 `FONT_CSS`。

2026-10-04 用户让把 HarmonyOS Sans SC 的三个 ttf 装进了系统，只装给当前用户，没有动系统目录：
文件复制到 `%LOCALAPPDATA%\Microsoft\Windows\Fonts\`，并在注册表
`HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts` 下登记了三项（名字以 HarmonyOS Sans SC 开头）。
这样讲解的 HTML 不经朗读器、单独打开时也能用上它。要卸载，在"设置 → 个性化 → 字体"里找到 HarmonyOS Sans SC 点卸载。
同一天用户又让把 Inter 也装上。Inter 原本是网页字体格式（woff2），Windows 装不了，所以先用 fontTools 原样转成
`inter/Inter-Latin-Variable.ttf`（只换了封装，字形没动），再用同样的办法装给当前用户，注册表里的名字是 `Inter (TrueType)`。
装上的这份有两点要知道：

- 它在系统里的名字就叫 Inter，但只是拉丁子集，共 230 个字符，没有 `≤`、`→` 这类符号（这些由 HarmonyOS Sans SC 补上）。
  别的程序或网页按名字要 Inter 时也会用到它，缺的字符会落到别的字体上。
- 它是可变字重字体。浏览器里按名字能找到，400、500、700 三个字重都确认过；但 Windows 的旧式字体列表里看不到它。
  要卸载，先在"设置 → 个性化 → 字体"里找 Inter；找不到就删掉 `%LOCALAPPDATA%\Microsoft\Windows\Fonts\Inter-Latin-Variable.ttf`
  和上面那个注册表位置里的 `Inter (TrueType)` 一项。
