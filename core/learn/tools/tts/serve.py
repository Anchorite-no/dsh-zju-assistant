"""常驻的配音服务：讲解的 HTML 播放时，缺配音的句子由它现场合成。朗读器（tts app）的后台也是它。

    tts serve --voice 爱弥斯

模型只加载一次，一直留在显存里（约 5GB 显存），用完按 Ctrl+C 关掉。
合成过的句子按指纹存进 out\\tts-cache，同样的语言、文本、音色再要时直接给，
所以改稿后重新打开 HTML，只有改过的句子需要等。只在本机 127.0.0.1 上监听。

讲解的 HTML 用到的接口：
    GET  /status                      模型是否就绪，当前音色和它说的语言（lang，取自 voice.json），有哪些音色；
                                      还在加载时 progress 是加载到几成（0 到 1）；没加载起来时 error 是 memory（内存不够）或 failed，detail 是原话
    POST /cached {lang, lines}        这些句子里哪些已经有配音，各多长（不合成）
    POST /speak  {lang, lines, voice_id} 合成一至两句的连续语段，返回逐句的指纹、段内偏移、时长。
                                      旧式{text}请求仍可用。行上带的 mood（情感）现在的模型用不上，收下不用。
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
import phrases

PORT = 8766
MAX_TEXT = 600  # 一句解说词不会比这更长，超过的请求不理
SUBTITLE_DIR = os.path.join(engine.DATA_DIR, "out", "subtitles")
FILM_DIR = os.path.join(engine.ROOT, "dist")  # 打包好的讲解都在这里
APP_PAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app.html")
FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")

LOAD_TIMES = os.path.join(engine.DATA_DIR, "out", "tts-load.json")  # 上一次加载模型，各步是第几秒做完的；进度条按它估

state = {"tts": None, "voice": None, "path": None, "id": None, "opened": None, "port": PORT, "seen": 0.0, "error": None, "detail": None,
         "loading": None, "usual": None, "speech": phrases.settings({})}
ready = threading.Event()
stop = threading.Event()   # 朗读器的窗口关了
gpu = threading.Lock()     # 一次只合成一句


def use_voice(name):
    path = engine.resolve_voice(name)
    with gpu:
        import hashlib
        speech = phrases.settings(engine.voice_info(name))
        signature = json.dumps([engine.ENGINE, engine.voice_id(path), speech], sort_keys=True)
        state.update(voice=name or engine.DEFAULT_VOICE, path=path,
                     id=hashlib.sha256(signature.encode()).hexdigest()[:16], speech=speech)


def group_id(lang, lines):
    return phrases.fingerprint(lang, [engine.respelt(x['text'].strip(), lang) for x in lines], state['id'], None, None)


def cached_group(lang, lines):
    fp = group_id(lang, lines)
    try:
        if not os.path.isfile(engine.cached(fp, '.mp3')):
            return {}
        with open(engine.cached(fp, '.json'), encoding='utf-8') as f:
            meta = json.load(f)
        points = meta['positions']
        if len(points) != len(lines)+1:
            return {}
        return {line['key']: {'fp': fp, 'offset': points[i], 'seconds': points[i+1]-points[i],
                             'continuous': i < len(lines)-1, 'gap': state['speech']['gap'],
                             'alignment': meta['alignment']}
                for i, line in enumerate(lines)}
    except (OSError, ValueError, KeyError, TypeError):
        return {}


def speak_group(lang, lines, expected_voice=None):
    ready.wait()
    with gpu:
        if expected_voice and expected_voice != state['id']:
            raise ValueError('音色已切换，请重新请求')
        if len(lines) > 2 or not lines or any(not x['text'].strip() for x in lines):
            raise ValueError('语段需要一至两条非空句子')
        if len(lines) > 1 and (len(phrases.groups(lines, state['speech'])) != 1):
            raise ValueError('这些句子不能合并为同一语段')
        text = (' ' if lang == 'en' else '').join(x['text'].strip() for x in lines)
        if len(text) > MAX_TEXT:
            raise ValueError('语段太长')
        have = cached_group(lang, lines)
        if have:
            return have
        fp = group_id(lang, lines)
        with contextlib.redirect_stdout(io.StringIO()):
            rate, pcm = engine.speak(state['tts'], state['path'], text, lang)
        engine.save_wav(engine.cached(fp), pcm)
        engine.wav_to_mp3(engine.cached(fp), engine.cached(fp, '.mp3'))
        positions, alignment = phrases.positions(pcm, rate, [x['text'] for x in lines])
        with open(engine.cached(fp, '.json'), 'w', encoding='utf-8') as f:
            json.dump({'positions': positions, 'alignment': alignment}, f)
        print(f"合成 {len(lines)} 句连续语段，{len(pcm)/rate:.1f}s [{state['voice']}]", flush=True)
        return cached_group(lang, lines)


def speak(lang, text):
    """兼容单句调用。"""
    clip = speak_group(lang, [{'key': 'single', 'text': text}])['single']
    return clip['fp'], clip['seconds']


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

    def reply(self, code, body=b"", kind="application/json", cache=False, parts=False):
        """parts：允许只取其中一段（Range）。音频必须这样给：不能分段取的音频，浏览器认为它不能从中间开始放，
        给它设了位置也会从头放起，点一个语段里后面的句子、暂停后继续，听到的都是这一段的开头。"""
        total, span = len(body), None
        asked = re.fullmatch(r"bytes=(\d*)-(\d*)", self.headers.get("Range") or "") if parts and code == 200 else None
        if asked and (asked[1] or asked[2]):
            first = int(asked[1]) if asked[1] else max(0, total - int(asked[2]))
            last = min(total - 1, int(asked[2])) if asked[1] and asked[2] else total - 1
            if first > last:
                code, body = 416, b""
            else:
                code, body, span = 206, body[first:last + 1], f"bytes {first}-{last}/{total}"
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")  # 讲解的 HTML 是从 file:// 或预览服务器打开的
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Type", kind)
        self.send_header("Cache-Control", "max-age=86400" if cache else "no-store")  # 字体文件不会变，别每次都重新取
        if parts:
            self.send_header("Accept-Ranges", "bytes")
        if code in (206, 416):
            self.send_header("Content-Range", span or f"bytes */{total}")
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
            return self.json({"ready": ready.is_set(), "voice": state["voice"], "voice_id": state['id'], "speech": state['speech'], "moods": False, "lang": engine.voice_info(state["voice"]).get("lang"), "voices": engine.voices(), "opened": opened(), "error": state["error"], "detail": state["detail"], "progress": progress()})
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
                return self.reply(200, f.read(), "audio/mpeg", parts=True)
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
                    with gpu:
                        for block in phrases.groups(body['lines'], state['speech']):
                            have.update(cached_group(lang, block))
                    return self.json(have)
                if 'lines' in body:
                    return self.json({'clips': speak_group(lang, body['lines'], body.get('voice_id'))})
                text = body["text"].strip()
                if not text or len(text) > MAX_TEXT:
                    raise ValueError("文本为空或太长")
                fp, seconds = speak(lang, text)
                return self.json({"fp": fp, "seconds": seconds})

            # 以下只给朗读器自己的界面用：别的网页不能替用户换音色、写文件、关服务
            if self.headers.get("Origin") != f"http://127.0.0.1:{state['port']}":
                return self.json({"error": "forbidden"}, 403)
            if self.path == "/voice":
                if body["name"] not in engine.voices():
                    raise ValueError(f"没有这个音色：{body['name']}")
                use_voice(body["name"])
                return self.json({"voice": state["voice"], "voice_id": state['id'], "speech": state['speech']})
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


def load():
    began, steps = time.perf_counter(), []  # steps：每一步是开始加载后第几秒做完的
    spent = lambda: time.perf_counter() - began
    with contextlib.suppress(OSError, ValueError), open(LOAD_TIMES, encoding="utf-8") as f:
        state["usual"] = json.load(f)
    state["loading"] = (began, steps)
    try:
        state["tts"] = engine.load(tick=lambda: steps.append(spent()))
        steps.append(spent())
        with contextlib.redirect_stdout(io.StringIO()):  # 头一句要算参考音色，多花十来秒，先在这里付掉
            engine.speak(state["tts"], state["path"], "准备好了。", "zh")
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
    args = ap.parse_args()

    listen(args.port, args.voice)
    print(f"配音服务在 http://127.0.0.1:{args.port}，音色 {state['voice']}，正在加载模型……", flush=True)
    load()
    print("现在打开讲解的 HTML 点播放即可，Ctrl+C 退出。", flush=True)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
