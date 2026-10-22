"""Read an authenticated in-memory public-account DB; emit only target articles."""
import argparse
from compression import zstd
from datetime import datetime, timezone
import html
import json
import re
import sqlite3
import sys
import urllib.parse
import xml.etree.ElementTree as ET


def canonical(raw, biz):
    try:
        u = urllib.parse.urlsplit(html.unescape(raw or ""))
        p = urllib.parse.parse_qs(u.query)
        if u.hostname != "mp.weixin.qq.com" or u.path != "/s" or p.get("__biz") != [biz]:
            return None
        values = {k: p[k][0] for k in ("__biz", "mid", "idx", "sn")}
        if not re.fullmatch(r"\d+", values["mid"]) or not re.fullmatch(r"\d+", values["idx"]) or not re.fullmatch(r"[0-9a-fA-F]{32}", values["sn"]):
            return None
        return "https://mp.weixin.qq.com/s?" + urllib.parse.urlencode(values)
    except (ValueError, KeyError, IndexError):
        return None


def text_content(value, stats):
    if isinstance(value, str):
        return value
    if not isinstance(value, bytes):
        return ""
    if value.startswith(b"\x28\xb5\x2f\xfd"):
        try:
            decoder = zstd.ZstdDecompressor()
            value = decoder.decompress(value, 4 * 1024 * 1024)
            if not decoder.eof:
                stats["decodeFailures"] += 1
                return ""
            stats["zstdDecoded"] += 1
        except zstd.ZstdError:
            stats["decodeFailures"] += 1
            return ""
    return value.decode("utf-8", errors="replace")


def extract(db_bytes, biz, account_table=None):
    con = sqlite3.connect(":memory:")
    con.deserialize(db_bytes)
    con.execute("PRAGMA query_only=ON")
    checks = [r[0] for r in con.execute("PRAGMA quick_check")]
    if checks != ["ok"]:
        raise ValueError("In-memory database integrity check failed")
    tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'") if re.fullmatch(r"Msg_[0-9a-fA-F]{32}", r[0])]
    if account_table:
        if account_table not in tables:
            raise ValueError("Previously identified account table is absent")
        tables = [account_table]
    stats = dict(messageTables=len(tables), rowsExamined=0, zstdDecoded=0, decodeFailures=0, targetRows=0, xmlFailures=0)
    items = {}
    marker = biz.rstrip("=")
    target_tables = set()
    for table in tables:
        columns = {r[1] for r in con.execute(f'PRAGMA table_info("{table}")')}
        if "message_content" not in columns:
            continue
        selected = [x for x in ("message_content", "compress_content", "create_time", "local_id", "server_id") if x in columns]
        query = f'SELECT {", ".join(selected)} FROM "{table}"'
        for values in con.execute(query):
            stats["rowsExamined"] += 1
            row = dict(zip(selected, values))
            content = text_content(row["message_content"], stats)
            if marker not in content and row.get("compress_content"):
                content = text_content(row["compress_content"], stats)
            if marker not in content or len(content) > 4 * 1024 * 1024:
                continue
            stats["targetRows"] += 1
            target_tables.add(table)
            try:
                root = ET.fromstring(content)
            except ET.ParseError:
                stats["xmlFailures"] += 1
                continue
            for item in root.findall(".//mmreader/category/item"):
                url = canonical(item.findtext("url"), biz)
                if not url:
                    continue
                stamp = item.findtext("pub_time") or item.findtext("time")
                pub_time = int(stamp) if stamp and stamp.isdigit() and 946684800 <= int(stamp) <= 4102444800 else None
                p = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
                article = dict(id=f'{biz}:{p["mid"][0]}:{p["idx"][0]}', url=url,
                    title=html.unescape(item.findtext("title") or "")[:1000],
                    publishedAt=datetime.fromtimestamp(pub_time, timezone.utc).isoformat() if pub_time else None,
                    receivedAt=datetime.fromtimestamp(row["create_time"], timezone.utc).isoformat() if isinstance(row.get("create_time"), int) and 946684800 <= row["create_time"] <= 4102444800 else None,
                    localMessageId=row.get("local_id"))
                if article["id"] not in items or not items[article["id"]]["publishedAt"]:
                    items[article["id"]] = article
    con.close()
    return dict(biz=biz, checkedAt=datetime.now(timezone.utc).isoformat(), source="local-official-account-database", completeAccountFeed=False,
        requiresWeRead=False, databaseIntegrity="ok", targetMessageTables=len(target_tables),
        accountTable=next(iter(target_tables)) if len(target_tables) == 1 else None,
        articleCount=len(items), items=sorted(items.values(), key=lambda x: x["publishedAt"] or x["receivedAt"] or "", reverse=True),
        diagnostics=stats, credentialValuesIncluded=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--biz", required=True)
    parser.add_argument("--table")
    args = parser.parse_args()
    try:
        result = extract(sys.stdin.buffer.read(64 * 1024 * 1024 + 1), args.biz, args.table)
        print(json.dumps(result, ensure_ascii=True))
    except Exception:
        print('{"error":"Target metadata parsing failed; no database content was logged."}', file=sys.stderr)
        sys.exit(1)
