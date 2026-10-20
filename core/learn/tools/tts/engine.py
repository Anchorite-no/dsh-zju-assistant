"""本机 Qwen3-TTS 的统一入口：路径、加载、音色、朗读、缓存和存盘。
模型是 Qwen3-TTS-12Hz-1.7B-Base，经 faster-qwen3-tts 运行（依据和装法见 tools/tts/README.md）。"""
import contextlib
import ctypes
import io
import json
import os
import re
import wave

ROOT = os.path.abspath(os.environ.get("LEARN_WORKSPACE") or os.path.join(os.path.dirname(__file__), "..", ".."))
DATA_DIR = os.path.abspath(os.environ.get("LEARN_TTS_DATA") or ROOT)
QWEN_DIR = os.path.abspath(os.environ.get("LEARN_TTS_HOME") or os.path.join(ROOT, "tools", "qwen-tts"))
MODEL_DIR = os.path.join(QWEN_DIR, "checkpoints", "Qwen3-TTS-12Hz-1.7B-Base")
VOICEPRINT_DIR = os.path.join(ROOT, "tools", "voiceprint")  # 做音色时量声纹用的 CAM++：两个源码文件和一个权重，原是 IndexTTS 带的
VOICEPRINT_MODEL = os.path.join(VOICEPRINT_DIR, "campplus_cn_common.bin")
VOICE_DIR = os.path.join(DATA_DIR, "voices")  # 参考音频只在用户的数据目录里
DEFAULT_VOICE = os.environ.get("LEARN_DEFAULT_VOICE", "my-voice")
ENGINE = "qwen3-tts-1.7b"  # 记进缓存的指纹：换了模型，以前合成的句子都不算数
SAMPLE_RATE = 24000
LANGS = ("zh", "ja", "en")  # 配音语言。模型另外支持德、法、俄、葡、西、意、韩，本机没有试过
LANGUAGE = {"zh": "Chinese", "ja": "Japanese", "en": "English"}  # 模型自己的叫法

os.environ.setdefault("HF_HUB_OFFLINE", "1")     # 模型都在本地，启动时不联网检查
os.environ.setdefault("TQDM_DISABLE", "1")       # 每合成一句就画一条进度条，日志里全是它
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")  # 加载时那几段"将来的版本会如何"的提醒不用看


ROOM_GB = 8    # 加载一次模型多用约 7GB 系统提交内存（2026-10-12 量到 6.8GB），留一点富余
SLACK_GB = 9   # 加载期间尽量空着这么多。这个模型会一口气要六七个 GB，来不及一块一块地还：只留 6GB 时余量一度掉到 0
SPARE_GB = 3   # 上面两样占住之后，离页面文件扩到头还要剩这么多。2026-10-14 剩不到 1GB 时崩了两次，2026-10-04 剩 3.4GB 时正常


class MemoryStatus(ctypes.Structure):  # GlobalMemoryStatusEx 填的表
    _fields_ = [("size", ctypes.c_uint32), ("load", ctypes.c_uint32)] + [(name, ctypes.c_uint64) for name in (
        "physical", "physical_free", "limit", "free", "virtual", "virtual_free", "extended")]


def memory():
    """系统内存现在的读数：（物理内存，提交上限，提交余量），单位 GB。"""
    status = MemoryStatus(size=ctypes.sizeof(MemoryStatus))
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status))
    return status.physical / 2 ** 30, status.limit / 2 ** 30, status.free / 2 ** 30


def top_limit(physical):
    """页面文件扩到头时提交上限是多少 GB：物理内存加各个页面文件登记的最大值。
    最大值读不到时是 None：页面文件交给系统管理的话，注册表里没有这个数，或者是 0。"""
    import winreg

    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management") as key:
            files = winreg.QueryValueEx(key, "PagingFiles")[0]  # 一个页面文件一行：路径、初始 MB、最大 MB
        most = [int(line.split()[-1]) for line in files if line.strip()]
    except (OSError, ValueError):
        return None
    return physical + sum(most) / 1024 if most and all(most) else None


def refusal(others, top):
    """别的程序占着 others GB 提交内存、上限最多到 top GB 时为什么不能加载：给界面的一句话。能加载是 None。"""
    most = top - (ROOM_GB + SLACK_GB + SPARE_GB)
    if others <= most:
        return None
    holds, allowed = round(others, 1), round(most, 1)  # 差多少按写出来的两个数算，免得三个数对不上
    return f"别的程序占着 {holds:.1f}GB 提交内存，降到 {allowed:.1f}GB 以下才能加载，还差 {max(0.1, holds - allowed):.1f}GB。"


