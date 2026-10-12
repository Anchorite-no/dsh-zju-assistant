"""Read every public-account article from a decrypted DB image on stdin; print JSON on stdout."""
from compression import zstd
from datetime import datetime, timedelta, timezone
import html
import json
import re
import sqlite3
import sys
import urllib.parse
import xml.etree.ElementTree as ET

BEIJING = timezone(timedelta(hours=8))
LINK_KEYS = ("__biz", "mid", "idx", "sn")


def public_article(raw):
    """(biz, article id, clean link) for a public-account article link, else None."""
    try:
        url = urllib.parse.urlsplit(html.unescape(raw or ""))
    except ValueError:
        return None
    params = urllib.parse.parse_qs(url.query)
    if url.hostname != "mp.weixin.qq.com" or url.path != "/s" or not all(key in params for key in LINK_KEYS):
        return None
    p = {key: params[key][0] for key in LINK_KEYS}
    return p["__biz"], f'{p["__biz"]}:{p["mid"]}:{p["idx"]}', "https://mp.weixin.qq.com/s?" + urllib.parse.urlencode(p)


def decode_content(value):
    if isinstance(value, bytes):
        try:
            if value.startswith(b"\x28\xb5\x2f\xfd"):
                value = zstd.decompress(value)
            return value.decode("utf-8", errors="replace")
        except zstd.ZstdError:
            return ""
    return value if isinstance(value, str) else ""


def timestamp(value):
    try:
        return datetime.fromtimestamp(int(value), BEIJING).isoformat() if int(value) > 0 else None
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def extract(db_bytes):
    con = sqlite3.connect(":memory:")
    try:
        con.deserialize(db_bytes)
        accounts = {}
        tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'") if re.fullmatch(r"Msg_[0-9a-fA-F]{32}", r[0])]
        for table in sorted(tables):
            columns = {r[1] for r in con.execute(f'PRAGMA table_info("{table}")')}
            if "message_content" not in columns:
                continue
            selected = [x for x in ("message_content", "compress_content", "create_time") if x in columns]
            for values in con.execute(f'SELECT {", ".join(selected)} FROM "{table}"'):
                row = dict(zip(selected, values))
                content = decode_content(row["message_content"])
                if "<mmreader" not in content:
                    content = decode_content(row.get("compress_content"))
                if "<mmreader" not in content:
                    continue
                try:
                    root = ET.fromstring(content)
                except ET.ParseError:
                    continue
                for category in root.findall(".//mmreader/category"):
                    name = html.unescape(category.findtext("name") or "").strip()
                    for item in category.findall("item"):
                        parsed = public_article(item.findtext("url"))
                        if parsed is None:
                            continue
                        biz, article_id, url = parsed
                        account = accounts.setdefault(biz, dict(biz=biz, name="", articles={}))
                        if name:
                            account["name"] = name
                        account["articles"].setdefault(article_id, dict(id=article_id, title=html.unescape(item.findtext("title") or ""), url=url,
                            publishedAt=timestamp(item.findtext("pub_time") or item.findtext("time")) or timestamp(row.get("create_time"))))
        for account in accounts.values():
            account["articles"] = sorted(account["articles"].values(), key=lambda a: a["publishedAt"] or "", reverse=True)
        return dict(accounts=sorted(accounts.values(), key=lambda a: a["name"]))
    finally:
        con.close()


if __name__ == "__main__":
    print(json.dumps(extract(sys.stdin.buffer.read()), ensure_ascii=True))
