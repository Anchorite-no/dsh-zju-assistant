"""Parse public-account metadata from an authenticated in-memory DB snapshot.

Discovery returns account names/counts only. Sync emits only requested articles.
"""
import argparse
import base64
from compression import zstd
from datetime import datetime, timezone
import html
import json
import re
import sqlite3
import sys
import urllib.parse
import xml.etree.ElementTree as ET


def numeric_id(biz):
    try:
        number = base64.b64decode(biz, validate=True).decode("ascii")
        if re.fullmatch(r"\d{6,20}", number):
            return number
    except (ValueError, UnicodeError):
        pass
    raise ValueError("Invalid public account identifier")


def public_article(raw):
    try:
        url = urllib.parse.urlsplit(html.unescape(raw or ""))
        params = urllib.parse.parse_qs(url.query)
        if url.scheme not in ("http", "https") or url.hostname != "mp.weixin.qq.com" or url.path != "/s" or url.username:
            return None
        p = {k: params[k][0] for k in ("__biz", "mid", "idx", "sn") if len(params[k]) == 1}
        numeric_id(p["__biz"])
        if not re.fullmatch(r"\d+", p["mid"]) or not re.fullmatch(r"\d+", p["idx"]) or not re.fullmatch(r"[0-9a-fA-F]{32}", p["sn"]):
            return None
        return p["__biz"], f'{p["__biz"]}:{p["mid"]}:{p["idx"]}', "https://mp.weixin.qq.com/s?" + urllib.parse.urlencode(p)
    except (ValueError, KeyError, IndexError):
        return None


def decode_content(value, stats):
    if isinstance(value, str):
        return value
    if not isinstance(value, bytes):
        return ""
    if value.startswith(b"\x28\xb5\x2f\xfd"):
        try:
            decoder = zstd.ZstdDecompressor()
            value = decoder.decompress(value, 4 * 1024 * 1024)
            if not decoder.eof:
                raise ValueError("Oversized public message")
            stats["zstdDecoded"] += 1
        except (zstd.ZstdError, ValueError):
            stats["decodeFailures"] += 1
            return ""
    return value.decode("utf-8", errors="replace")


def timestamp(value):
    try:
        value = int(value)
        return datetime.fromtimestamp(value, timezone.utc).isoformat() if 946684800 <= value <= 4102444800 else None
    except (TypeError, ValueError):
        return None


def extract(db_bytes, request):
    discover = isinstance(request, dict) and request.get("action") == "discover"
    targets = {} if discover else {item["biz"]: item for item in request}
    for biz in targets:
        numeric_id(biz)
    con = sqlite3.connect(":memory:")
    try:
        con.deserialize(db_bytes)
        con.execute("PRAGMA query_only=ON")
        if [r[0] for r in con.execute("PRAGMA quick_check")] != ["ok"]:
            raise ValueError("Database integrity failed")
        all_tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'") if re.fullmatch(r"Msg_[0-9a-fA-F]{32}", r[0])}
        hints = {t for target in targets.values() for t in target.get("tableHints", [])}
        cold = any(not target.get("tableHints") or not set(target["tableHints"]).issubset(all_tables) for target in targets.values())
        tables = all_tables if discover or cold else hints
        stats = dict(messageTables=len(tables), rowsExamined=0, zstdDecoded=0, decodeFailures=0, xmlFailures=0)
        accounts = {}
        for table in sorted(tables):
            columns = {r[1] for r in con.execute(f'PRAGMA table_info("{table}")')}
            if "message_content" not in columns:
                continue
            selected = [x for x in ("message_content", "compress_content", "create_time", "local_id") if x in columns]
            for values in con.execute(f'SELECT {", ".join(selected)} FROM "{table}"'):
                stats["rowsExamined"] += 1
                row = dict(zip(selected, values))
                content = decode_content(row["message_content"], stats)
                if "<mmreader" not in content and row.get("compress_content"):
                    content = decode_content(row["compress_content"], stats)
                if "<mmreader" not in content or len(content) > 4 * 1024 * 1024:
                    continue
                if not discover and not any(biz.rstrip("=") in content for biz in targets):
                    continue
                try:
                    root = ET.fromstring(content)
                except ET.ParseError:
                    stats["xmlFailures"] += 1
                    continue
                matched = set()
                for category in root.findall(".//mmreader/category"):
                    account_name = html.unescape(category.findtext("name") or "").strip()[:200]
                    username = category.findtext("username") or ""
                    for item in category.findall("item"):
                        parsed = public_article(item.findtext("url"))
                        if parsed is None:
                            continue
                        biz, article_id, url = parsed
                        if not discover and biz not in targets:
                            continue
                        account = accounts.setdefault(biz, dict(biz=biz, name=None, publicUsername=None, tableHints=set(), items={}, pushCount=0))
                        if account_name:
                            account["name"] = account_name
                        if re.fullmatch(r"gh_[a-zA-Z0-9_]+", username):
                            account["publicUsername"] = username
                        account["tableHints"].add(table)
                        matched.add(biz)
                        article = dict(id=article_id, url=url, title=html.unescape(item.findtext("title") or "")[:1000],
                            publishedAt=timestamp(item.findtext("pub_time") or item.findtext("time")), receivedAt=timestamp(row.get("create_time")))
                        old = account["items"].get(article_id)
                        if old is None or (not old["publishedAt"] and article["publishedAt"]):
                            account["items"][article_id] = article
                for biz in matched:
                    accounts[biz]["pushCount"] += 1
        output = []
        for biz in sorted(accounts.keys() if discover else targets.keys()):
            found = accounts.get(biz, dict(biz=biz, name=None, publicUsername=None, tableHints=set(), items={}, pushCount=0))
            items = sorted(found["items"].values(), key=lambda x: x["publishedAt"] or x["receivedAt"] or "", reverse=True)
            row = {k: found[k] for k in ("biz", "name", "publicUsername", "pushCount")}
            row.update(tableHints=sorted(found["tableHints"]), articleCount=len(items), latestPublishedAt=max((x["publishedAt"] for x in items if x["publishedAt"]), default=None))
            if not discover:
                row["items"] = items
            output.append(row)
        return dict(action="discover" if discover else "sync", checkedAt=datetime.now(timezone.utc).isoformat(), accounts=output,
            diagnostics=stats, databaseIntegrity="ok", completeAccountFeed=False, source="local-official-account-database")
    finally:
        con.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--targets-file", required=True)
    args = parser.parse_args()
    try:
        with open(args.targets_file, encoding="utf-8") as file:
            request = json.load(file)
        print(json.dumps(extract(sys.stdin.buffer.read(64 * 1024 * 1024 + 1), request), ensure_ascii=True))
    except Exception:
        print('{"error":"public_metadata_parse_failed"}', file=sys.stderr)
        sys.exit(1)