def reserve(gb):
    """向系统要 gb GB 提交额度：保留并提交，可读写；不写入就不占物理内存。要不到是 None。"""
    alloc = ctypes.windll.kernel32.VirtualAlloc
    alloc.restype, alloc.argtypes = ctypes.c_void_p, (ctypes.c_void_p, ctypes.c_size_t, ctypes.c_uint32, ctypes.c_uint32)
    return alloc(None, int(gb * 2 ** 30), 0x3000, 4)


def release(block):
    free = ctypes.windll.kernel32.VirtualFree
    free.argtypes = (ctypes.c_void_p, ctypes.c_size_t, ctypes.c_uint32)
    free(block, 0, 0x8000)


@contextlib.contextmanager
def room(step=0.5):
    """加载模型时套在外面：系统提交内存的余量不够，就先把够用的额度占住，模型要多少还多少。

    Windows 下显存占用也计入"提交内存"。余量不够时，模型一口气要好几个 GB，页面文件来不及扩，
    进程会以 0xC0000005 崩溃，还可能连带别的程序出错。慢慢要就扩得出来，所以先一小块一小块地
    占住提交额度（只占额度，不碰物理内存），把上限顶上去。
    占完不能一把全还回去再加载：实测还回去之后一两秒内上限就缩回去几个 GB。所以额度一直占着，
    另起一个线程盯着余量，模型一要内存、余量低于 SLACK_GB 就还一块，等于把额度交到模型手里。
    占得到不等于加载得下去：上限顶到头才凑够的时候，模型一冲就没有再扩的余地，照样崩。所以占之前先算，
    占住之后离页面文件扩到头剩不到 SPARE_GB 就报 MemoryError，一块也不占；占完再算一遍。
    """
    if os.name != "nt":
        yield
        return
    import threading
    import time

    physical, limit, free = memory()
    top = top_limit(physical)
    why = refusal(limit - free, top) if top else None
    if why:
        raise MemoryError(why)
    if free >= ROOM_GB + SLACK_GB:  # 本来就够，什么都不用做
        yield
        return
    blocks, failed = [], 0
    while len(blocks) * step < ROOM_GB + SLACK_GB and failed < 20:
        block = reserve(step)
        if block:
            blocks.append(block)
        else:  # 页面文件正在扩，等一下再要
            failed += 1
            time.sleep(0.5)
    _, raised, left = memory()
    why = refusal(raised - left - len(blocks) * step, top) if top else None  # 占的这几秒里别的程序可能又涨了
    if failed >= 20:
        why = f"系统提交内存的余量只有 {free:.1f}GB，页面文件也扩不出来，这时加载模型会崩。关掉一些占内存的程序再试。"
    if why:
        for block in blocks:
            release(block)
        raise MemoryError(why)
    print(f"系统提交内存的余量只有 {free:.1f}GB，先占住 {len(blocks) * step:.0f}GB 额度（上限 {limit:.1f} → {raised:.1f}GB），加载时交给模型", flush=True)

    done, seen = threading.Event(), {"lowest": None, "limit": raised}

    def hand_over():
        while not done.is_set():
            _, ceiling, left = memory()
            seen["limit"] = min(seen["limit"], ceiling)
            if seen["lowest"] is not None:  # 刚占完时余量接近 0，先还到 SLACK_GB 再开始记
                seen["lowest"] = min(seen["lowest"], left)
            if left < SLACK_GB and blocks:
                release(blocks.pop())
            else:
                seen["lowest"] = left if seen["lowest"] is None else seen["lowest"]
                time.sleep(0.01)

    feeder = threading.Thread(target=hand_over, daemon=True)
    feeder.start()
    try:
        yield
    finally:
        done.set()
        feeder.join()
        kept = len(blocks) * step
        for block in blocks:
            release(block)
        _, ceiling, left = memory()
        lowest = left if seen["lowest"] is None else seen["lowest"]  # 一进去就出错时还没来得及记，这里再出错会把原来的错盖住
        print(f"模型加载完：系统提交内存多用了 {(ceiling - left) - (limit - free):.1f}GB；期间余量最低 {lowest:.1f}GB，"
              f"上限最低 {seen['limit']:.1f}GB，占住的额度剩 {kept:.1f}GB 没用上", flush=True)


