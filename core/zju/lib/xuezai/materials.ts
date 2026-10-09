import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BadResponse, RemoteRejected } from "../core/errors.ts";
import { paths } from "../core/paths.ts";
import { fileSize } from "../core/output.ts";
import type { Xuezai } from "./client.ts";
import { listActivities } from "./courses.ts";
import type { Activity, Upload } from "./types.ts";

export interface Material extends Upload {
  activities: { id: number; title: string; type: string; moduleId: number | null; syllabusId: number | null }[];
}

export function collectMaterials(activities: Activity[]): Material[] {
  const files = new Map<number, Material>();
  for (const activity of activities) for (const upload of activity.uploads ?? []) {
    if (!files.has(upload.id)) files.set(upload.id, { ...upload, activities: [] });
    files.get(upload.id)!.activities.push({ id: activity.id, title: activity.title, type: activity.type, moduleId: activity.module_id ?? null, syllabusId: activity.syllabus_id ?? null });
  }
  return [...files.values()];
}

/** 文件清单的一行：下载用 name 即可，平台存储字段不外露。 */
export function materialRow(m: Material) {
  return {
    name: m.name, size: fileSize(m.size), activity: m.activities.map((a) => a.title).join("；"),
    ...(m.link ? { link: m.link } : {}), ...(m.allow_download === false ? { downloadable: false } : {}),
  };
}

export async function listMaterials(client: Xuezai, courseId: number | string): Promise<Material[]> {
  return collectMaterials(await listActivities(client, courseId));
}

export function safeFileName(name: string): string {
  let value = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/g, "").slice(0, 180);
  if (!value || /^\.+$/.test(value)) value = "file";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) value = "_" + value;
  return value;
}

/** 一组文件里重名的（各章都叫「课件.pdf」）在文件名后带上平台编号，互不覆盖。 */
function localName(file: Upload, all: Upload[]): string {
  const name = safeFileName(file.name);
  if (all.filter((m) => m.name === file.name).length < 2) return name;
  const ext = path.extname(name);
  return `${name.slice(0, name.length - ext.length)} (${file.id})${ext}`;
}

async function download(client: Xuezai, file: Upload, destination: string, reuse: boolean, signal?: AbortSignal) {
  if (file.allow_download === false) throw new RemoteRejected("老师没有开放这个文件的下载");
  // 下载过且大小一致的直接复用。
  const existing = reuse ? await fs.promises.stat(destination).catch(() => undefined) : undefined;
  if (existing?.isFile() && existing.size === file.size) return { name: file.name, path: destination, size: fileSize(existing.size), reused: true };
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  const temporary = destination + `.${crypto.randomUUID()}.part`;
  const response = await client.blob(file.id, signal);
  if (!response.body) throw new BadResponse("下载响应没有文件内容");
  let bytes = 0;
  const counter = new Transform({ transform(chunk: Buffer, _encoding, callback) { bytes += chunk.length; callback(null, chunk); } });
  try {
    await pipeline(Readable.fromWeb(response.body as never), counter, fs.createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
    const advertised = response.headers.get("content-length");
    if (advertised && !response.headers.get("content-encoding") && bytes !== Number(advertised)) throw new BadResponse("下载长度与响应不一致", { bytes, expected: Number(advertised) });
    await fs.promises.rename(temporary, destination);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
  return { name: file.name, path: destination, size: fileSize(bytes) };
}

/**
 * 把若干平台文件存到 dir；个别文件失败不影响其余，列在 failed。
 * reuse 为 false 时不看本地已有文件（同名文件内容可能换过，如重交的作业）。
 */
export async function saveUploads(client: Xuezai, dir: string, wanted: Upload[], opts: { all?: Upload[]; reuse?: boolean; signal?: AbortSignal } = {}) {
  const files: Awaited<ReturnType<typeof download>>[] = [], failed: { name: string; reason: string }[] = [];
  for (const file of wanted) {
    try { files.push(await download(client, file, path.join(dir, localName(file, opts.all ?? wanted)), opts.reuse !== false, opts.signal)); }
    catch (e) { failed.push({ name: file.name, reason: e instanceof Error ? e.message : String(e) }); }
  }
  return { files, failed };
}

/**
 * 下载一门课的若干文件到 outDir（默认 data/output/xuezai/<课程名>/）。
 * 结果总是 files 列表；个别文件失败不影响其余，列在 failed。
 */
export async function downloadMaterials(client: Xuezai, course: string, all: Material[], wanted: Material[], opts: { outDir?: string; signal?: AbortSignal } = {}) {
  const dir = path.resolve(opts.outDir ?? path.join(paths.output(), "xuezai", safeFileName(course)));
  const { files, failed } = await saveUploads(client, dir, wanted, { all, ...(opts.signal ? { signal: opts.signal } : {}) });
  const result = { count: files.length, files, ...(failed.length ? { failed } : {}) };
  if (!files.length && failed.length) throw new RemoteRejected(failed.length === 1 ? failed[0]!.reason : "文件都没有下载成功", { result });
  return result;
}
