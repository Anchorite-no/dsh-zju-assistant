import { command, group, str, type Option, type Flags } from "../core/command.ts";
import { checkAsr } from "./asr.ts";
import { checkCourseware } from "./courseware.ts";
import { checkFfmpeg } from "./ffmpeg.ts";
import { localTranscribe, transcribeCourseware } from "./local.ts";
import { transDir } from "./places.ts";
import { setupLocal, type SetupComponent } from "./setup.ts";

const input: Record<string, Option> = { file: { description: "本地输入文件", required: true }, "out-dir": { description: "可选输出目录，默认放进「文档」里的 CampusAgent" } };
async function cancellable<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController(), abort = () => controller.abort();
  process.once("SIGINT", abort); process.once("SIGTERM", abort);
  try { return await run(controller.signal); } finally { process.removeListener("SIGINT", abort); process.removeListener("SIGTERM", abort); }
}
const output = async (f: Flags) => typeof f["out-dir"] === "string" ? f["out-dir"] : transDir(str(f, "file"));
export const localCommands = {
  setup: command("准备智云本地依赖；已有的复用，缺的才装。转写只需下载模型，不装 Python", {
    component: { description: "需要准备的能力：media 是 FFmpeg，asr 是转写模型，ppt 是课件提取的 Python 环境", choices: ["all", "media", "asr", "ppt"], default: "all" },
  }, f => setupLocal({ component: str(f, "component") as SetupComponent }), "local"),
  check: command("检查本地组件", { component: { description: "组件", choices: ["asr", "media", "ppt"], default: "asr" } },
    async f => f.component === "media" ? checkFfmpeg() : f.component === "ppt" ? checkCourseware() : checkAsr(), "local"),
  trans: group("audio 转写录音；ppt 提取课件，直接供 AI 阅读", {
    audio: command("本地音视频 → 带时间的 Markdown 粗稿、TXT 和原始 JSON；第一次用会自动下载转写模型", { ...input }, async f => {
      const directory = await output(f);
      return cancellable(signal => localTranscribe(str(f, "file"), directory, { signal }));
    }, "local"),
    ppt: command("课件文字/原图提取与去重，近似图标记供 AI 核对；不做 OCR", input, async f => transcribeCourseware(str(f, "file"), await output(f)), "local"),
  }),
};
