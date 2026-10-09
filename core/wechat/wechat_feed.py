"""Reusable local public-account feed CLI. All stdout is JSON.

No daemon is started, no UI is controlled, and no credentials are persisted.
The host application may invoke `sync --due` on its own timer.
"""
import argparse
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import urllib.parse

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("wechat_metadata", ROOT / "backend" / "metadata.py")
metadata = importlib.util.module_from_spec(spec)
spec.loader.exec_module(metadata)

ERRORS = {
    "plugin_disabled": "微信公众号插件已关闭，请先在插件页打开。",
    "wechat_not_running": "等待电脑版微信运行并登录，已保存的文章仍可读取。",
    "wechat_database_missing": "尚未找到本地公众号库，请先在电脑版微信登录并同步公众号消息。",
    "multiple_wechat_processes": "检测到多个微信主进程，当前版本需要明确的单个微信实例。",
    "multiple_wechat_profiles": "检测到多个本地微信资料目录，当前版本不自动选择账号。",
    "wechat_process_unreadable": "当前权限无法读取微信进程。",
    "wechat_session_or_version_unavailable": "无法验证本地读取能力，请核对微信登录状态；当前版本也可能需要适配。",
    "snapshot_verification_failed": "本地快照未通过校验，保留上次成功结果，稍后重试。",
    "local_reader_failed": "本地读取失败，保留上次成功结果。",
    "article_identity_unavailable": "该文章未返回可识别的公众号信息，可从本地公众号列表选择。",
    "runtime_missing": "需要 Windows、PowerShell 7.5+ 和 Python 3.14+。",
    "reader_timeout": "本地读取超时，保留上次成功结果。",
    "wechat_account_changed": "当前微信资料目录与原绑定不同，已暂停写入，避免混合账号数据。",
    "account_not_found": "本地列表中未找到该公众号，请先让微信同步其推送，或用一篇文章链接登记。",
    "ambiguous_account_name": "名称对应多个公众号，请从本地列表中选定 biz。",
    "not_registered": "公众号尚未添加。",
    "busy": "另一次更新正在进行，请稍后重试。",
}


class FeedError(Exception):
    def __init__(self, code, source=None):
        self.code = code
        self.source = source
        super().__init__(ERRORS.get(code, "操作失败，已有结果保留。"))


def now():
    return datetime.now(timezone.utc).isoformat()


def later(stamp, seconds):
    return (datetime.fromisoformat(stamp) + timedelta(seconds=seconds)).isoformat()


