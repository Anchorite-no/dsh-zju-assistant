"""Authenticated loopback host for the Electron reader; no pywebview dependency."""
import hmac
import json
import os
import threading
import urllib.parse
from http.cookies import SimpleCookie
from http.server import ThreadingHTTPServer

import engine
import serve


class DesktopHandler(serve.Handler):
    token = ""

    def send_header(self, key, value):
        if key.lower().startswith("access-control-"):
            return
        super().send_header(key, value)

    def authorized(self):
        provided = self.headers.get("X-Campus-Tts", "")
        if provided and hmac.compare_digest(provided, self.token):
            return True
        try:
            cookie = SimpleCookie(self.headers.get("Cookie", "")).get("campus_tts")
            return bool(cookie and hmac.compare_digest(cookie.value, self.token) and self.ours())
        except Exception:
            return False

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        token = urllib.parse.parse_qs(url.query).get("token", [""])[0]
        if url.path == "/" and token and hmac.compare_digest(token, self.token):
            self.send_response(303)
            self.send_header("Set-Cookie", f"campus_tts={self.token}; HttpOnly; SameSite=Strict; Path=/")
            self.send_header("Location", "/")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if not self.authorized():
            return self.json({"error": "unauthorized"}, 401)
        super().do_GET()

    def do_OPTIONS(self):
        self.reply(204 if self.authorized() else 401)

    def do_POST(self):
        if not self.authorized():
            return self.json({"error": "unauthorized"}, 401)
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 0 or size > 256 * 1024:
                return self.json({"error": "request too large"}, 413)
            if self.path == "/campus/open":
                value = json.loads(self.rfile.read(size))
                name = value.get("name", "")
                if not isinstance(name, str) or os.path.basename(name) != name or any(c in name for c in '\\/:*?"<>|') or not name.lower().endswith(".html"):
                    raise ValueError("invalid film name")
                root = os.path.realpath(serve.FILM_DIR)
                file = os.path.realpath(os.path.join(root, name))
                if os.path.commonpath([root, file]) != root or not os.path.isfile(file):
                    raise ValueError("film not found")
                serve.state["opened"] = file
                return self.json({"opened": name})
            if self.path == "/speak" and serve.state["error"]:
                return self.json({"error": serve.state["detail"] or "model unavailable"}, 503)
            if self.path == "/speak" and not serve.ready.is_set():
                return self.json({"error": "model is still loading"}, 503)
            super().do_POST()
        except (ValueError, TypeError, KeyError) as error:
            self.json({"error": str(error)}, 400)
        except Exception as error:
            self.json({"error": str(error)}, 503)


def main():
    token = os.environ.get("LEARN_TTS_TOKEN", "")
    if len(token) < 32:
        raise RuntimeError("desktop host requires a private launch token")
    DesktopHandler.token = token
    serve.use_voice(engine.DEFAULT_VOICE)
    os.makedirs(engine.CACHE_DIR, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 0), DesktopHandler)
    server.daemon_threads = True
    serve.state["port"] = server.server_port
    print(f"CAMPUS_TTS_READY {server.server_port}", flush=True)
    threading.Thread(target=serve.load, daemon=True).start()
    server.serve_forever()


if __name__ == "__main__":
    main()
