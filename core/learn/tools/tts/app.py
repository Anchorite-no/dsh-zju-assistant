"""朗读器：一个窗口，把讲解的 HTML 拖进去，点到哪里就从哪里开始读。

    tts app                  或者双击根目录的"朗读器.cmd"
    tts app dist\\某讲.html   打开时直接载入这个 HTML（把 HTML 拖到"朗读器.cmd"上也一样）

它就是配音服务（serve.py）加一个界面（app.html）。窗口一关，进程退出，显存也就放掉了。
如果配音服务已经在跑（tts serve，或者另一个朗读器窗口），就只打开窗口，不再加载一份模型。

窗口用 pywebview（系统自带的 WebView2）：它是一块干净的网页内核，没有浏览器的账号、同步和扩展，
标题栏还能涂成和界面一样的纸色。没装 pywebview 时退回 Edge 的应用模式，标题栏是浏览器自己画的灰色。
"""
import argparse
import contextlib
import ctypes
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import urllib.request

import engine
import serve

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(engine.ROOT, "out", "朗读器.log")
TITLE = "朗读器"
PAPER, RULE, INK = 0xFAF9F5, 0xDDDAD0, 0x141413   # 窗口底色（app.html 的 --bg-100）、窗口边线、标题文字
# 窗口被别的窗口完全盖住时，内核会当它不可见，画面的时钟和朗读都会停。关掉这项判断，盖住了照样往下读；最小化仍然会停。
# 第二项让"点字幕列表开始读"不被当成没有用户手势的自动播放。
BROWSER_ARGS = ["--disable-features=CalculateNativeWinOcclusion,msImplicitSignin", "--autoplay-policy=no-user-gesture-required"]


