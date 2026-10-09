/** 超星命令注册：参数在这里声明并组装结果视图，平台请求在 courses.ts / download.ts。 */
import { command, group, sessionCommands, bool, type Command, type Flags, type Option } from "../core/command.ts";
import { ConfigError, NeedsUser } from "../core/errors.ts";
import { fileSize } from "../core/output.ts";
import { uniqueMatch } from "../core/match.ts";
import { openChaoxing, sessionStore, type Chaoxing } from "./client.ts";
import { courseRow, findCourse, inventory, listChapters, listCourses, seenIn, type Course, type CourseFile, type Inventory } from "./courses.ts";
import type { Chapter } from "./parse.ts";
import { saveFiles } from "./download.ts";

const COURSE: Option = { description: "课程名称，可用常见简称；也可以直接给课程页面的链接", required: true };
const CHAPTER: Option = { description: "只要这一章或这一节的：写章节标题里的一段（光学实验、等厚干涉、5.2），或清单里的 location 原样；资料栏的文件夹也写在这里" };
const QUALITY: Option = { description: "original 老师上传的原文件，最清晰；playback 平台的播放版（720p 左右，体积约为原文件的十分之一），用户要快、要小或要发给别人时用", choices: ["original", "playback"], default: "original" };

const text = (f: Flags, key: string) => typeof f[key] === "string" ? f[key] as string : undefined;
/** 多个值用竖线分隔，与学在的 --name 相同。 */
const list = (value: string | undefined) => (value ?? "").split(/[|｜]/).map((v) => v.trim()).filter(Boolean);

type Group = "material" | "video";
const inGroup = (kind: Group) => (f: CourseFile) => (f.kind === "video") === (kind === "video");
const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
/** 同一个文件常挂在几处（两个章节，或章节和资料栏各一份）：清单和下载都只算一个，留最先出现的，章节在资料栏之前。 */
function distinct(files: CourseFile[]): CourseFile[] {
  const seen = new Set<string>();
  return files.filter((f) => !f.objectId || (!seen.has(f.objectId) && !!seen.add(f.objectId)));
}
/** 清单的一行；location 是从大章到小节（或「资料」到文件夹）的整条位置，可以原样写回 --chapter。 */
const fileRow = (f: CourseFile) => ({ name: f.name, size: fileSize(f.size), location: f.location.join(" / "), ...(f.downloadable ? {} : { downloadable: false }) });

/** 最长公共子序列的长度。 */
function common(a: string[], b: string[]): number {
  let row = new Array<number>(b.length + 1).fill(0);
  for (const x of a) {
    const next = [0];
    for (let j = 0; j < b.length; j++) next.push(x === b[j] ? row[j]! + 1 : Math.max(row[j + 1]!, next[j]!));
    row = next;
  }
  return row[b.length]!;
}
/**
 * 两个标题有多像（0..1）：去掉序号和符号后，公共子序列占较短一方的比例。
 * 共同的字不到 4 个，或只占较长一方不到六成的不算像，免得短词乱对。
 */
export function similarity(a: string, b: string): number {
  const x = bare(a), y = bare(b), shared = common(x, y);
  return shared >= 4 && shared / Math.max(x.length, y.length) >= 0.6 ? shared / Math.min(x.length, y.length) : 0;
}
const bare = (s: string) => [...norm(s).replace(/^[\d.]+/, "").replace(/[^\p{L}\p{N}]/gu, "")];

/**
 * --chapter 命中的范围：先按章节标题找（命中大章就是它下面的全部节），章节里没有再按资料栏的文件夹名找。
 * 返回要读的节，以及在清单里留下哪些文件。
 */
export function chapterScope(chapters: Chapter[], query: string): { chapters: Chapter[]; keep: (f: CourseFile) => boolean } | undefined {
  const wanted = norm(query);
  // 每一层标题都是一个可选的范围：路径前缀相同的节属于它。可以只写这一层的标题，也可以写清单里的整条位置。
  const scopes = new Map<string, string[]>();
  for (const ch of chapters) ch.path.forEach((_, i) => scopes.set(ch.path.slice(0, i + 1).join("\n"), ch.path.slice(0, i + 1)));
  const all = [...scopes.values()], names = (p: string[]) => [norm(p.at(-1)!), norm(p.join("/"))];
  const exact = all.filter((p) => names(p).includes(wanted));
  let hit = exact.length ? exact : all.filter((p) => names(p).some((n) => n.includes(wanted)));
  if (!hit.length) {
    // 字面对不上时找只差一两个字的（实验课表写「…的测定」「…的研究」，这里叫「…的测量」）；只有一个明显最像时才算。
    const close = all.map((p) => ({ p, score: similarity(query, p.at(-1)!) })).filter((r) => r.score >= 0.85).sort((a, b) => b.score - a.score);
    if (close.length && (close.length === 1 || close[0]!.score - close[1]!.score >= 0.1)) hit = [close[0]!.p];
  }
  if (!hit.length) return undefined;
  // 命中的范围互相包含时取最外层（「第三章」同时命中大章和节标题里带这几个字的节）。
  const outer = hit.filter((p) => !hit.some((q) => q.length < p.length && q.every((part, i) => part === p[i])));
  if (outer.length > 1) {
    const error = new NeedsUser("章节不唯一，请从候选中明确");
    error.detail.candidates = outer.slice(0, 12).map((p) => p.join(" / "));
    throw error;
  }
  const prefix = outer[0]!, within = (location: string[]) => prefix.every((part, i) => location[i] === part);
  return { chapters: chapters.filter((ch) => within(ch.path)), keep: (f) => f.source === "chapter" && within(f.location) };
}

