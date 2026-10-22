import { openContext } from "file:///D:/Code/Projects/zju-skill/lib/webvpn/transport.ts";
import fs from "node:fs";
import path from "node:path";
const out = process.argv[2]!;
const sites = process.argv.slice(3);
const ctx = await openContext({ name: "probe", title: "probe", hosts: ["zju.edu.cn", "cc98.org"], auth: "none", network: "campus", writes: false }, { timeout: 15000 });
const fp = (html: string) => {
  const marks: string[] = [];
  for (const [k, re] of Object.entries({ webplus: /\/_upload\/|wp_articlecontent|sudytech/i, listhtm: /\/list\d*\.htm/, vue: /chunk-vendors|__vue|app\.[0-9a-f]+\.js/, cas: /zjuam\.zju\.edu\.cn\/cas/, rss: /\.rss|rss\.xml|type="application\/rss/i })) if (re.test(html)) marks.push(k);
  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  return { title: title.slice(0, 40), marks };
};
try {
  for (const u of sites) {
    const t = Date.now();
    try {
      const r = await ctx.fetchFollow(u);
      const f = fp(r.body);
      const name = new URL(u).hostname.replace(/\W+/g, "_") + "_" + new URL(u).pathname.replace(/\W+/g, "_").slice(0, 30);
      fs.writeFileSync(path.join(out, "pages", name + ".html"), r.body);
      console.log(`${u} -> ${r.status} ${Date.now() - t}ms len=${r.body.length} final=${r.url.replace(/^https:\/\/webvpn\.zju\.edu\.cn\/https?\/[0-9a-f]+/, "[vpn]").slice(0, 80)} | ${f.title} | ${f.marks.join(",")}`);
    } catch (e) { console.log(`${u} -> ERR ${(e as Error).message.slice(0, 100)}`); }
  }
} finally { ctx.close(); }
