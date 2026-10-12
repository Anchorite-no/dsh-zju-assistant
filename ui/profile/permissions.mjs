/**
 * 对话的权限范围。引擎的「工作区内修改」只放行会话自己的文件夹（对话里是 文档\CampusAgent\日期\时分），
 * 我们的东西却要往别处写：校园命令把登录状态和缓存存在应用数据里的 zju 目录，下载的课件、转写、讲解落在
 * 文档\CampusAgent 下面各自的文件夹。照引擎原样，对话里第一条校园命令就写不进登录状态
 * （2026-10-12 的一次真实对话：查 CC98，EPERM，模型转头去修文件夹权限）。
 *
 * 所以对话有自己的范围，两处：
 *   1. 对话（文件夹在 文档\CampusAgent 下面的会话）里，「工作区内修改」能写的是整个 文档\CampusAgent，
 *      不只是这一次对话的文件夹。相对路径照旧从对话自己的文件夹算，只是围栏放宽了。
 *   2. 应用自带的校园命令（TRUSTED_SCRIPTS）单独一条执行时不进沙箱，「仅可查看」下也一样：它们要读写应用数据、
 *      起子进程（ffmpeg、转写）、连壳开的管道（公众号）和引擎开的管道（场馆验证码问模型，vision.mjs），这些在引擎的 Windows 沙箱里做不了。
 *      认的是整条命令的样子，见 trustedCommand；后面接了管道、分号、重定向的不算，仍在沙箱里跑。
 *
 * 没有做的：让沙箱里的命令也能写校园命令的数据目录（把工作区的写入凭据登记到那个目录上）。试过，凭据登记得上，
 * 但商店版的 PowerShell 在沙箱里连 AppData 都看不到（2026-10-12 在本机实测：目录明明在，Get-Content 说路径不存在），
 * 登记了也没用。所以接了管道的校园命令在受限的模式下就是会失败，系统提示里告诉助手单独一条执行。
 *
 * 引擎没有给这两件事留扩展点（策略里一个会话只有一个可写的根，而且写文件的工具拿这个根当相对路径的起点，
 * 所以不能直接改策略），做法是包住两个服务的方法：ctx.shell.resolve（每条 pwsh 命令执行前定策略的地方）
 * 和 ctx.fs.checkedTarget（写文件、改文件的工具过围栏的地方）。
 * 引擎升级后对着 dsh-pwsh-sandbox、dsh-fs-sandbox 重新核一遍。
 */
import path from 'node:path'
import { CORE_ROOT } from './skills.mjs'

/**
 * 可以不进沙箱的命令入口，相对 core/。只收代码固定、参数只是数据的那两个。
 * learn 的引擎脚本（build、lint、shots）不在里面：它们会执行讲解里的脚本，那是助手自己写的代码，
 * 不受限地跑要用户点头（引擎的做法：这一条命令申请更宽的权限，弹出来问一次）。
 */
export const TRUSTED_SCRIPTS = ['zju/scripts/zju.ts', 'weread/scripts/weread.ts']

const fold = text => process.platform === 'win32' ? text.toLowerCase() : text

