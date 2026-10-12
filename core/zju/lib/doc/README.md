# 文档转文字和 PDF 处理 内部实现

模型的基本能力：任何模块下载到的 PDF、Word、PPT、Excel 都用 `zju doc text` 转成文字，参数见 [命令总表](../../references/commands.md#doc)。模型不再自行安装解析库或编写下载脚本。

2026-10-12 整个改写过：原来取文字、转 PDF、取页、渲染都靠一套 Python 环境（`zju doc setup` 用 `python -m venv` 加联网装包），没有 Python 的电脑上整个模块用不了。现在不用 Python，命令从 8 条缩到 4 条：`text`、`find`、`pdf`、`pages`。

| 文件 | 职责 |
|---|---|
| `index.ts` | 取文字的总入口（按格式分派、Markdown 落盘）、链接下载与文件命名、输出路径的规矩 |
| `pdf.ts` | PDF 逐页取文字和按关键词找页（pdf.js）；合成、取页（pdf-lib）；图片转正和换格式（sharp） |
| `office.ts` | Word、Excel、PPT 转成 PDF 或纯文本，用应用自带的 Office 引擎 |
| `sniff.ts` | 按文件头判断真实格式 |
| `cli.ts` | 四条命令 |

## 依赖

- `pdfjs-dist`（Apache-2.0）、`pdf-lib`（MIT）：在本模块自己的 `node_modules` 里，随应用打包。装的时候带 `--omit=optional`，不要 pdf.js 的可选依赖 `@napi-rs/canvas`（那是渲染用的，取文字用不着；pdf.js 导入时会为此往 `console.warn` 写三句，`pdf.ts` 里压掉了）。没有用 `mupdf`：它是 AGPL。
- 应用自带的 Office 引擎 `@deepseek-ai/libreoffice-kit` 和图片库 `sharp`：都是引擎的依赖，在应用根目录的 `node_modules` 里，本模块按包名直接引用。脱离应用单独用这份 core 时没有它们，Office 文件和图片转 PDF 会报 `DEPENDENCY_MISSING`。
- 不再需要 Python、LibreOffice 的系统安装、`ZJU_DOC_PYTHON`、`ZJU_SOFFICE`。

## 提取

- 先按文件头判断真实格式（PDF、ZIP 内的 word/ppt/xl、ODF、OLE 复合文档、HTML），扩展名与内容不符时按真实格式处理并返回 `declaredFormat`。
- PDF 逐页取文字层。Word（doc、docx、odt）让引擎直接导出纯文本，算一页。Excel、PPT 先让引擎转成 PDF 再逐页取：PPT 一页就是一张幻灯片；Excel 是按打印出来的页分的，不再一个工作表一页，格子之间也没有竖线了。HTML 去掉脚本样式后按块换行；文本按 UTF-8 → GB18030 解码。
- 引擎不认 RTF、WPS（.wps、.et、.dps）：返回 `unsupported`，请用户另存为 docx / xlsx / pptx。
- 不做 OCR：扫描版 PDF、纯图片课件返回 `no_text`。这时由模型把页面渲染成图自己看（见下面「看页面长什么样」）。提取文字上限 16 MiB。
- 引擎转换时先把输入拷进一个临时文件夹、换成它认识的扩展名（它按扩展名认格式，原文件名可能带着错的），用完删掉。

## 链接下载

- `zdbk.zju.edu.cn` 用教务网会话（`openZdbk`），因为通知附件需要登录；其余 `*.zju.edu.cn` 与 `cc98.org` 经 WebVPN；其他主机直连。单个文件受 HttpClient 16 MiB 缓冲上限约束。
- 文件名取 `Content-Disposition`（`filename*` 优先，按 UTF-8 或 GB18030 还原字节），否则取 URL 末段；缺扩展名时按 Content-Type 补。
- 下载文件与全文 Markdown 存在 `data/output/doc/<链接或路径哈希>/`，结果内联前 2 万字，更长时标 `truncated`。

## PDF 处理（pdf / pages / find）

- `pdf`：图片、Word、PDF 按给出的顺序合成一份。图片用 sharp 按拍摄方向转正、透明的地方垫白；照片（JPEG、HEIC）存成 JPEG，截图这类存成 PNG，免得糊字。A4 模式把图等比缩放、居中放在真实的 A4 页上，图片最多留到 300 dpi 的 A4 那么大；原图模式按 100 dpi 算页面大小。Word 由引擎转成 PDF 再并进来。输入格式按文件头判断，图片以 sharp 能否读出格式为准。
- `pages`：「1,3-5」规则，按页序去重排序；越界、倒序或无法解析的片段直接报错，避免取错页。用 pdf-lib 的 `copyPages`，只带走这些页用到的字体和图片。
- `find`：逐页取文字，列出含关键词的页和前后约 90 字；扫描件没有文字层时 `textPages` 为 0。
- 输出默认 `data/output/doc/<输入哈希>/`：合成为「首个文件名.pdf」或「首个文件名等N个文件.pdf」，取页为「原名_第…页.pdf」；`--out` 指定时不覆盖已有文件。

## 看页面长什么样

原来的 `render`（整页渲染成 PNG）和 `images`（取 PDF 里嵌入的原图）去掉了，没有换个写法留在这里。应用自带的 Office 引擎有命令行，能把 PDF、Word、PPT、Excel 的任意页渲染成 PNG，应用在每次对话的上下文里把这条命令告诉助手（`ui/profile/office.mjs`），助手渲染以后自己看图。它在默认的沙箱里实测能跑。取嵌入原图没有对应的做法，要图就渲染整页。

## 验证

`core/zju/tests/doc.test.ts`（根目录 `npm run test:core`）：各种格式取文字、扩展名不对的、合成和取页、页码规则、找关键词。
