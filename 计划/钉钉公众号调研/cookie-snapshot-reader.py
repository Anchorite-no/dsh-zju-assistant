"""Read a supplied in-memory snapshot; select only the target MP root cookies.

This is an internal pipe helper. The caller retains its encrypted output in
memory and never forwards it to logs or conversation output.
"""
import base64
import json
import sqlite3
import sys

data = sys.stdin.buffer.read(1024 * 1024 + 1)
if len(data) > 1024 * 1024:
    raise ValueError("snapshot too large")
db = sqlite3.connect(":memory:")
db.deserialize(data)
if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
    raise ValueError("inconsistent snapshot")
version = int(db.execute("SELECT value FROM meta WHERE key='version'").fetchone()[0])
rows = []
metadata = []
for host, name, path, updated, frame in db.execute(
    "SELECT host_key,name,path,last_update_utc,top_frame_site_key FROM cookies WHERE host_key IN (?,?,?,?)",
    ("mp.weixin.qq.com", ".mp.weixin.qq.com", "weixin.qq.com", ".weixin.qq.com"),
):
    metadata.append({"host": host, "name": name, "path": path,
                     "updatedChromeMicros": str(updated), "partitioned": bool(frame)})
for host, name, path, value, encrypted, updated in db.execute(
    "SELECT host_key,name,path,value,encrypted_value,last_update_utc FROM cookies WHERE host_key=? AND path=?",
    ("mp.weixin.qq.com", "/"),
):
    rows.append({"host_key": host, "name": name, "path": path, "value": value,
                 "encrypted_value": base64.b64encode(encrypted).decode(), "updatedChromeMicros": str(updated)})
db.close()
print(json.dumps({"version": version, "rows": rows, "metadata": metadata}))