def load(tick=None):
    """加载模型，并把每一步要做的显卡运算录成 CUDA 图（十秒上下），一个进程里只加载一次。
    tick 给一个函数，每做完一步就叫它一次，朗读器的进度条靠它知道走到哪了。
    原版的 Qwen3-TTS 每秒语音要由 Python 发起约 200 小步，显卡大半时间在等；录成图之后每一步只发一次，
    本机实测合成 1 秒声音从 1.8 秒降到 0.3 秒，读出来的东西一样。"""
    tick = tick or (lambda: None)
    import torch
    from faster_qwen3_tts import FasterQwen3TTS  # 慢的导入先做完，占住额度之后立刻加载

    tick()
    with room(), contextlib.redirect_stdout(io.StringIO()):  # room 的两行在这之外，照常打印
        tts = FasterQwen3TTS.from_pretrained(MODEL_DIR, device="cuda", dtype=torch.bfloat16, attn_implementation="sdpa", local_files_only=True)
        tick()
        tts.warmup()
        tick()
    return tts


CACHE_DIR = os.path.join(DATA_DIR, "out", "tts-cache")


def reference_text(voice_path):
    """参考音频里说的原话：和它同一个文件夹的 voice.json 里的 text。模型是照着这句话和它的声音接着往下说的，
    所以要和音频一字不差。没写的音色只按声音的特征克隆，像的程度差一些。"""
    try:
        with open(os.path.join(os.path.dirname(voice_path), "voice.json"), encoding="utf-8") as f:
            return str(json.load(f).get("text") or "").strip()
    except (OSError, ValueError, AttributeError):
        return ""


def voice_id(voice_path):
    """参考音色的指纹：换了音色文件或者它的原话，以前合成的句子就都不算数。"""
    import hashlib

    with open(voice_path, "rb") as f:
        return hashlib.sha256(f.read() + reference_text(voice_path).encode()).hexdigest()[:12]


def fingerprint(lang, spoken, voice):
    """一句配音由模型、语言、朗读文本、音色四样决定，都没变就可以复用。voice 是 voice_id 的结果。"""
    import hashlib

    return hashlib.sha256(f"{ENGINE}|{lang}|{respelt(spoken, lang)}|{voice}".encode()).hexdigest()[:16]


def cached(fp, ext=".wav"):
    """缓存里这句配音的路径。缓存按指纹存放，各集共用，改稿后没变的句子不用重新合成。"""
    return os.path.join(CACHE_DIR, fp + ext)


def wav_seconds(path):
    with wave.open(path, "rb") as f:
        return round(f.getnframes() / f.getframerate(), 3)


def voice_info(name):
    """音色的说明：voices/<名字>/voice.json，写着它说哪种语言（lang）和出自哪里（group）。没有这个文件就是空的。"""
    try:
        with open(os.path.join(VOICE_DIR, name or DEFAULT_VOICE, "voice.json"), encoding="utf-8") as f:
            info = json.load(f)
        return info if isinstance(info, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}


def voices():
    """现有的音色名：voices/ 下带 voice.wav 的文件夹。加一个音色就是加一个这样的文件夹。
    出处相同（voice.json 的 group）的排在一起，默认音色所在的那一组排最前，没写出处的排最后。"""
    if not os.path.isdir(VOICE_DIR):
        return []
    names = [d for d in os.listdir(VOICE_DIR) if os.path.isfile(os.path.join(VOICE_DIR, d, "voice.wav"))]
    group = {n: str(voice_info(n).get("group") or "") for n in names}
    first = group.get(DEFAULT_VOICE, "")
    return sorted(names, key=lambda n: (group[n] != first, not group[n], group[n], n))


def resolve_voice(voice):
    """参考音频的路径：给了音频文件的路径就用它，给了音色名到 voices/ 下找，都没给用默认音色。"""
    if voice and os.path.isfile(voice):
        return os.path.abspath(voice)
    path = os.path.join(VOICE_DIR, voice or DEFAULT_VOICE, "voice.wav")
    if not os.path.isfile(path):
        raise FileNotFoundError(f"找不到音色 {voice or DEFAULT_VOICE}：{path}")
    return path

LOUDNESS = -18.0  # 每一句说话部分的响度（均方根，分贝）
MARK = re.compile(r"<([^|>\n]+)\|[^>\n]+>")  # 读音标注 <字|读音>：这个模型不认，送进去之前只留字
# 中文讲解里单独出现的字母，模型按英文读。用户点名说读得不对的，送进模型之前换成读音对的汉字，字幕不动。
# N：句尾常往下掉，听着像“摁”，平常读的是“恩”（2026-10-12，大小写都换）。别的字母他听过讲解原句，定了不动。
READ_AS = {"N": "恩", "n": "恩"}
LETTER = re.compile(r"( ?)(?<![A-Za-z])([%s])(?![A-Za-z])( ?)" % "".join(READ_AS))
# 讲稿里一个字母一个字母分开写的缩写，用户听着连起来写读得更自然的，送进模型之前去掉中间的空格。
# A V L：分开写时 V 的读音不如连着写正常（2026-10-12）。R R、L R 这类他听过，分开写是对的，不收。
JOINED = ("A V L",)
APART = re.compile(r"(?<![A-Za-z])(?:%s)(?![A-Za-z])" % "|".join(re.escape(x) for x in JOINED))