/** target 是不是 root 自己或者在它里面。 */
export function inside(target, root) {
  if (!target || !root) return false
  const relative = path.relative(fold(path.resolve(root)), fold(path.resolve(target)))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/** 只把错误输出并进来、或者丢掉输出的重定向，放在命令最后不改变它做的事。 */
const HARMLESS_TAIL = new Set(['2>&1', '*>&1', '2>$null', '*>$null'])
/** 不在引号里出现就说明这不是一条只有字面量的命令：分号、管道、重定向、括号、变量、转义。 */
const ACTIVE = new Set([';', '|', '&', '<', '>', '(', ')', '{', '}', '$', '`'])
/** PowerShell 把这些弯引号也当引号：出现了就不认，免得我们以为还在引号里、它已经出来了。 */
const CURLY_QUOTES = /[‘’‚‛“”„]/

/**
 * 把一条 PowerShell 命令拆成词，只认每个词都是字面量的：裸词、单引号串、不含变量的双引号串。
 * 有管道、分号、重定向、子表达式、变量、换行的都拆不出来，返回 undefined。结尾允许一个 2>&1 这样的重定向。
 */
export function literalWords(command) {
  const text = typeof command === 'string' ? command.trim() : ''
  if (!text || /[\r\n]/.test(text) || CURLY_QUOTES.test(text)) return undefined
  const words = []
  let at = 0
  while (at < text.length) {
    if (/\s/.test(text[at])) { at++; continue }
    if (words.length > 0 && HARMLESS_TAIL.has(text.slice(at))) break
    let word = '', first = true
    while (at < text.length && !/\s/.test(text[at])) {
      const char = text[at]
      if (char === "'" || char === '"') {
        // 引号里连写两个是一个引号本身；双引号里的 $ 会被展开，不认。
        for (at++; ; at++) {
          if (at >= text.length) return undefined
          if (text[at] === char) {
            if (text[at + 1] !== char) break
            at++
          } else if (char === '"' && (text[at] === '$' || text[at] === '`')) return undefined
          word += text[at]
        }
        at++
      } else {
        // 词开头的 @ 是展开变量或者多行字符串，# 是注释。
        if (ACTIVE.has(char) || (first && (char === '@' || char === '#'))) return undefined
        word += char
        at++
      }
      first = false
    }
    words.push(word)
  }
  return words
}

/**
 * 这条命令是不是「单独一条应用自带的校园命令」：node 后面直接跟 TRUSTED_SCRIPTS 里的脚本，其余都是字面量的参数。
 * node 和脚本之间不许有选项（-e、--require 能带进别的代码）；脚本的相对路径从这条命令的工作目录算。
 */
export function trustedCommand(command, workdir, coreRoot = CORE_ROOT) {
  const words = literalWords(command)
  if (!words || words.length < 2 || !/^node(\.exe)?$/i.test(words[0])) return false
  const script = fold(path.resolve(workdir || '.', words[1]))
  return TRUSTED_SCRIPTS.some(entry => fold(path.resolve(coreRoot, entry)) === script)
}

/** chats 是对话文件夹（chats.mjs）。返回的 command 和 file 就是包在引擎方法外面的那一层，测试直接拿来用。 */
export function createScope({ chats, coreRoot = CORE_ROOT }) {
  // 对话文件夹的总目录要问系统（「文档」可能被挪走），问到之前对话照引擎原样只放行自己的文件夹。
  let chatRoot = ''
  const located = Promise.resolve(chats.root()).then((root) => { chatRoot = root }, () => {})

  /** 对话里把可写的根换成整个 文档\CampusAgent；别的会话、别的模式原样。 */
  const widen = policy => policy?.mode === 'workspace-write' && chatRoot !== '' && inside(policy.workspaceRoot, chatRoot) && fold(path.resolve(policy.workspaceRoot)) !== fold(path.resolve(chatRoot))
    ? { ...policy, workspaceRoot: chatRoot } : policy

  return {
    located,
    chatRoot: () => chatRoot,
    /** 一条 pwsh 命令定好的执行说明（引擎 shell.resolve 的结果）：校园命令不进沙箱，对话里放宽可写的根。 */
    command(spec) {
      const policy = spec?.sandboxPolicy
      if (!policy || policy.mode === 'danger-full-access') return spec
      if (trustedCommand(spec.command, spec.workdir, coreRoot)) return { ...spec, sandboxPolicy: { ...policy, mode: 'danger-full-access' } }
      const wide = widen(policy)
      return wide === policy ? spec : { ...spec, sandboxPolicy: wide }
    },
    /** 写文件、改文件的工具过围栏时用的策略。 */
    file: widen,
    /** 给系统提示用：这个会话是不是对话、现在是不是「工作区内修改」。是的话返回能写的根。 */
    scopeOf(policy) {
      const wide = widen(policy)
      return wide === policy ? undefined : wide.workspaceRoot
    },
  }
}

/** 接到引擎上。假的 ctx（host.test.mjs）没有 inject 时什么都不做。 */
export function installPermissions(ctx, { chats }) {
  if (typeof ctx.inject !== 'function') return
  const scope = createScope({ chats })

  // 包装是挂在服务对象自己身上的，删掉就露出引擎原来的方法（界面那边的 chats.ts 是同一种写法）。
  const wrap = (service, name, make) => {
    const original = service[name]
    if (typeof original !== 'function') { ctx.logger?.warn?.(`campus: 引擎的 ${name} 不在了，对话的权限范围没有接上`); return () => {} }
    service[name] = make(original)
    return () => { Reflect.deleteProperty(service, name) }
  }

  ctx.inject(['shell'], (inner) => {
    inner.effect(() => wrap(inner.shell, 'resolve', original => function (request) {
      return scope.command(original.call(this, request))
    }), 'campus: chat permission scope (pwsh)')
  })
  ctx.inject(['fs', 'sandboxPolicy'], (inner) => {
    inner.effect(() => wrap(inner.fs, 'checkedTarget', original => function (target, sandboxPolicy) {
      // 引擎在没给策略时自己取部署默认的那一份；这里先取出来，才知道要不要放宽。
      return original.call(this, target, scope.file(sandboxPolicy ?? inner.sandboxPolicy.resolve()))
    }), 'campus: chat permission scope (files)')
    // 引擎那一句写的是「只能改这次对话的文件夹」，对话里补一句实际的范围；排在它后面。
    inner.systemPrompt?.context({
      name: 'campus-scope',
      order: (inner.systemPrompt.getContextOrder?.('SANDBOX_POLICY') ?? 0) + 1,
      text: (context) => {
        const session = context?.agent?.session
        if (session === undefined) return ''
        const policy = inner.sandboxPolicy.resolve({ session })
        if (policy.mode === 'danger-full-access') return ''
        const root = scope.scopeOf(policy)
        return [
          root ? `在这个应用里，上面说的可写范围比那一句写的大：整个 ${JSON.stringify(root)} 都能写（各次对话的文件夹、课程、讲解、转写）。` : '',
          '应用自带的校园命令（zju、weread 技能的脚本）单独一条执行时不受文件限制，照常调用。后面接了管道、分号或重定向，它就在限制里跑，读不到登录状态，会失败，所以单独一条执行；输出太长时引擎会自己存成文件并给出路径。',
        ].filter(Boolean).join('\n')
      },
    })
  })
}