/** 资料栏里名字对得上的文件夹（任意一层）；写「资料」就是整个资料栏。 */
export function folderScope(files: CourseFile[], query: string): ((f: CourseFile) => boolean) | undefined {
  const wanted = norm(query);
  const keep = (exact: boolean) => (f: CourseFile) => {
    if (f.source !== "data") return false;
    const parts = f.location.map(norm), joined = parts.join("/");
    return exact ? parts.includes(wanted) || joined === wanted || joined.startsWith(wanted + "/") : joined.includes(wanted);
  };
  return files.some(keep(true)) ? keep(true) : files.some(keep(false)) ? keep(false) : undefined;
}

type Found = { files: CourseFile[]; inv: Inventory };
/** 按名字选文件：全名、不带扩展名的名字，或其中一段；不唯一或找不到时抛出候选。 */
const pick = (files: CourseFile[], names: string[]) => [...new Set(names.map((name) => uniqueMatch(files, name, (r) => [r.name, r.name.replace(/\.[^.]+$/, "")], fileRow, "文件")))];

/**
 * 只给了文件名时先在最可能的几节里找，不必读整门课（30 节要十秒）：名字对得上标题的那一节（「等厚干涉」→「5.2 等厚干涉G」），
 * 或以前读清单时见过这个文件的那几节（旧清单只用来定位，内容重新读）。在那里找不到或不唯一就返回 undefined，由调用方读整门课。
 */
async function nearby(c: Chaoxing, course: Course, chapters: Chapter[], kind: Group, names: string[]): Promise<(Found & { wanted: CourseFile[] }) | undefined> {
  const sections = new Map<string, Chapter>(), titled = new Map<string, (f: CourseFile) => boolean>();
  for (const name of names) {
    let scope: Chapter[] = [];
    try { const hit = chapterScope(chapters, name); if (hit) { scope = hit.chapters; titled.set(name, hit.keep); } } catch { /* 对得上好几节：不走捷径 */ }
    if (!scope.length) { const seen = seenIn(course, (file) => norm(file).includes(norm(name))); scope = chapters.filter((ch) => seen.includes(ch.id)); }
    if (!scope.length || scope.length > 3) return undefined;
    for (const ch of scope) sections.set(ch.id, ch);
  }
  const inv = await inventory(c, course, [...sections.values()], { data: false });
  const files = distinct(inv.files.filter(inGroup(kind)));
  try {
    return { files, inv, wanted: [...new Set(names.map((name) => {
      try { return pick(files, [name])[0]!; }
      catch (error) {
        // 名字说的是这一节（「等厚干涉的视频」），而这一节只有一个这类文件：就是它，文件名不必也对得上。
        const own = titled.has(name) ? files.filter(titled.get(name)!) : [];
        if (error instanceof NeedsUser && own.length === 1) return own[0]!;
        throw error;
      }
    }))] };
  } catch (error) { if (error instanceof NeedsUser) return undefined; throw error; }
}

/** 一门课里属于这一组（课件或视频）的文件，可限定章节。 */
async function scoped(c: Chaoxing, course: Course, chapters: Chapter[], kind: Group, chapter: string | undefined, fresh = false): Promise<Found> {
  const scope = chapter ? chapterScope(chapters, chapter) : undefined;
  const inv = await inventory(c, course, scope ? scope.chapters : chapters, { data: !scope, fresh });
  let keep = scope?.keep;
  if (chapter && !keep) {
    keep = folderScope(inv.files, chapter);
    if (!keep) {
      const error = new NeedsUser(`没有找到章节或资料文件夹“${chapter}”`);
      // 候选给共同的字最多的几节，都不沾边时给大章。
      const close = chapters.map((ch) => ({ ch, score: common(bare(chapter), bare(ch.title)) })).filter((r) => r.score >= 2).sort((a, b) => b.score - a.score).slice(0, 6);
      error.detail.candidates = close.length ? close.map((r) => r.ch.path.join(" / ")) : [...new Set(chapters.map((ch) => ch.path[0]!))].slice(0, 20);
      throw error;
    }
  }
  return { files: distinct(inv.files.filter(inGroup(kind)).filter(keep ?? (() => true))), inv };
}