def running(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/status", timeout=1) as r:
            return "ready" in json.load(r)
    except OSError:
        return False


def paper_frame():
    """把本进程窗口的标题栏、边线、标题文字涂成界面的颜色（Windows 11 才有这个接口，别的系统上调用无效也无害）。"""
    user32, dwm, pid, found = ctypes.windll.user32, ctypes.windll.dwmapi, os.getpid(), []

    @ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    def each(hwnd, _):
        owner = ctypes.c_ulong()
        user32.GetWindowThreadProcessId(ctypes.c_void_p(hwnd), ctypes.byref(owner))
        if owner.value == pid and user32.IsWindowVisible(ctypes.c_void_p(hwnd)):
            found.append(hwnd)
        return True

    user32.EnumWindows(each, 0)
    for hwnd in found:
        for attribute, rgb in ((35, PAPER), (34, RULE), (36, INK)):  # 标题栏、边线、标题文字
            bgr = ctypes.c_ulong((rgb & 0xFF) << 16 | (rgb & 0xFF00) | rgb >> 16)
            dwm.DwmSetWindowAttribute(ctypes.c_void_p(hwnd), attribute, ctypes.byref(bgr), 4)


def follow_full_screen(window):
    """讲解的"全屏"让网页进了全屏时，WebView2 只把画面铺满窗口，窗口本身动不动归宿主管，pywebview 没有管。
    这里补上：网页进全屏，窗口就去掉标题栏铺满整块屏幕；网页退出（按 Esc，或者再点一次），窗口回到原来的大小和位置。"""
    from System import Action  # pywebview 已经把 .NET 带起来了

    form = window.native

    def hook():
        core = form.browser.webview.CoreWebView2

        def changed(*_):
            if core.ContainsFullScreenElement != form.is_fullscreen:
                form.toggle_fullscreen()
                if not form.is_fullscreen:
                    paper_frame()  # pywebview 退出全屏时把窗口边线改回了系统的颜色

        core.ContainsFullScreenElementChanged += changed

    form.Invoke(Action(hook))  # 网页内核只能在界面线程上碰


class Host:
    """界面能叫窗口做的事（pywebview 的 js_api，界面里是 pywebview.api）。带下划线的属性不会露给界面。"""

    def __init__(self):
        self._window = None

    def widen(self, by, scale=1):
        """把窗口的右边挪 by 个网页像素（scale 是一个网页像素合几个屏幕像素），正数向右加宽，负数收回来；左边不动。
        界面打开字幕列表时用它给列表腾地方，这样画面不用缩小。不伸出窗口所在那块屏幕的工作区，也不小于窗口的最小宽度；
        最大化、全屏时不动。返回实际挪了多少网页像素。"""
        from System import Action
        from System.Windows.Forms import FormWindowState, Screen

        form, went = self._window.native, [0]

        def move():
            if form.WindowState != FormWindowState.Normal or form.is_fullscreen:
                return
            edge = (form.Width - form.ClientSize.Width) // 2  # 窗口两侧各有一条看不见的边，它可以伸到屏幕外面
            limit = Screen.FromControl(form).WorkingArea.Right + edge - form.Left
            width = max(form.MinimumSize.Width, min(form.Width + round(by * scale), max(limit, form.Width)))
            went[0] = (width - form.Width) / scale
            form.Width = width

        form.Invoke(Action(move))  # 窗口只能在界面线程上碰
        return went[0]


def show(url):
    """打开窗口，等它关掉才返回。"""
    try:
        import webview
    except ImportError:
        return show_in_edge(url)
    os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = " ".join(BROWSER_ARGS)
    if os.environ.get("LEARN_DEBUG_PORT"):  # 测试时用：让外面的脚本能操作这个窗口
        webview.settings["REMOTE_DEBUGGING_PORT"] = int(os.environ["LEARN_DEBUG_PORT"])
    host = Host()
    window = host._window = webview.create_window(TITLE, url, width=1560, height=940, min_size=(1000, 640), js_api=host,
                                                  background_color=f"#{PAPER:06X}", text_select=True)
    window.events.shown += paper_frame
    hooked = threading.Event()

    def loaded():  # 页面第一次载入完，网页内核才在；再载入时不重复挂
        if not hooked.is_set():
            hooked.set()
            follow_full_screen(window)

    window.events.loaded += loaded
    webview.start(icon=os.path.join(HERE, "app.ico"), private_mode=True,
                  storage_path=os.path.join(engine.ROOT, "out", "app-data"))


def show_in_edge(url):
    """退路：Edge 的应用模式。每次用一份临时的浏览器资料，并且不许它登录账号、同步和加载扩展，
    否则 Edge 会把用户平时的扩展和同步数据都搬进这份资料里。"""
    edge = next((p for v in ("ProgramFiles(x86)", "ProgramFiles")
                 if os.path.isfile(p := os.path.join(os.environ.get(v, ""), "Microsoft", "Edge", "Application", "msedge.exe"))), None)
    if not edge:
        sys.exit("没有装 pywebview，也找不到 Edge。先装 pywebview：uv pip install --python tools/qwen-tts/.venv/Scripts/python.exe pywebview")
    profile = tempfile.mkdtemp(prefix="learn-reader-")
    window = subprocess.Popen([edge, f"--app={url}", f"--user-data-dir={profile}", "--window-size=1560,940", "--no-first-run",
                               "--no-default-browser-check", "--disable-background-mode", "--disable-sync", "--disable-extensions",
                               *BROWSER_ARGS])
    started = time.time()
    # 界面每两秒问一次 /status，关掉时会说一声（serve.stop）。后两条是它没来得及说的情况
    while not serve.stop.wait(1):
        quiet = time.time() - serve.state["seen"]
        if window.poll() is not None and quiet > 10 and time.time() - started > 20:
            break
        if serve.state["seen"] and quiet > 180:
            break
    shutil.rmtree(profile, ignore_errors=True)


def drop_old_profile():
    """早先的版本给 Edge 留过一份固定的浏览器资料（out\\app-profile），里面混进了用户的扩展和同步数据。
    看到就清掉。旧窗口还开着时改不了名，这次就不动它，等下次启动。"""
    old = os.path.join(engine.ROOT, "out", "app-profile")
    with contextlib.suppress(OSError):
        os.rename(old, old + "-gone")
    shutil.rmtree("\\\\?\\" + old + "-gone", ignore_errors=True)  # 里面有超长路径，要带这个前缀才删得掉


def keep_log():
    """朗读器.cmd 用 pythonw 启动，没有黑窗口，也就没有地方打印：日志改写进 out\\朗读器.log，每次启动重写。
    从命令行启动的（tts app）有终端，照旧打在终端里。返回是不是没有窗口。"""
    if sys.stdout is not None and sys.stderr is not None:
        return False
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    sys.stdout = sys.stderr = open(LOG, "w", encoding="utf-8", errors="replace", buffering=1)
    return True


def alert(text):
    """没有黑窗口时，启动不了要弹一个框说出来，不然双击之后什么也不发生。"""
    ctypes.windll.user32.MessageBoxW(None, f"{text}\n\n日志在 {LOG}", TITLE, 0x10)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("html", nargs="?", help="打开时直接载入的讲解 HTML")
    ap.add_argument("--voice", help="音色名，不给就用默认音色")
    ap.add_argument("--port", type=int, default=serve.PORT)
    args = ap.parse_args()
    if args.html and not os.path.isfile(args.html):
        sys.exit(f"找不到这个文件：{args.html}")

    drop_old_profile()
    if running(args.port):
        print("配音服务已经在跑，只打开窗口。", flush=True)
    else:
        serve.listen(args.port, args.voice, os.path.abspath(args.html) if args.html else None)
        print(f"朗读器已打开，音色 {serve.state['voice']}，正在加载模型……关掉窗口就会退出。", flush=True)
        if not os.environ.get("LEARN_NO_MODEL"):  # 测试界面时用：不加载模型
            threading.Thread(target=serve.load, daemon=True).start()
    show(f"http://127.0.0.1:{args.port}/")
    os._exit(0)  # 服务和模型都在后台线程里，跟着进程一起结束


if __name__ == "__main__":
    hidden = keep_log()
    try:
        main()
    except SystemExit as e:  # 参数不对、找不到文件：sys.exit 带着一句话
        if hidden and isinstance(e.code, str):
            alert(e.code)
        raise
    except Exception as e:
        traceback.print_exc()
        if hidden:
            alert(f"朗读器没能启动：{e}")
        raise
