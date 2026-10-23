// 演示用的钟：用 NODE_OPTIONS=--require 装进引擎进程（和它起的命令），Date 按控制文件里的偏移走。
// 截图脚本（clock.mjs）往 DEMO_CLOCK_FILE 里写 { offsetMs }，这里每 200 毫秒读一次；时间照常往前走，只是整体挪了。
const fs = require('node:fs')
const file = process.env.DEMO_CLOCK_FILE
const RealDate = Date, realNow = RealDate.now.bind(RealDate)
let offset = 0
function read() { try { const value = JSON.parse(fs.readFileSync(file, 'utf8')).offsetMs; if (Number.isFinite(value)) offset = value } catch { /* 没有文件就不挪 */ } }
if (file) {
  read()
  setInterval(read, 200).unref()
  function FakeDate(...args) {
    if (!new.target) return new RealDate(realNow() + offset).toString()
    return args.length ? new RealDate(...args) : new RealDate(realNow() + offset)
  }
  FakeDate.prototype = RealDate.prototype
  FakeDate.now = () => realNow() + offset
  FakeDate.parse = RealDate.parse
  FakeDate.UTC = RealDate.UTC
  Object.defineProperty(FakeDate, 'name', { value: 'Date' })
  globalThis.Date = FakeDate
}
// 引擎进程（desktop/host.mjs）装好以后把 NODE_OPTIONS 去掉：它起的命令（对话里跑的校园命令）不用这个钟，
// 而且对话的沙箱读不到这个文件，带着它的话命令一启动就报错。壳的主进程要留着，它 fork 引擎时靠它传下去。
if (process.argv.some(arg => /host\.mjs$/.test(arg))) delete process.env.NODE_OPTIONS
