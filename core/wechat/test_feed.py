"""Public synthetic fixtures only; these tests never access WeChat or the network."""
from compression import zstd
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

import wechat_feed as feed

BIZ_A = "MTIzNDU2Nzg5MA=="
BIZ_B = "OTg3NjU0MzIxMA=="
SOURCE = dict(sourceId="synthetic-profile", wechatVersion="4.1.15.13", testedVersion="4.1.15.13", additionalShards=0)


def fixture(extra=False):
    db = sqlite3.connect(":memory:")
    for token, biz, name in (("a", BIZ_A, "示例甲"), ("b", BIZ_B, "示例乙")):
        table = "Msg_" + token * 32
        db.execute(f"CREATE TABLE {table}(message_content BLOB,create_time INTEGER,local_id INTEGER)")
        count = 3 if extra and biz == BIZ_A else 2
        items = "".join(f"<item><title>文章 {i}</title><url><![CDATA[https://mp.weixin.qq.com/s?__biz={biz}&mid=123&idx={i}&sn={'c'*32}&key=REDACT_TEST]]></url><pub_time>1700000000</pub_time></item>" for i in range(1, count + 1))
        xml = f"<msg><appmsg><mmreader><category><name>{name}</name><username>gh_synthetic_{token}</username>{items}</category></mmreader></appmsg></msg>"
        db.execute(f"INSERT INTO {table} VALUES(?,?,?)", (zstd.compress(xml.encode()), 1700000010, 1))
    db.commit()
    result = db.serialize()
    db.close()
    return result


class FeedTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="campus-wechat-test-")
        self.calls = []
        self.extra = False
        self.error = None
        self.source = dict(SOURCE)
        self.store = feed.FeedStore(self.temporary.name, self.reader)

    def tearDown(self):
        self.store.close()
        self.temporary.cleanup()

    def reader(self, request):
        self.calls.append(request)
        if self.error:
            raise self.error
        meta = feed.metadata.extract(fixture(self.extra), request)
        return dict(ok=True, source=self.source, snapshot=dict(metadata=meta))

    def test_local_discovery_and_add_by_name_needs_no_article(self):
        result = self.store.discover()
        self.assertEqual({x["name"] for x in result["accounts"]}, {"示例甲", "示例乙"})
        self.assertNotIn("items", result["accounts"][0])
        account = self.store.add(name="示例甲")["account"]
        self.assertEqual(account["biz"], BIZ_A)
        self.assertEqual(self.store.db.execute("SELECT seed_url FROM accounts").fetchone()[0], None)

    def test_multi_account_one_snapshot_and_durable_deduplicated_events(self):
        self.store.add(biz=BIZ_A)
        self.store.add(biz=BIZ_B)
        first = self.store.sync()
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(len(self.calls[0]), 2)
        self.assertEqual([a["articleCount"] for a in first["accounts"]], [2, 2])
        self.assertEqual(self.store.events()["events"], [])
        self.extra = True
        second = self.store.sync()
        self.assertEqual([a["newlyDiscoveredCount"] for a in second["accounts"]], [1, 0])
        self.store.sync()
        events = self.store.events()
        self.assertEqual(len(events["events"]), 1)
        self.assertTrue(events["events"][0]["isBackfill"])
        cursor = events["nextCursor"]
        self.store.close()
        self.store = feed.FeedStore(self.temporary.name, self.reader)
        self.assertEqual(self.store.events(after=cursor)["events"], [])
        self.assertEqual(len(self.store.articles(BIZ_A)["articles"]), 3)

    def test_offline_keeps_articles_success_time_and_recovers_on_retry(self):
        self.store.add(biz=BIZ_A)
        self.store.sync()
        successful = self.store.get(BIZ_A)["lastSuccessfulSyncAt"]
        self.error = feed.FeedError("wechat_not_running")
        failed = self.store.sync()
        self.assertFalse(failed["ok"])
        self.assertEqual(self.store.get(BIZ_A)["articleCount"], 2)
        self.assertEqual(self.store.get(BIZ_A)["lastSuccessfulSyncAt"], successful)
        self.assertEqual(self.store.get(BIZ_A)["status"], "wechat_not_running")
        self.error = None
        self.assertEqual(self.store.sync()["accounts"][0]["status"], "synced_local_cache")

    def test_due_and_paused_accounts_do_not_read(self):
        self.store.add(biz=BIZ_A)
        self.store.sync()
        count = len(self.calls)
        self.assertEqual(self.store.sync(due=True)["status"], "no_accounts_due")
        self.store.enabled(BIZ_A, False)
        self.store.sync()
        self.assertEqual(len(self.calls), count)
        self.store.enabled(BIZ_A, True)
        self.store.sync(due=True)
        self.assertEqual(len(self.calls), count + 1)

    def test_profile_change_never_merges_data(self):
        self.store.add(biz=BIZ_A)
        self.store.sync()
        self.source["sourceId"] = "different-profile"
        self.extra = True
        result = self.store.sync()
        self.assertFalse(result["ok"])
        self.assertEqual(self.store.get(BIZ_A)["status"], "wechat_account_changed")
        self.assertEqual(self.store.get(BIZ_A)["articleCount"], 2)
        self.assertEqual(self.store.events()["events"], [])

    def test_version_observations_include_failed_new_version(self):
        self.store.add(biz=BIZ_A)
        self.store.sync()
        upgraded = dict(SOURCE, wechatVersion="4.1.99.1")
        self.error = feed.FeedError("wechat_session_or_version_unavailable", upgraded)
        self.store.sync()
        runtime = self.store.runtime()
        self.assertEqual(len(runtime["versionHistory"]), 2)
        self.assertFalse(runtime["lastObserved"]["lastAttemptVerified"])
        self.assertEqual(runtime["versionHistory"][0]["verifiedRuns"], 0)
        self.assertIsNone(runtime["versionHistory"][0]["lastVerifiedAt"])

    def test_no_credentials_and_account_filtering(self):
        parsed = feed.metadata.extract(fixture(), [dict(biz=BIZ_A)])
        self.assertEqual(len(parsed["accounts"]), 1)
        self.assertEqual(parsed["accounts"][0]["articleCount"], 2)
        self.assertNotIn("REDACT_TEST", json.dumps(parsed))
        url = f"https://mp.weixin.qq.com/s?__biz={BIZ_A}&mid=123&idx=1&sn={'c'*32}&key=REDACT_TEST#secret"
        clean, biz = feed.safe_seed(url)
        self.assertNotIn("REDACT_TEST", clean)
        self.assertNotIn("secret", clean)
        self.assertEqual(biz, BIZ_A)
        with self.assertRaises(feed.FeedError):
            feed.safe_seed("https://mp.weixin.qq.com@evil.example/s/x")


if __name__ == "__main__":
    unittest.main(verbosity=2)
