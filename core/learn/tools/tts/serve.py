"""常驻的配音服务：讲解的 HTML 播放时，缺配音的句子由它现场合成。朗读器（tts app）的后台也是它。

    tts serve --voice 咲来

模型只加载一次，一直留在显存里（约 7GB 显存、10GB 系统提交内存），用完按 Ctrl+C 关掉。
合成过的句子按指纹存进 out\\tts-cache，同样的语言、文本、音色再要时直接给，
所以改稿后重新打开 HTML，只有改过的句子需要等。只在本机 127.0.0.1 上监听。

讲解的 HTML 用到的接口：
    GET  /status                      模型是否就绪，当前音色和它说的语言（lang，取自 voice.json），有哪些音色；
                                      还在加载时 progress 是加载到几成（0 到 1）；没加载起来时 error 是 memory（内存不够）或 failed，detail 是原话
    POST /cached {lang, lines}        这些句子里哪些已经有配音，各多长（不合成）
    POST /speak  {lang, text, mood}   要一句配音，没有就现场合成；返回指纹和时长。mood 可以不给：
                                      八种情感的权重，各 0 到 1，顺序见 engine.MOODS（/cached 的每一句也可以带）
    GET  /audio/<指纹>.mp3            取音频
朗读器的界面另外用到（只接受它自己发来的请求）：
    GET  /                            界面
    GET  /fonts/<目录>/<文件>          界面和讲解画面用的字体（tools\\tts\\fonts 下的 ttf、woff2）
    GET  /opened                      启动时指定要打开的 HTML
    GET  /films                       dist 下的文件夹和 HTML，一层套一层（侧边栏的"文件"）
    GET  /film/<相对 dist 的路径>      取其中一个 HTML
    POST /voice  {name}               换音色
    POST /export {title, srt, txt}    把字幕存到 out\\subtitles
    POST /reveal                      在资源管理器里打开 out\\subtitles
    POST /bye                         窗口关了，服务跟着退出
"""
import argparse
import contextlib
import io
import json
import os
import re
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import engine

PORT = 8766
MAX_TEXT = 600  # 一句解说词不会比这更长，超过的请求不理
SUBTITLE_DIR = os.path.join(engine.ROOT, "out", "subtitles")
FILM_DIR = os.path.join(engine.ROOT, "dist")  # 打包好的讲解都在这里
APP_PAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app.html")
FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")

LOAD_TIMES = os.path.join(engine.ROOT, "out", "tts-load.json")  # 上一次加载模型，各步是第几秒做完的；进度条按它估

state = {"tts": None, "voice": None, "path": None, "id": None, "opened": None, "port": PORT, "seen": 0.0, "error": None, "detail": None, "speed": 1.0,
         "loading": None, "usual": None}
ready = threading.Event()
stop = threading.Event()   # 朗读器的窗口关了
gpu = threading.Lock()     # 一次只合成一句


def use_voice(name):
    path = engine.resolve_voice(name)
    with gpu:
        state.update(voice=name or engine.DEFAULT_VOICE, path=path, id=engine.voice_id(path), speed=engine.voice_speed(name))


def speak(lang, text, mood=None):
    """返回 (指纹, 秒数)。缓存里没有就合成，并存下 wav 和 mp3。mood 是八种情感的权重，不给就照参考句原样读。"""
    ready.wait()
    with gpu:
        fp = engine.fingerprint(lang, text, state["id"], state["speed"], mood)
        wav_path = engine.cached(fp)
        if not os.path.isfile(engine.cached(fp, ".mp3")):
            t0 = time.perf_counter()
            tts = state["tts"]
            feeling = {"emo_vector": tts.normalize_emo_vec(mood, apply_bias=True)} if mood else {}  # 模型自己的折算：总和压到 0.8 以内
            seen = {}
            with contextlib.redirect_stdout(io.StringIO()):
                rate, pcm = engine.speak(tts, state["path"], text, lang, seen=seen, duration_factor=state["speed"], **feeling)
            engine.save_wav(wav_path, pcm)
            engine.wav_to_mp3(wav_path, engine.cached(fp, ".mp3"))
            felt = "".join(f" {name}{value:g}" for name, value in zip(engine.MOODS, mood or ()) if value)
            fixed = (f"，切掉句首气声 {seen['breath']:.2f}s" if seen["breath"] else "") + ("，句尾没说完补读了一遍" if seen["again"] else "")
            print(f"合成 {len(pcm) / rate:4.1f}s，用时 {time.perf_counter() - t0:4.1f}s{fixed}  [{state['voice']}{felt}] {text[:30]}", flush=True)
    return fp, engine.wav_seconds(wav_path)


HTML = (".html", ".htm")


