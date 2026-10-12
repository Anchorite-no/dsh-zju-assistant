/**
 * 把引擎自带的 Office 引擎交给助手用。它（@deepseek-ai/libreoffice-kit，引擎的依赖，已经在安装包里）能把
 * PDF、Word、PPT、Excel 的页面渲染成图，也能把 Office 文件转成 PDF；引擎自己只拿它给右边栏的预览用，
 * 给模型用的那套 office 技能在我们的组合里没有挂，助手原先并不知道有它。
 * 2026-10-12 起读文档分两条路：要文字用 zju 技能的 doc text（纯 JS，不用 Python）；要看页面长什么样用这里给的命令，
 * 渲染成图以后模型自己看。命令的位置随安装位置变，所以放在每次对话的上下文里，不写在 AGENT.md 里。
 * 它是助手自己起的命令，在沙箱里跑：默认的「工作区内修改」下实测能跑（输出要落在对话文件夹里），「仅可查看」下写不了输出。
 */
import { createRequire } from 'node:module'

/** 命令行入口的完整路径；这一份装包里没有它时是 undefined。 */
export function officeCli(resolve = createRequire(import.meta.url).resolve) {
  try { return resolve('@deepseek-ai/libreoffice-kit/cli') } catch { return undefined }
}

/** 放进模型上下文的那一段；没有这个引擎时为空。 */
export function officeText(cli = officeCli()) {
  if (!cli) return ''
  return [
    '看文件：PDF、Word、PPT、Excel 要文字时用 zju 技能的 `doc text`。要看版面、公式、图表，或者文件没有文字（扫描件、截图做的课件）时，把页面渲染成图，再用 read_image 看：',
    `node "${cli}" render --input "<文件的完整路径>" --output-dir "<一个还不存在的文件夹的完整路径>" --pages 1,2,3`,
    '页码从 1 起、用逗号分开（不认 1-3 这种写法），不写 --pages 是全部页；一次只渲染要看的几页。输出是那个文件夹里的 page-0001.png 这样的图。Word、Excel、PPT 转成 PDF 用同一个命令：convert --input "<文件>" --output "<结果.pdf>"。',
  ].join('\n')
}
