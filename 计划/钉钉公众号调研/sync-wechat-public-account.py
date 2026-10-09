"""Experimental local sync. Saves only public article metadata, never keys/DBs.

Use --article-url on first import, then --biz on subsequent scheduler invocations.
This command does not create a scheduler or interact with the WeChat interface.
"""
import argparse
import base64
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
import urllib.parse

ROOT = Path(__file__).resolve().parent


def run_ps(script, *args):
    shell = shutil.which("pwsh")
    if not shell:
        raise RuntimeError("PowerShell 7 is required")
    p = subprocess.run([shell, "-NoProfile", "-File", str(ROOT / script), *args], capture_output=True,
                       timeout=65, encoding="utf-8", creationflags=subprocess.CREATE_NO_WINDOW)
    if p.returncode:
        raise RuntimeError("Local reader failed; existing public metadata was preserved")
    return json.loads(p.stdout)


def merge(previous, snapshot, name, seed_url):
    meta = snapshot["metadata"]
    old = {item["id"]: item for item in (previous or {}).get("items", [])}
    incoming = {item["id"]: item for item in meta["items"]}
    unseen = set(incoming) - set(old)
    old.update(incoming)
    return dict(schemaVersion=1, source=meta["source"], biz=meta["biz"],
        accountName=name or (previous or {}).get("accountName"),
        seedArticle=seed_url or (previous or {}).get("seedArticle"),
        accountTable=meta.get("accountTable") or (previous or {}).get("accountTable"),
        checkedAt=meta["checkedAt"], status="synced_local_cache" if incoming else "account_not_in_local_cache",
        requiresWeRead=False, completeAccountFeed=False,
        initialImportCount=len(incoming) if previous is None else 0,
        newlyDiscoveredCount=len(unseen) if previous else 0,
        newlyDiscoveredIds=sorted(unseen) if previous else [],
        totalStoredArticles=len(old), currentSnapshotArticles=len(incoming),
        items=sorted(old.values(), key=lambda x: x.get("publishedAt") or x.get("receivedAt") or "", reverse=True),
        validation={k: snapshot[k] for k in ("authenticatedPages", "walCommittedFrames", "walPagesApplied", "walTailReason")},
        diagnostics=meta["diagnostics"], credentialValuesIncluded=False)


def main():
    parser = argparse.ArgumentParser()
    identity = parser.add_mutually_exclusive_group(required=True)
    identity.add_argument("--article-url")
    identity.add_argument("--biz")
    parser.add_argument("--name")
    args = parser.parse_args()
    biz, name = args.biz, args.name
    seed_url = None
    if args.article_url:
        url = urllib.parse.urlsplit(args.article_url)
        if url.scheme != "https" or url.hostname != "mp.weixin.qq.com" or not (url.path == "/s" or url.path.startswith("/s/")):
            raise ValueError("Provide a public HTTPS WeChat article URL")
        values = urllib.parse.parse_qs(url.query)
        public_query = urllib.parse.urlencode({k: values[k][0] for k in ("__biz", "mid", "idx", "sn") if k in values}) if url.path == "/s" else ""
        seed_url = urllib.parse.urlunsplit(("https", "mp.weixin.qq.com", url.path, public_query, ""))
        if "__biz" in values:
            biz = values["__biz"][0]
        else:
            result = run_ps("discover-wechat.ps1", "-ArticleUrl", args.article_url, "-IdentityOnly")
            biz = result["account"]["biz"]
            name = name or result["account"]["name"]
    number = base64.b64decode(biz, validate=True).decode("ascii")
    if not re.fullmatch(r"\d{6,20}", number):
        raise ValueError("Invalid public account identifier")
    path = ROOT / f"wechat-watch-{number}.json"
    previous = json.loads(path.read_text("utf-8-sig")) if path.exists() else None
    parameters = ["-ReadMessages", "-Biz", biz]
    if previous and previous.get("accountTable"):
        parameters.extend(["-AccountTable", previous["accountTable"]])
    snapshot = run_ps("probe-wechat-biz-db.ps1", *parameters)
    state = merge(previous, snapshot, name, seed_url)
    temporary = path.with_suffix(".json.pending")
    temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)
    print(json.dumps({k: state[k] for k in ("accountName", "biz", "status", "initialImportCount", "newlyDiscoveredCount", "totalStoredArticles", "currentSnapshotArticles", "completeAccountFeed", "diagnostics")}, ensure_ascii=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Do not relay child stderr or request URLs into logs.
        print(json.dumps({"status": "sync_failed", "existingMetadataPreserved": True, "errorType": type(error).__name__}), file=sys.stderr)
        sys.exit(1)