const notes = (inv: Inventory) => ({
  ...(inv.notOpen.length ? { notOpen: inv.notOpen } : {}),
  ...(inv.dataError ? { warning: `资料栏没有读到：${inv.dataError}` } : {}),
});

export function createChaoxingCommands(open: typeof openChaoxing = openChaoxing): Record<string, Command> {
  async function withClient<T>(fn: (c: Chaoxing) => Promise<T>, fresh = false): Promise<T> {
    const c = await open();
    try { await c.login(fresh); return await fn(c); } finally { c.close(); }
  }
  const read = (description: string, options: Record<string, Option>, run: (c: Chaoxing, f: Flags) => Promise<unknown>) =>
    command(description, options, (f) => withClient((c) => run(c, f)));

  function fileCommands(kind: Group): Record<string, Command> {
    const what = kind === "video" ? "视频" : "课件";
    const rows = kind === "video" ? "videos" : "materials";
    return {
      list: read(kind === "video" ? "一门课的全部视频：文件名、大小和所在章节" : "一门课的课件等文件（章节里的文档和「资料」栏）：文件名、大小和所在章节或文件夹", { course: COURSE, chapter: CHAPTER }, async (c, f) => {
        const course = await findCourse(c, f.course as string);
        const { files, inv } = await scoped(c, course, await listChapters(c, course), kind, text(f, "chapter"));
        return { course: course.name, count: files.length, [rows]: files.map(fileRow), ...notes(inv) };
      }),
      download: command(`下载${what}，返回本地路径；下载过的直接复用。默认存到 data/output/chaoxing/课程名/，按章节分目录`, {
        course: COURSE,
        name: { description: "文件名，多个用竖线分隔" },
        chapter: CHAPTER,
        all: { description: `这门课的全部${what}`, type: "boolean" },
        ...(kind === "video" ? { quality: QUALITY } : {}),
        "out-dir": { description: "保存目录" },
      }, (f) => {
        // 范围没说清楚时不登录、不发请求。
        const names = list(text(f, "name")), chapter = text(f, "chapter");
        if (bool(f, "all") ? names.length > 0 || chapter !== undefined : !names.length && chapter === undefined) throw new ConfigError(`需要 --name 文件名、--chapter 章节，或 --all 下载这门课的全部${what}`);
        return withClient(async (c) => {
          const course = await findCourse(c, f.course as string), chapters = await listChapters(c, course);
          const choose = (files: CourseFile[]) => names.length ? pick(files, names) : files.filter((r) => r.downloadable);
          let found = names.length && chapter === undefined ? await nearby(c, course, chapters, kind, names) : undefined;
          if (!found) {
            let { files, inv } = await scoped(c, course, chapters, kind, chapter);
            let wanted: CourseFile[];
            try { wanted = choose(files); }
            catch (error) {
              // 清单来自缓存时，老师刚传的文件可能不在里面：重读一次再找。
              if (!inv.cached || !(error instanceof NeedsUser)) throw error;
              ({ files, inv } = await scoped(c, course, chapters, kind, chapter, true));
              wanted = choose(files);
            }
            found = { files, inv, wanted };
          }
          if (!found.wanted.length) throw new NeedsUser(`${course.name}${chapter ? `「${chapter}」` : ""}没有可下载的${what}`);
          return { course: course.name, ...await saveFiles(c, course, found.wanted, found.files, { playback: f.quality === "playback", ...(text(f, "out-dir") ? { outDir: text(f, "out-dir")! } : {}) }), ...notes(found.inv) };
        });
      }),
    };
  }

  return sessionCommands({
    course: group("我的课程", {
      list: read("本人在学习通上的课程：名称、教师、班级", {}, async (c) => {
        const courses = await listCourses(c);
        return { count: courses.length, courses: courses.map(courseRow) };
      }),
    }),
    material: group("课件等文件（章节里的文档和「资料」栏）：清单与下载", fileCommands("material")),
    video: group("章节视频：清单与下载", fileCommands("video")),
    login: command("建立或复用超星会话，返回当前账号", { fresh: { description: "强制重新登录", type: "boolean" } }, (f) => withClient((c) => c.me(), bool(f, "fresh"))),
    status: command("本地会话状态（不联网）", {}, async () => { const s = sessionStore(); return { file: s.file, ...s.status() }; }, "local"),
    logout: command("清除本地超星会话", {}, async () => ({ cleared: sessionStore().clear() }), "local"),
  }, "chaoxing");
}

export const chaoxingCommands = createChaoxingCommands();