def films(folder=None, inside="", depth=0):
    """dist 下的文件夹和 HTML，一层套一层，侧边栏照它画成文件树。
    文件夹是 {name, path, items}，HTML 是 {name, path, modified}；path 是相对 dist 的路径，用 / 分隔。"""
    found = []
    with contextlib.suppress(OSError):
        for entry in os.scandir(folder or FILM_DIR):
            if entry.name.startswith("."):
                continue
            path = inside + entry.name
            if entry.is_dir():
                if depth < 8:  # 文件夹套文件夹不会这么深；防的是指回上层的链接
                    found.append({"name": entry.name, "path": path, "items": films(entry.path, path + "/", depth + 1)})
            elif entry.name.lower().endswith(HTML):
                found.append({"name": entry.name, "path": path, "modified": entry.stat().st_mtime_ns // 1_000_000})
    return found


def film_path(name):
    """dist 下这个相对路径的 HTML 在哪。想走出 dist 的（.. 、盘符、反斜杠）、不是 HTML 的、不存在的，都是 None。"""
    parts = name.split("/")
    if not name.lower().endswith(HTML) or any(p in ("", ".", "..") or ":" in p or os.path.basename(p) != p for p in parts):
        return None
    path = os.path.join(FILM_DIR, *parts)
    return path if os.path.isfile(path) else None


def opened():
    """启动时指定的 HTML：没有是 False；在 dist 下的给它相对 dist 的路径，界面好在侧边栏里把它标出来；别处的是 True。"""
    path = state["opened"]
    if not path:
        return False
    with contextlib.suppress(ValueError):  # 不在同一个盘上
        inside = os.path.relpath(path, FILM_DIR)
        if not inside.startswith("..") and not os.path.isabs(inside):
            return inside.replace(os.sep, "/")
    return True


def leave():
    """窗口说它要关了。等几秒，这期间没有再来请求（不是刷新页面）就退出。"""
    asked = time.time()
    time.sleep(4)
    if state["seen"] <= asked:
        stop.set()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, code, body=b"", kind="application/json", cache=False):
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")  # 讲解的 HTML 是从 file:// 或预览服务器打开的
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Type", kind)
        self.send_header("Cache-Control", "max-age=86400" if cache else "no-store")  # 字体文件不会变，别每次都重新取
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def json(self, value, code=200):
        self.reply(code, json.dumps(value, ensure_ascii=False).encode())

    def do_OPTIONS(self):
        self.reply(204)

    def ours(self):
        """这个 GET 是不是朗读器自己的界面发来的（或者直接在地址栏里打的）。别的网页发来的，浏览器会标明它来自别处。"""
        return self.headers.get("Origin") in (None, f"http://127.0.0.1:{state['port']}") and self.headers.get("Sec-Fetch-Site") in (None, "same-origin", "none")

    def do_GET(self):
        if self.path == "/status":
            state["seen"] = time.time()
            return self.json({"ready": ready.is_set(), "voice": state["voice"], "lang": engine.voice_info(state["voice"]).get("lang"), "voices": engine.voices(), "opened": opened(), "error": state["error"], "detail": state["detail"], "progress": progress()})
        if self.path in ("/", "/index.html"):
            with open(APP_PAGE, "rb") as f:
                return self.reply(200, f.read(), "text/html; charset=utf-8")
        if self.path == "/opened" and state["opened"]:
            with open(state["opened"], "rb") as f:
                return self.reply(200, f.read(), "text/html; charset=utf-8")
        if self.path == "/films" or self.path.startswith("/film/"):  # 讲解的内容只给朗读器自己的界面
            if not self.ours():
                return self.json({"error": "forbidden"}, 403)
            if self.path == "/films":
                return self.json(films())
            path = film_path(urllib.parse.unquote(self.path[len("/film/"):]))
            if path:
                with open(path, "rb") as f:
                    return self.reply(200, f.read(), "text/html; charset=utf-8")
        font = re.fullmatch(r"/fonts/([\w-]+)/([\w.-]+\.(ttf|woff2))", self.path)
        if font and os.path.isfile(os.path.join(FONT_DIR, font[1], font[2])):
            with open(os.path.join(FONT_DIR, font[1], font[2]), "rb") as f:
                return self.reply(200, f.read(), "font/" + font[3], cache=True)
        found = re.fullmatch(r"/audio/([0-9a-f]{16})\.mp3", self.path)
        if found and os.path.isfile(engine.cached(found[1], ".mp3")):
            with open(engine.cached(found[1], ".mp3"), "rb") as f:
                return self.reply(200, f.read(), "audio/mpeg")
        self.json({"error": "not found"}, 404)

    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            if self.path in ("/cached", "/speak"):
                lang = body["lang"]
                if lang not in engine.LANGS:
                    raise ValueError(f"不认识的语言：{lang}")
                if self.path == "/cached":
                    have = {}
                    for line in body["lines"]:
                        fp = engine.fingerprint(lang, line["text"].strip(), state["id"], state["speed"], engine.mood_of(line.get("mood")))
                        if os.path.isfile(engine.cached(fp, ".mp3")):
                            have[line["key"]] = {"fp": fp, "seconds": engine.wav_seconds(engine.cached(fp))}
                    return self.json(have)
                text = body["text"].strip()
                if not text or len(text) > MAX_TEXT:
                    raise ValueError("文本为空或太长")
                fp, seconds = speak(lang, text, engine.mood_of(body.get("mood")))
                return self.json({"fp": fp, "seconds": seconds})

            # 以下只给朗读器自己的界面用：别的网页不能替用户换音色、写文件、关服务
            if self.headers.get("Origin") != f"http://127.0.0.1:{state['port']}":
                return self.json({"error": "forbidden"}, 403)
            if self.path == "/voice":
                if body["name"] not in engine.voices():
                    raise ValueError(f"没有这个音色：{body['name']}")
                use_voice(body["name"])
                return self.json({"voice": state["voice"]})
            if self.path == "/export":
                title = re.sub(r'[\\/:*?"<>|\x00-\x1f]', " ", str(body["title"])).strip()[:80] or "字幕"
                os.makedirs(SUBTITLE_DIR, exist_ok=True)
                files = []
                for ext in ("srt", "txt"):
                    path = os.path.join(SUBTITLE_DIR, f"{title}.{ext}")
                    with open(path, "w", encoding="utf-8-sig", newline="\n") as f:
                        f.write(str(body[ext]))
                    files.append(os.path.relpath(path, engine.ROOT))
                return self.json({"files": files})
            if self.path == "/reveal":
                os.makedirs(SUBTITLE_DIR, exist_ok=True)
                os.startfile(SUBTITLE_DIR)
                return self.json({})
            if self.path == "/bye":
                threading.Thread(target=leave, daemon=True).start()
                return self.json({})
            self.json({"error": "not found"}, 404)
        except (KeyError, ValueError, TypeError) as e:
            self.json({"error": str(e)}, 400)


def listen(port=PORT, voice=None, opened=None):
    """开始监听。模型还没加载，/speak 会等到 load() 完成。"""
    use_voice(voice)
    state.update(port=port, opened=opened)
    os.makedirs(engine.CACHE_DIR, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()


def load(fp32=False):
    began, steps = time.perf_counter(), []  # steps：每一步是开始加载后第几秒做完的
    spent = lambda: time.perf_counter() - began
    with contextlib.suppress(OSError, ValueError), open(LOAD_TIMES, encoding="utf-8") as f:
        state["usual"] = json.load(f)
    state["loading"] = (began, steps)
    try:
        state["tts"] = engine.load(bf16=False if fp32 else None, tick=lambda: steps.append(spent()))
        steps.append(spent())
        with contextlib.redirect_stdout(io.StringIO()):  # 第一句要预热十几秒，先在这里付掉
            state["tts"].infer(spk_audio_prompt=state["path"], text="準備ができました。", output_path=None, lang="ja")
        steps.append(spent())
    except BaseException as e:  # 多半是系统提交内存不够。朗读器没有黑窗口，得让界面把原因说出来，不能一直停在"正在加载"
        state.update(error="memory" if isinstance(e, MemoryError) else "failed", detail=str(e) or type(e).__name__)
        raise
    finally:
        state["loading"] = None
    with contextlib.suppress(OSError), open(LOAD_TIMES, "w", encoding="utf-8") as f:
        json.dump(steps, f)
    ready.set()
    print(f"模型就绪，用了 {spent():.0f} 秒。", flush=True)


def progress():
    """模型加载到几成了，0 到 1；没在加载是 None。
    加载分十几步，每步多久差得很远（导入几秒，预热十几秒），所以按上一次加载时各步用的时间来估：
    做完第几步就走到上一次那一步的位置，这一步里面按时间往前挪，没做完之前不越过下一步。
    还没有上一次的记录（第一次用）时，就当它总共要 45 秒。"""
    if not state["loading"]:
        return None
    began, steps = state["loading"]
    usual, done, spent = state["usual"], len(steps), time.perf_counter() - began
    if not usual:
        return min(0.95, spent / 45)
    if done >= len(usual):
        return 0.99
    here = usual[done - 1] if done else 0.0
    return min(0.99, (here + min(spent - (steps[-1] if done else 0.0), (usual[done] - here) * 0.95)) / usual[-1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", help="音色名（voices/ 下的文件夹），不给就用默认音色")
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--fp32", action="store_true", help="全精度，快约 15%%，多占 2GB 显存")
    args = ap.parse_args()

    listen(args.port, args.voice)
    print(f"配音服务在 http://127.0.0.1:{args.port}，音色 {state['voice']}，正在加载模型……", flush=True)
    load(args.fp32)
    print("现在打开讲解的 HTML 点播放即可，Ctrl+C 退出。", flush=True)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