def powershell(script, *arguments):
    executable = shutil.which("pwsh")
    if os.name != "nt" or not executable or sys.version_info < (3, 14):
        raise FeedError("runtime_missing")
    try:
        child = subprocess.run([executable, "-NoProfile", "-File", str(ROOT / "backend" / script), *arguments],
            capture_output=True, encoding="utf-8", errors="replace", timeout=100,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except subprocess.TimeoutExpired:
        raise FeedError("reader_timeout") from None
    try:
        result = json.loads(child.stdout)
    except ValueError:
        raise FeedError("local_reader_failed") from None
    if not result.get("ok"):
        code = result.get("error", {}).get("code", "local_reader_failed")
        raise FeedError(code if code in ERRORS else "local_reader_failed", result.get("source"))
    return result


def local_snapshot(request):
    # The manifest contains only public biz IDs and opaque table hints.
    with tempfile.TemporaryDirectory(prefix="campus-wechat-request-") as directory:
        path = Path(directory) / "accounts.json"
        path.write_text(json.dumps(request), encoding="utf-8")
        return powershell("read-local.ps1", "-TargetsPath", str(path), "-PythonPath", sys.executable)


def safe_seed(raw):
    try:
        url = urllib.parse.urlsplit(raw)
        if url.scheme != "https" or url.hostname != "mp.weixin.qq.com" or url.username or url.port not in (None, 443) or not (url.path == "/s" or url.path.startswith("/s/")):
            raise ValueError("Invalid article URL")
        values = urllib.parse.parse_qs(url.query)
        public = {k: values[k][0] for k in ("__biz", "mid", "idx", "sn") if k in values and len(values[k]) == 1}
        clean = urllib.parse.urlunsplit(("https", "mp.weixin.qq.com", url.path, urllib.parse.urlencode(public) if url.path == "/s" else "", ""))
        return clean, public.get("__biz")
    except ValueError:
        raise FeedError("article_identity_unavailable") from None


class FeedStore:
    def __init__(self, path, reader=local_snapshot):
        self.path = Path(path)
        self.path.mkdir(parents=True, exist_ok=True)
        self.reader = reader
        self.db = sqlite3.connect(self.path / "feeds.sqlite", timeout=3)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS accounts (
          biz TEXT PRIMARY KEY, name TEXT NOT NULL, seed_url TEXT, enabled INTEGER NOT NULL DEFAULT 1,
          interval_seconds INTEGER NOT NULL DEFAULT 120, registered_at TEXT NOT NULL,
          baseline_at TEXT, source_id TEXT, table_hints TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'pending', last_attempt TEXT, last_success TEXT, next_due TEXT,
          failure_count INTEGER NOT NULL DEFAULT 0, last_new_count INTEGER NOT NULL DEFAULT 0,
          last_import_count INTEGER NOT NULL DEFAULT 0, error_code TEXT);
        CREATE TABLE IF NOT EXISTS articles (
          biz TEXT NOT NULL, id TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL,
          published_at TEXT, received_at TEXT, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
          PRIMARY KEY (biz,id));
        CREATE TABLE IF NOT EXISTS events (
          event_id INTEGER PRIMARY KEY AUTOINCREMENT, biz TEXT NOT NULL, article_id TEXT NOT NULL,
          discovered_at TEXT NOT NULL, is_backfill INTEGER NOT NULL, UNIQUE (biz,article_id));
        CREATE TABLE IF NOT EXISTS inventory (
          biz TEXT PRIMARY KEY, name TEXT NOT NULL, table_hints TEXT NOT NULL,
          article_count INTEGER NOT NULL, latest_published_at TEXT, source_id TEXT NOT NULL,
          checked_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS version_observations (
          version TEXT PRIMARY KEY, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
          last_verified_at TEXT, verified_runs INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS runtime_state (
          id INTEGER PRIMARY KEY CHECK(id=1), source_json TEXT NOT NULL, observed_at TEXT NOT NULL,
          verified INTEGER NOT NULL);
        """)

    @contextmanager
    def write(self):
        try:
            self.db.execute("BEGIN IMMEDIATE")
        except sqlite3.OperationalError:
            raise FeedError("busy") from None
        try:
            yield
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def close(self):
        self.db.close()

    def record_runtime(self, source, stamp, verified):
        if not source or not source.get("wechatVersion"):
            return
        version = source["wechatVersion"]
        self.db.execute("INSERT INTO version_observations VALUES (?,?,?,?,?) ON CONFLICT(version) DO UPDATE SET last_seen_at=excluded.last_seen_at,last_verified_at=COALESCE(excluded.last_verified_at,version_observations.last_verified_at),verified_runs=version_observations.verified_runs+excluded.verified_runs", (
            version, stamp, stamp, stamp if verified else None, int(verified)))
        self.db.execute("INSERT OR REPLACE INTO runtime_state VALUES (1,?,?,?)", (json.dumps(source), stamp, int(verified)))

    def runtime(self):
        row = self.db.execute("SELECT * FROM runtime_state WHERE id=1").fetchone()
        current = dict(source=json.loads(row["source_json"]), observedAt=row["observed_at"], lastAttemptVerified=bool(row["verified"])) if row else None
        observations = [dict(x) for x in self.db.execute("SELECT version,first_seen_at AS firstSeenAt,last_seen_at AS lastSeenAt,last_verified_at AS lastVerifiedAt,verified_runs AS verifiedRuns FROM version_observations ORDER BY last_seen_at DESC")]
        return dict(lastObserved=current, versionHistory=observations)

    def discover(self, query=None):
        result = self.reader({"action": "discover"})
        meta = result["snapshot"]["metadata"]
        with self.write():
            self.record_runtime(result["source"], meta["checkedAt"], True)
            for item in meta["accounts"]:
                name = item.get("name") or item.get("publicUsername") or f'公众号 {metadata.numeric_id(item["biz"])}'
                self.db.execute("INSERT OR REPLACE INTO inventory VALUES (?,?,?,?,?,?,?)", (
                    item["biz"], name, json.dumps(item["tableHints"]), item["articleCount"], item["latestPublishedAt"], result["source"]["sourceId"], meta["checkedAt"]))
        accounts = [dict(biz=x["biz"], name=x.get("name") or x.get("publicUsername") or f'公众号 {metadata.numeric_id(x["biz"])}',
            articleCount=x["articleCount"], latestPublishedAt=x["latestPublishedAt"]) for x in meta["accounts"]]
        if query:
            accounts = [x for x in accounts if query.casefold() in x["name"].casefold() or query == x["biz"]]
        return dict(ok=True, checkedAt=meta["checkedAt"], accounts=accounts, source=result["source"], diagnostics=meta["diagnostics"], completeAccountFeed=False)

    def add(self, *, name=None, biz=None, article_url=None, label=None, interval=120):
        if not 60 <= interval <= 86400:
            raise ValueError("Interval must be between 60 and 86400 seconds")
        seed = None
        if article_url:
            seed, biz = safe_seed(article_url)
            if not biz:
                identified = powershell("identify-account.ps1", "-ArticleUrl", seed)
                biz, label = identified["biz"], label or identified.get("name")
        elif name:
            discovered = self.discover(name)["accounts"]
            exact = [x for x in discovered if x["name"] == name]
            matches = exact or discovered
            if not matches:
                raise FeedError("account_not_found")
            if len(matches) != 1:
                raise FeedError("ambiguous_account_name")
            biz, label = matches[0]["biz"], label or matches[0]["name"]
        metadata.numeric_id(biz)
        known = self.db.execute("SELECT * FROM inventory WHERE biz=?", (biz,)).fetchone()
        previous = self.db.execute("SELECT * FROM accounts WHERE biz=?", (biz,)).fetchone()
        chosen_name = label or (previous["name"] if previous else None) or (known["name"] if known else None) or f"公众号 {metadata.numeric_id(biz)}"
        with self.write():
            if previous:
                self.db.execute("UPDATE accounts SET name=?, seed_url=COALESCE(?,seed_url), interval_seconds=? WHERE biz=?", (chosen_name, seed, interval, biz))
            else:
                self.db.execute("INSERT INTO accounts(biz,name,seed_url,interval_seconds,registered_at,source_id,table_hints) VALUES (?,?,?,?,?,?,?)", (
                    biz, chosen_name, seed, interval, now(), known["source_id"] if known else None, known["table_hints"] if known else "[]"))
        return dict(ok=True, account=self.get(biz), alreadyRegistered=previous is not None)

    def get(self, biz):
        row = self.db.execute("SELECT a.*, (SELECT count(*) FROM articles r WHERE r.biz=a.biz) AS article_count FROM accounts a WHERE biz=?", (biz,)).fetchone()
        if row is None:
            raise FeedError("not_registered")
        return dict(biz=row["biz"], name=row["name"], enabled=bool(row["enabled"]), intervalSeconds=row["interval_seconds"],
            status="paused" if not row["enabled"] else row["status"], articleCount=row["article_count"],
            lastAttemptAt=row["last_attempt"], lastSuccessfulSyncAt=row["last_success"], nextDueAt=row["next_due"],
            newlyDiscoveredCount=row["last_new_count"], initialImportCount=row["last_import_count"],
            errorCode=row["error_code"], message=ERRORS.get(row["error_code"]), completeAccountFeed=False)

    def list(self):
        return dict(ok=True, accounts=[self.get(x[0]) for x in self.db.execute("SELECT biz FROM accounts ORDER BY name")], runtime=self.runtime())

    def enabled(self, biz, value):
        self.get(biz)
        with self.write():
            self.db.execute("UPDATE accounts SET enabled=?,next_due=NULL WHERE biz=?", (int(value), biz))
        return dict(ok=True, account=self.get(biz))

    def failure(self, row, code, stamp):
        delay = min(1800, row["interval_seconds"] * 2 ** min(row["failure_count"], 4))
        self.db.execute("UPDATE accounts SET status=?,last_attempt=?,next_due=?,failure_count=failure_count+1,last_new_count=0,last_import_count=0,error_code=? WHERE biz=?", (
            code, stamp, later(stamp, delay), code, row["biz"]))

    def sync(self, biz=None, due=False):
        stamp = now()
        with self.write():
            rows = list(self.db.execute("SELECT * FROM accounts WHERE enabled=1"))
            if biz:
                self.get(biz)
                rows = [r for r in rows if r["biz"] == biz]
            if due:
                rows = [r for r in rows if not r["next_due"] or r["next_due"] <= stamp]
            if not rows:
                return dict(ok=True, status="no_accounts_due", accounts=[])
            request = [dict(biz=r["biz"], tableHints=json.loads(r["table_hints"])) for r in rows]
            try:
                result = self.reader(request)
            except FeedError as error:
                self.record_runtime(error.source, stamp, False)
                for row in rows:
                    self.failure(row, error.code, stamp)
                return dict(ok=False, error=dict(code=error.code, message=str(error)), accounts=[self.get(r["biz"]) for r in rows])
            meta = result["snapshot"]["metadata"]
            self.record_runtime(result["source"], meta["checkedAt"], True)
            found = {a["biz"]: a for a in meta["accounts"]}
            source_id = result["source"]["sourceId"]
            partial = bool(meta["diagnostics"]["decodeFailures"] or meta["diagnostics"]["xmlFailures"] or result["source"].get("additionalShards"))
            failures = False
            for row in rows:
                if row["source_id"] and row["source_id"] != source_id:
                    self.failure(row, "wechat_account_changed", stamp)
                    failures = True
                    continue
                data = found.get(row["biz"])
                if data is None:
                    self.failure(row, "local_reader_failed", stamp)
                    failures = True
                    continue
                imported = 0
                discovered = 0
                for article in data["items"]:
                    if metadata.public_article(article["url"]) != (row["biz"], article["id"], article["url"]):
                        raise ValueError("Reader returned a mismatched public article")
                    cursor = self.db.execute("INSERT OR IGNORE INTO articles VALUES (?,?,?,?,?,?,?,?)", (
                        row["biz"], article["id"], article["title"], article["url"], article["publishedAt"], article["receivedAt"], stamp, stamp))
                    if cursor.rowcount:
                        if row["baseline_at"]:
                            discovered += 1
                            backfill = bool(article["publishedAt"] and article["publishedAt"] < row["baseline_at"])
                            self.db.execute("INSERT OR IGNORE INTO events(biz,article_id,discovered_at,is_backfill) VALUES (?,?,?,?)", (row["biz"], article["id"], stamp, int(backfill)))
                        else:
                            imported += 1
                    else:
                        self.db.execute("UPDATE articles SET title=?,url=?,published_at=COALESCE(?,published_at),received_at=COALESCE(?,received_at),last_seen_at=? WHERE biz=? AND id=?", (
                            article["title"], article["url"], article["publishedAt"], article["receivedAt"], stamp, row["biz"], article["id"]))
                status = "partial_local_read" if partial else ("synced_local_cache" if data["items"] else "waiting_for_local_messages")
                baseline = row["baseline_at"] or (stamp if data["items"] else None)
                success = stamp if status == "synced_local_cache" else row["last_success"]
                self.db.execute("UPDATE accounts SET source_id=?,table_hints=?,status=?,last_attempt=?,last_success=?,next_due=?,failure_count=0,last_new_count=?,last_import_count=?,error_code=NULL,baseline_at=? WHERE biz=?", (
                    source_id, json.dumps(data["tableHints"] or json.loads(row["table_hints"])), status, stamp, success, later(stamp, row["interval_seconds"]), discovered, imported, baseline, row["biz"]))
            return dict(ok=not failures, status="some_accounts_unavailable" if failures else ("partial_local_read" if partial else "finished"), accounts=[self.get(r["biz"]) for r in rows], diagnostics=meta["diagnostics"], source=result["source"], completeAccountFeed=False)

    def articles(self, biz=None, limit=50):
        sql = "SELECT biz,id,title,url,published_at AS publishedAt,received_at AS receivedAt,first_seen_at AS firstSeenAt FROM articles"
        params = []
        if biz:
            sql += " WHERE biz=?"
            params.append(biz)
        sql += " ORDER BY COALESCE(published_at,received_at,first_seen_at) DESC LIMIT ?"
        params.append(limit)
        return dict(ok=True, articles=[dict(x) for x in self.db.execute(sql, params)], completeAccountFeed=False)

    def events(self, after=0, limit=100):
        rows = [dict(x) for x in self.db.execute("""SELECT e.event_id AS eventId,e.biz,e.article_id AS articleId,e.discovered_at AS discoveredAt,e.is_backfill AS isBackfill,
            a.title,a.url,a.published_at AS publishedAt FROM events e JOIN articles a ON a.biz=e.biz AND a.id=e.article_id WHERE e.event_id>? ORDER BY e.event_id LIMIT ?""", (after, limit))]
        return dict(ok=True, events=rows, nextCursor=rows[-1]["eventId"] if rows else after)


def main():
    parser = argparse.ArgumentParser(description="微信公众号本地订阅模块，输出 JSON")
    parser.add_argument("--data-dir", default=os.environ.get("CAMPUS_WECHAT_DATA_DIR") or str(Path(os.environ.get("APPDATA", str(Path.home()))) / "CampusAgent" / "wechat-feeds"))
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("doctor")
    discover = commands.add_parser("discover")
    discover.add_argument("--query")
    add = commands.add_parser("add")
    identity = add.add_mutually_exclusive_group(required=True)
    identity.add_argument("--name")
    identity.add_argument("--biz")
    identity.add_argument("--article-url")
    add.add_argument("--label")
    add.add_argument("--interval", type=int, default=120)
    commands.add_parser("list")
    for action in ("pause", "resume"):
        command = commands.add_parser(action)
        command.add_argument("--biz", required=True)
    sync = commands.add_parser("sync")
    sync.add_argument("--biz")
    sync.add_argument("--due", action="store_true")
    articles = commands.add_parser("articles")
    articles.add_argument("--biz")
    articles.add_argument("--limit", type=int, default=50)
    events = commands.add_parser("events")
    events.add_argument("--after-id", type=int, default=0)
    events.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()
    if os.environ.get('CAMPUS_WECHAT_DISABLED') == '1':
        raise FeedError('plugin_disabled')
    if args.command == "doctor":
        return powershell("read-local.ps1", "-Doctor")
    store = FeedStore(args.data_dir)
    try:
        if args.command == "discover":
            return store.discover(args.query)
        if args.command == "add":
            return store.add(name=args.name, biz=args.biz, article_url=args.article_url, label=args.label, interval=args.interval)
        if args.command == "list":
            return store.list()
        if args.command in ("pause", "resume"):
            return store.enabled(args.biz, args.command == "resume")
        if args.command == "sync":
            return store.sync(args.biz, args.due)
        if args.command == "articles":
            return store.articles(args.biz, max(1, min(args.limit, 1000)))
        return store.events(max(0, args.after_id), max(1, min(args.limit, 1000)))
    finally:
        store.close()


if __name__ == "__main__":
    try:
        result = main()
    except FeedError as error:
        result = dict(ok=False, error=dict(code=error.code, message=str(error)), source=error.source)
    except Exception:
        result = dict(ok=False, error=dict(code="operation_failed", message="操作未完成，已有结果保留。"))
    print(json.dumps(result, ensure_ascii=True))
    sys.exit(0 if result.get("ok") else 1)
