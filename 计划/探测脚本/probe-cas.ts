import { openContext } from "file:///D:/Code/Projects/zju-skill/lib/webvpn/transport.ts";
import { unwrapUrl } from "file:///D:/Code/Projects/zju-skill/lib/webvpn/client.ts";
import fs from "node:fs";
const out = process.argv[2]!, url = process.argv[3]!, net = (process.argv[4] ?? "public") as "public" | "campus";
const host = new URL(url).hostname;
const ctx = await openContext({ name: "probe-cas", title: "probe", hosts: [host], auth: "cas", network: net, writes: false }, { timeout: 15000 });
try {
  let r = await ctx.fetchFollow(url);
  const final = unwrapUrl(r.url);
  console.log("first:", r.status, final.slice(0, 120), "len", r.body.length);
  const m = final.match(/zjuam\.zju\.edu\.cn\/cas\/login\?service=([^&]+)/) ?? r.body.match(/zjuam\.zju\.edu\.cn\/cas\/login\?service=([^&"']+)/);
  if (m) {
    const service = decodeURIComponent(m[1]!);
    console.log("CAS needed, service =", service);
    const t = Date.now();
    await ctx.zjuam!.loginService(service);
    console.log("loginService ok", Date.now() - t, "ms");
    r = await ctx.fetchFollow(url);
    console.log("after:", r.status, unwrapUrl(r.url).slice(0, 120), "len", r.body.length);
  }
  fs.writeFileSync(out, r.body);
  const items = [...r.body.matchAll(/<li[^>]*>\s*<a[^>]+href="([^"]*page\.htm)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/li>/g)].slice(0, 5).map(x => x[1] + " :: " + x[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 40));
  console.log("items:", items);
  console.log("pages:", r.body.match(/<em class="all_pages">(\d+)<\/em>/)?.[1], "count:", r.body.match(/<em class="all_count">(\d+)<\/em>/)?.[1]);
} finally { ctx.close(); }