def respelt(text, lang):
    """把 JOINED 里的缩写连起来，把 READ_AS 里的字母换成汉字，只对中文做。字母挨着汉字和标点的那一侧不留空格，
    挨着英文和数字的那一侧留着：“所以 N 个节点”成“所以恩个节点”，“log N 的量级”成“log 恩的量级”。
    夹在单词里的字母不算（NIL、rank）。缓存的指纹按换过的文字算，所以改这两张表只会让用到它们的句子重新合成。"""
    if lang != "zh":
        return text
    text = APART.sub(lambda m: m.group().replace(" ", ""), text)

    def swap(m):
        left = m.group(1) if m.start() and text[m.start() - 1].isascii() and text[m.start() - 1].isalnum() else ""
        right = m.group(3) if m.end() < len(text) and text[m.end()].isascii() and text[m.end()].isalnum() else ""
        return left + READ_AS[m.group(2)] + right

    return LETTER.sub(swap, text)


def speak(tts, voice, text, lang, seen=None):
    """让模型读一段，返回 (采样率, int16 的单声道音频)：响度调好了，两头做了淡入淡出。
    voice 是参考音频的路径。要模型出声的地方都走这里。送进模型的文字去掉了读音标注，换过了 READ_AS 里的字母。
    seen 给一个字典，就记下这一段出过什么毛病（breath、again）。这两样是旧模型的毛病，这个模型没有，恒为没有。"""
    import numpy as np

    said = reference_text(voice)
    wavs, rate = tts.generate_voice_clone(text=respelt(MARK.sub(r"\1", text), lang), language=LANGUAGE[lang], ref_audio=voice, ref_text=said, xvec_only=not said)
    pcm = np.round(np.clip(np.asarray(wavs[0], dtype=np.float32).reshape(-1), -1.0, 1.0) * 32767).astype(np.int16)
    if seen is not None:
        seen.update(breath=0.0, again=False)
    return rate, soften(leveled(pcm))


def leveled(pcm):
    """把一句调到统一的响度，并且不许削顶。克隆出来的音量跟着参考句走（参考句响 6 分贝，读出来也响
    6 分贝），各个音色的参考句轻重不一，读出来能差 5 分贝，轻的那个听着像在说悄悄话。
    响度只按说话的部分量，句子里停顿多少不影响。"""
    import numpy as np

    x = pcm.astype(np.float32) / 32768
    n = SAMPLE_RATE // 50  # 20 毫秒一帧
    power = (x[:len(x) // n * n].reshape(-1, n) ** 2).mean(axis=1)
    if not len(power) or power.max() < 1e-7:  # 整段是静音
        return pcm
    spoken = power[power > power.max() / 300]  # 比最响的一帧低不到 25 分贝的，算在说话
    gain = min(10 ** (LOUDNESS / 20) / np.sqrt(spoken.mean()), 0.95 / np.abs(x).max())
    return np.round(x * gain * 32767).astype(np.int16)


def soften(pcm):
    """开头淡入、结尾淡出，各 12 毫秒：音频要是从波形中间直接开始，播放时会"啪"地爆一声。
    哪一头贴着边还有声音，那一头拉长到 40、60 毫秒，听起来是渐起渐收。凡是模型的输出都先过这里。"""
    import numpy as np

    out = pcm.astype(np.float32)
    hop = SAMPLE_RATE // 100
    loud = np.sqrt((out[:len(out) // hop * hop].reshape(-1, hop) ** 2).mean(axis=1))
    near = np.percentile(loud, 90) * 0.056 if len(loud) > 20 else np.inf  # 比正常音量低 25 分贝
    for ms, edge in ((40 if loud[:3].max(initial=0) > near else 12, 1), (60 if loud[-4:].max(initial=0) > near else 12, -1)):
        n = min(len(out) // 2, int(SAMPLE_RATE * ms / 1000))
        if n:
            out[::edge][:n] *= np.linspace(0.0, 1.0, n, dtype=np.float32)
    return out.astype(np.int16)


def wav_to_mp3(wav_path, mp3_path):
    """转成 MP3。成品 HTML 里嵌的是它，体积约为 WAV 的七分之一。"""
    import soundfile as sf

    data, sr = sf.read(wav_path, dtype="int16")
    sf.write(mp3_path, data, sr, format="MP3")


def save_wav(path, pcm16):
    """把 int16 的 numpy 数组存成单声道 WAV。"""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with wave.open(path, "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SAMPLE_RATE)
        f.writeframes(pcm16.tobytes())
