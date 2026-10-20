"""Download model repositories from ModelScope: straight to the mirror (no proxy), big files in parallel segments,
every file checked against the sha256 the mirror lists.

    python tools\\tts\\fetch.py <target dir> <repo> [<repo> ...]
    python tools\\tts\\fetch.py tools\\qwen-tts\\checkpoints Qwen/Qwen3-TTS-12Hz-1.7B-Base

Each repository lands in its own new folder <target dir>/<last part of the repo name>. A file that is already there
with the right hash is skipped, so the script can be run again after a break.
"""
import hashlib
import json
import os
import sys
import threading
import time
import urllib.request

OPEN = urllib.request.build_opener(urllib.request.ProxyHandler({}))   # the proxy on this machine is slow for large files
AGENT = {"User-Agent": "Mozilla/5.0"}
SEGMENT = 64 * 2 ** 20
WORKERS = 6


def get(url, start=None, end=None, timeout=60):
    headers = dict(AGENT)
    if start is not None:
        headers["Range"] = f"bytes={start}-{end}"
    return OPEN.open(urllib.request.Request(url, headers=headers), timeout=timeout)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(2 ** 22), b""):
            h.update(block)
    return h.hexdigest()


def fetch(url, path, size):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    part = path + ".part"
    with open(part, "wb") as f:
        f.truncate(size)
    todo = [(a, min(size, a + SEGMENT) - 1) for a in range(0, size, SEGMENT)] or [(0, -1)]
    lock, failed = threading.Lock(), []

    def work():
        while True:
            with lock:
                if not todo or failed:
                    return
                a, b = todo.pop()
            for attempt in range(6):
                try:
                    with get(url, a, b) if size else get(url) as r, open(part, "r+b") as f:
                        f.seek(a)
                        got = 0
                        for block in iter(lambda: r.read(2 ** 20), b""):
                            f.write(block)
                            got += len(block)
                    if size and got != b - a + 1:
                        raise IOError(f"segment {a}-{b}: {got} bytes")
                    break
                except Exception as e:  # a dropped connection: try this segment again
                    if attempt == 5:
                        with lock:
                            failed.append(f"{a}-{b}: {e}")
                    time.sleep(2 + attempt * 2)

    threads = [threading.Thread(target=work) for _ in range(min(WORKERS, len(todo)))]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    if failed:
        raise IOError("; ".join(failed[:3]))
    os.replace(part, path)


target = sys.argv[1]
for repo in sys.argv[2:]:
    listing = f"https://modelscope.cn/api/v1/models/{repo}/repo/files?Revision=master&Recursive=true"
    with get(listing) as r:
        files = [f for f in json.load(r)["Data"]["Files"] if f["Type"] == "blob"]
    folder = os.path.join(target, repo.split("/")[-1])
    total = sum(f["Size"] for f in files)
    print(f"{repo}: {len(files)} files, {total / 1e9:.2f} GB -> {folder}", flush=True)
    t0, done = time.time(), 0
    for f in sorted(files, key=lambda f: f["Size"]):
        path = os.path.join(folder, *f["Path"].split("/"))
        if not (os.path.isfile(path) and os.path.getsize(path) == f["Size"] and (not f.get("Sha256") or sha256(path) == f["Sha256"])):
            fetch(f"https://modelscope.cn/models/{repo}/resolve/master/{f['Path']}", path, f["Size"])
            if f.get("Sha256") and sha256(path) != f["Sha256"]:
                os.remove(path)
                sys.exit(f"hash mismatch: {repo}/{f['Path']}")
        done += f["Size"]
        if f["Size"] > 2 ** 20:
            print(f"  ok {f['Size'] / 1e6:9.1f} MB  {f['Path']}   ({done / 1e9:.2f} of {total / 1e9:.2f} GB, {time.time() - t0:.0f}s)", flush=True)
    print(f"{repo}: all {len(files)} files present and verified", flush=True)
print("done", flush=True)
