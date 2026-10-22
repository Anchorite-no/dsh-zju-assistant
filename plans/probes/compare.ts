import { openContext } from "file:///D:/Code/Projects/zju-skill/lib/webvpn/transport.ts";
import { Zdbk, requirements as zreq } from "file:///D:/Code/Projects/zju-skill/lib/zdbk/client.ts";
import { listNotices } from "file:///D:/Code/Projects/zju-skill/lib/zdbk/xtgl.ts";
import { credentials } from "file:///D:/Code/Projects/zju-skill/lib/profile/profile.ts";
import { decodeEntities } from "file:///D:/Code/Projects/zju-skill/lib/core/html.ts";
import fs from "node:fs";
const out = process.argv[2]!;
const key = (t: string) => decodeEntities(t).replace(/【[^】]*】|\[[^\]]*\]|（[^）]*）|\([^)]*\)/g, "").replace(/^(关于|转发|浙江大学|本科生院|研究生院|学工部|教务处|信息技术中心)/g, "").replace(/[\s\p{P}]/gu, "").slice(0, 14);

// 1) zdbk latest notices (try direct, fall back to webvpn)
let zrows: { title: string; date: string; category: string; ext?: string; id: string }[] = [];
for (const net of ["public", "campus"] as const) {
  try {
    const ctx = await openContext({ ...zreq, network: net }, { timeout: 15000 });
    const z = new Zdbk(ctx, credentials().username);
    try {
      for (const page of [1, 2]) {
        const r = await listNotices(z, { page, size: 50, latestFirst: true });
        zrows.push(...r.notices.map(n => ({ title: n.title, date: n.date.slice(0, 10), category: n.category, ext: n.externalUrl, id: n.id })));
      }
    } finally { z.close(); }
    console.error(`zdbk via ${net}: ${zrows.length} rows`);
    break;
  } catch (e) { console.error(`zdbk via ${net} failed: ${(e as Error).message.slice(0, 120)}`); }
}
// 2) zhfw columns
const ctx = await openContext({ name: "probe", title: "probe", hosts: ["zju.edu.cn"], auth: "none", network: "campus", writes: false }, { timeout: 15000 });
const hrows: { title: string; date: string; href: string; column: string }[] = [];
try {
  for (const [col, pages] of [["zhfw_jsgx", 10], ["zhfw_jyjx", 4]] as const) {
    for (let p = 1; p <= pages; p++) {
      const r = await ctx.fetchFollow(`http://zhfw.zju.edu.cn/${col}/list${p === 1 ? "" : p}.htm`);
      for (const m of r.body.matchAll(/<li>\s*<a href='([^']+)'[^>]*title='([^']*)'[^>]*>[\s\S]*?<\/a>\s*(\d{4}-\d{2}-\d{2})\s*<\/li>/g))
        hrows.push({ href: m[1]!, title: decodeEntities(m[2]!), date: m[3]!, column: col });
    }
  }
} finally { ctx.close(); }
fs.writeFileSync(out + "/zdbk-rows.json", JSON.stringify(zrows, null, 1));
fs.writeFileSync(out + "/zhfw-rows.json", JSON.stringify(hrows, null, 1));
// 3) compare
const hk = new Map<string, typeof hrows[number]>(); for (const h of hrows) hk.set(key(h.title), h);
const minDate = hrows.filter(h => h.column === "zhfw_jsgx").map(h => h.date).sort()[0]!;
console.log(`zhfw 即时更新 ${hrows.filter(h => h.column === "zhfw_jsgx").length} 条，覆盖 ${minDate} 至今；教育教学 ${hrows.filter(h => h.column === "zhfw_jyjx").length} 条`);
const inRange = zrows.filter(r => r.date >= minDate);
console.log(`教务网最近 ${zrows.length} 条中，${minDate} 之后的有 ${inRange.length} 条`);
let hit = 0; const miss: typeof inRange = [];
for (const r of inRange) { const h = hk.get(key(r.title)); if (h) { hit++; console.log(`  ✓ ${r.date} [${r.category}] ${r.title.slice(0, 40)}  ← zhfw ${h.column} ${h.href.includes("zdbk") ? "外链教务网" : "自有页面"}`); } else miss.push(r); }
console.log(`\n命中 ${hit}/${inRange.length}；未在综合服务网出现的 ${miss.length} 条：`);
for (const r of miss) console.log(`  ✗ ${r.date} [${r.category}] ${r.title.slice(0, 48)}${r.ext ? "  (外链:" + new URL(r.ext).hostname + ")" : ""}`);
const zk = new Set(zrows.map(r => key(r.title)));
const zhfwToZdbk = hrows.filter(h => /zdbk\.zju\.edu\.cn/.test(h.href));
console.log(`\n综合服务网里外链到教务网的条目 ${zhfwToZdbk.length} 条，例：`, zhfwToZdbk.slice(0, 3).map(h => h.date + " " + h.title.slice(0, 30)));
const eduOnlyInZhfw = hrows.filter(h => h.column === "zhfw_jyjx" && h.date >= (inRange.at(-1)?.date ?? minDate) && !zk.has(key(h.title)));
console.log(`综合服务网"教育教学"里教务网没有的（同期）${eduOnlyInZhfw.length} 条，例：`); for (const h of eduOnlyInZhfw.slice(0, 8)) console.log(`  · ${h.date} ${h.title.slice(0, 48)}`);
