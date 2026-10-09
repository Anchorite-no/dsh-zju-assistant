/**
 * 从 ZJU Core 的命令树生成 commands.gen.ts：每条命令给人看的一句话，「执行过程」拿它当每一步的名字。
 * 命令的说明只在 core/zju 里写一遍，这里取它的第一句；core 改了命令之后重新生成：
 *   node ui/client/trace/gen-commands.mjs
 * commands.test.mjs 核对生成结果和仓库里的文件一致。
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CLI = new URL('../../../core/zju/lib/cli.ts', import.meta.url)
const OUT = new URL('./commands.gen.ts', import.meta.url)

/** 命令的说明，去掉 help 开头拼上的参数列表（拼法见 core/zju/lib/core/command.ts 的 command()）。 */
function description(command) {
  const flags = Object.entries(command.options ?? {}).map(([name, option]) => {
    const arg = `--${name}${option.type === 'boolean' ? '' : ' ' + (option.choices?.join('|') ?? (option.type === 'integer' ? 'N' : 'VALUE'))}`
    return option.required ? arg : `[${arg}]`
  }).join(' ') + ' '
  return command.help.startsWith(flags) ? command.help.slice(flags.length) : command.help
}

/** 说明的第一句：去掉括号里的补充，截到第一个冒号、逗号、分号或句号；「并回查」是给模型看的，也去掉。 */
export function shortLabel(text) {
  const plain = text.replace(/（[^（）]*）/g, '').replace(/\([^()]*\)/g, '')
  return plain.split(/[：:，；;。]/)[0].replace(/并回查$/, '').trim()
}

/** 全部公开命令：键是「模块 对象 动作」，值是给人看的名字；write 标出会改动东西的命令（带 --confirm 的）。 */
export async function buildCommands(cli = CLI) {
  const { modules } = await import(cli)
  const commands = {}
  const walk = (path, command) => {
    if (command.hidden) return
    // 有 options 的分组本身也能执行。
    if (!command.children || command.options) {
      commands[path] = { label: shortLabel(description(command)), ...(command.options?.confirm ? { write: true } : {}) }
    }
    for (const [name, child] of Object.entries(command.children ?? {})) walk(`${path} ${name}`, child)
  }
  for (const [name, module] of Object.entries(modules)) {
    if (module.hidden) continue
    for (const [action, command] of Object.entries(module.commands)) walk(`${name} ${action}`, command)
  }
  return commands
}

/** commands.gen.ts 的全文。 */
export async function renderCommands(cli = CLI) {
  const commands = await buildCommands(cli)
  const rows = Object.entries(commands).map(([path, entry]) =>
    `  ${JSON.stringify(path)}: { label: ${JSON.stringify(entry.label)}${entry.write ? ', write: true' : ''} },`)
  return [
    '/** 由 gen-commands.mjs 从 core/zju 的命令树生成，不要手改。 */',
    'export const COMMANDS: Readonly<Record<string, { readonly label: string, readonly write?: true }>> = {',
    ...rows,
    '}',
    '',
  ].join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(OUT, await renderCommands())
  console.log(`已生成 ${fileURLToPath(OUT)}`)
}
