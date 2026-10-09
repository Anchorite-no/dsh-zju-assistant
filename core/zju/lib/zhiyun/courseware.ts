/** 课件文字和原图提取：scripts/zhiyun/extract.py 跑在自己的 Python 环境里（pypdf、Pillow），与转写无关。 */
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { paths } from "../core/paths.ts";
import { env } from "../core/env.ts";
import { BadResponse, ZjuError } from "../core/errors.ts";

export interface MaterialText {
  status: "text" | "no_text" | "unsupported" | "error";
  pages?: { page: number; text: string }[];
  images?: { page: number; path: string; duplicateOf?: number; similarTo?: { page: number; path: string; distance: number; thumbnailRmse?: number } }[];
  dedup?: { visualAvailable: boolean; exact: string; near: string; nearDistance: number };
  reason?: string | null;
}

const SETUP = "zju zhiyun setup --component ppt";
export function pythonPath(): string {
  return env("ZJU_PPT_PYTHON") || path.join(paths.data(), "tools", "zhiyun-ppt", ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
}
async function extract(args: string[]): Promise<unknown> {
  const executable = pythonPath();
  try { await fs.access(executable); } catch {
    throw new ZjuError("DEPENDENCY_MISSING", "课件提取的 Python 环境尚未安装", { hint: SETUP });
  }
  return new Promise((resolve, reject) => {
    let stdout = "", stderr = "";
    const child = spawn(executable, ["-X", "utf8", path.join(paths.root, "scripts", "zhiyun", "extract.py"), ...args], {
      cwd: paths.root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ZJU_DATA_DIR: paths.data(), PYTHONUTF8: "1" },
    });
    child.stdout.on("data", (b: Buffer) => {
      stdout += b.toString("utf8");
      if (Buffer.byteLength(stdout) > 20 * 1024 * 1024) { child.kill(); reject(new BadResponse("Python 输出超过 20 MiB")); }
    });
    child.stderr.on("data", (b: Buffer) => { stderr = (stderr + b.toString("utf8")).slice(-2500); });
    child.once("error", reject);
    child.once("close", code => {
      let result: any;
      try { result = JSON.parse(stdout); } catch { reject(new BadResponse("课件提取脚本未返回有效 JSON", { exitCode: code, stderr })); return; }
      if (code !== 0 || result?.ok === false) {
        const missing = result?.error?.code === "DEPENDENCY_MISSING";
        reject(new ZjuError(missing ? "DEPENDENCY_MISSING" : "BAD_RESPONSE", result?.error?.message ?? `课件提取脚本退出 ${code}`, missing ? { hint: SETUP } : {}));
      } else resolve(result?.ok === true ? result.data : result);
    });
  });
}
export async function extractMaterialText(file: string, opts: { imagesDir?: string } = {}): Promise<MaterialText> {
  return await extract([path.resolve(file), ...(opts.imagesDir ? ["--images-dir", path.resolve(opts.imagesDir)] : [])]) as MaterialText;
}
export async function checkCourseware(): Promise<unknown> { return extract(["--check"]); }
