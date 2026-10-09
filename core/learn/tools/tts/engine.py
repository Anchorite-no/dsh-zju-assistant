"""本机 IndexTTS-2.5 的统一入口：路径、默认配置、加载和存盘。"""
import contextlib
import io
import json
import logging
import os
import wave

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
INDEXTTS_DIR = os.path.join(ROOT, "tools", "index-tts")
MODEL_DIR = os.path.join(INDEXTTS_DIR, "checkpoints")
VOICE_DIR = os.path.join(ROOT, "voices")  # 一个音色一个文件夹，里面的 voice.wav 是克隆用的参考音频
DEFAULT_VOICE = "咲来"
SAMPLE_RATE = 22050
LANGS = ("zh", "ja", "en")  # 配音语言。模型另外支持 es 和 ar，本机没有试过

os.environ.setdefault("HF_HUB_OFFLINE", "1")     # 模型都在本地，启动时不联网检查
os.environ.setdefault("USE_MODELSCOPE", "true")  # 万一需要补下载，走国内源
os.environ.setdefault("TQDM_DISABLE", "1")       # 每合成一句就画一条进度条，日志里全是它
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")  # 加载时那几段"将来的版本会如何"的提醒不用看
logging.getLogger("indextts").setLevel(logging.ERROR)     # 模型自带了一份 transformers 的代码，它的提醒走的是这个名字

# 本机（RTX 5080 16GB）基准后选定的配置，依据见 tools/tts/README.md。
# bf16 比 fp32 慢约 15%，但少占 2GB 显存和等量的系统提交内存，在页面文件调大之前更稳。
# torch.compile 在本机不可用：自带的 ptxas 不认这代显卡。
DEFAULTS = {"bf16": True, "compile": False}


def _release_vram_cache_between_models():
    """加载 w2v-bert 之前先归还闲置的显存缓存。

    Windows 下显存占用同样计入系统的"提交内存"。GPT 转成 bf16 后有约 2GB 缓存闲置，
    不归还的话，紧接着加载 w2v-bert 时系统提交内存可能耗尽，进程以 0xC0000005 崩溃。
    """
    import gc

    import torch
    from indextts import infer_v2_5

    original = infer_v2_5.Wav2Vec2BertModel.from_pretrained
    if getattr(original, "_learn_patched", False):
        return

    def from_pretrained(*args, **kwargs):
        gc.collect()
        torch.cuda.empty_cache()
        return original(*args, **kwargs)

    from_pretrained._learn_patched = True
    infer_v2_5.Wav2Vec2BertModel.from_pretrained = from_pretrained


ROOM_GB = 11   # 加载一次模型多用 9 到 10GB 系统提交内存，留一点富余
SLACK_GB = 6   # 加载期间尽量空着这么多。模型有时一口气要 3GB，来不及一块一块地还，所以留它的两倍


@contextlib.contextmanager
def room(step=0.5):
    """加载模型时套在外面：系统提交内存的余量不够，就先把够用的额度占住，模型要多少还多少。

    Windows 下显存占用也计入"提交内存"。余量不够时，模型一口气要好几个 GB，页面文件来不及扩，
    进程会以 0xC0000005 崩溃，还可能连带别的程序出错。慢慢要就扩得出来，所以先一小块一小块地
    占住提交额度（只占额度，不碰物理内存），把上限顶上去。
    占完不能一把全还回去再加载：实测还回去之后一两秒内上限就缩回去几个 GB。所以额度一直占着，
    另起一个线程盯着余量，模型一要内存、余量低于 SLACK_GB 就还一块，等于把额度交到模型手里。
    """
    if os.name != "nt":
        yield
        return
    import ctypes
    import threading
    import time
    from ctypes import wintypes

    class Status(ctypes.Structure):
        _fields_ = [("size", wintypes.DWORD), ("load", wintypes.DWORD)] + [(name, ctypes.c_ulonglong) for name in (
            "physical", "physical_free", "limit", "free", "virtual", "virtual_free", "extended")]

    kernel = ctypes.windll.kernel32
    kernel.VirtualAlloc.restype = ctypes.c_void_p
    kernel.VirtualAlloc.argtypes = (ctypes.c_void_p, ctypes.c_size_t, wintypes.DWORD, wintypes.DWORD)
    kernel.VirtualFree.argtypes = (ctypes.c_void_p, ctypes.c_size_t, wintypes.DWORD)

    def now():
        """（提交上限，余量），单位 GB。"""
        status = Status(size=ctypes.sizeof(Status))
        kernel.GlobalMemoryStatusEx(ctypes.byref(status))
        return status.limit / 2 ** 30, status.free / 2 ** 30

    limit, free = now()
    if free >= ROOM_GB + SLACK_GB:  # 本来就够，什么都不用做
        yield
        return
    blocks, failed = [], 0
    while len(blocks) * step < ROOM_GB + SLACK_GB and failed < 20:
        block = kernel.VirtualAlloc(None, int(step * 2 ** 30), 0x3000, 4)  # 保留并提交，可读写；不写入就不占物理内存
        if block:
            blocks.append(block)
        else:  # 页面文件正在扩，等一下再要
            failed += 1
            time.sleep(0.5)
    if failed >= 20:
        for block in blocks:
            kernel.VirtualFree(block, 0, 0x8000)
        raise MemoryError(f"系统提交内存的余量只有 {free:.1f}GB，页面文件也扩不出来，这时加载模型会崩。关掉一些占内存的程序再试。")
    raised = now()[0]
    print(f"系统提交内存的余量只有 {free:.1f}GB，先占住 {len(blocks) * step:.0f}GB 额度（上限 {limit:.1f} → {raised:.1f}GB），加载时交给模型", flush=True)

    done, seen = threading.Event(), {"lowest": None, "limit": raised}

    def hand_over():
        while not done.is_set():
            ceiling, left = now()
            seen["limit"] = min(seen["limit"], ceiling)
            if seen["lowest"] is not None:  # 刚占完时余量接近 0，先还到 SLACK_GB 再开始记
                seen["lowest"] = min(seen["lowest"], left)
            if left < SLACK_GB and blocks:
                kernel.VirtualFree(blocks.pop(), 0, 0x8000)
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
            kernel.VirtualFree(block, 0, 0x8000)
        ceiling, left = now()
        print(f"模型加载完：系统提交内存多用了 {(ceiling - left) - (limit - free):.1f}GB；期间余量最低 {seen['lowest']:.1f}GB，"
              f"上限最低 {seen['limit']:.1f}GB，占住的额度剩 {kept:.1f}GB 没用上", flush=True)


class _Steps(io.TextIOBase):
    """模型加载时自己打印的那十几行"某某权重已载入"不显示，只数：每打印完一行，就是又加载完一步。"""

    def __init__(self, tick):
        self.tick = tick

    def write(self, text):
        for _ in range(text.count("\n")):
            self.tick()
        return len(text)


def load(bf16=None, compile=None, tick=None):
    """加载模型。约需十几秒，一个进程里只加载一次。
    tick 给一个函数，每加载完一步就叫它一次（十几次），朗读器的进度条靠它知道走到哪了。"""
    tick = tick or (lambda: None)
    from indextts.infer_v2_5 import IndexTTS2  # 慢的导入先做完，占住额度之后立刻加载

    tick()
    _release_vram_cache_between_models()
    with room(), contextlib.redirect_stdout(_Steps(tick)):  # room 的两行在这之外，照常打印
        return IndexTTS2(
            cfg_path=os.path.join(MODEL_DIR, "config.yaml"),
            model_dir=MODEL_DIR,
            use_bf16=DEFAULTS["bf16"] if bf16 is None else bf16,
            use_torch_compile=DEFAULTS["compile"] if compile is None else compile,
            use_cuda_kernel=False,  # 需要 MSVC 和 CUDA Toolkit 现场编译，本机没有
        )


CACHE_DIR = os.path.join(ROOT, "out", "tts-cache")


def voice_id(voice_path):
    """参考音色的指纹：换了音色文件，以前合成的句子就都不算数。"""
    import hashlib

    with open(voice_path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:12]


# 模型认的八种情感，顺序是它定的：happy, angry, sad, afraid, disgusted, melancholic, surprised, calm
MOODS = ("欢快", "生气", "悲伤", "害怕", "厌恶", "低落", "惊讶", "平静")


def mood_of(values):
    """把请求里的情感权重理成八个 0 到 1 的数；没给或者全是 0 返回 None，表示照参考句原样读。"""
    if not values:
        return None
    if len(values) != len(MOODS):
        raise ValueError(f"情感要给 {len(MOODS)} 个数：{'、'.join(MOODS)}")
    mood = [round(min(1.0, max(0.0, float(v))), 2) for v in values]
    return mood if any(mood) else None


def fingerprint(lang, spoken, voice, speed=1.0, mood=None):
    """一句配音由语言、朗读文本、音色、语速、情感五样决定，都没变就可以复用。voice 是 voice_id 的结果。
    没调情感的句子，指纹和加这一项之前算出来的一样，早先合成的不用重来。"""
    import hashlib

    key = f"{lang}|{spoken}|{voice}|{float(speed)}" + (f"|{','.join(map(str, mood))}" if mood else "")
    return hashlib.sha256(key.encode()).hexdigest()[:16]


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


def voice_speed(name):
    """这个音色读的时候时长乘几（模型的 duration_factor）：voice.json 的 speed，没写就是 1，小于 1 读得快。
    克隆的语速跟着参考句走；有的人整套素材都说得慢（守岸人），换参考句也快不起来，就在这里调。"""
    try:
        return float(voice_info(name).get("speed") or 1.0)
    except (TypeError, ValueError):
        return 1.0


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


LOUDNESS = -18.0  # 每一句说话部分的响度（均方根，分贝）。咲来本来读出来就是这么响


def speak(tts, voice, text, lang, seen=None, **more):
    """让模型读一句，返回 (采样率, int16 的单声道音频)：开口前的气声切掉了，响度调好了，淡入淡出也做了。
    voice 是参考音频的路径，more 是另外交给模型的参数（情感、语速）。要模型出声的地方都走这里。
    seen 给一个字典，就记下这一句出过什么毛病：breath 是切掉的气声有几秒，again 是不是因为没说完补读了一遍。"""
    import numpy as np

    def take(**sampling):
        rate, wav = tts.infer(spk_audio_prompt=voice, text=text, output_path=None, lang=lang, **{**sampling, **more})
        pcm = np.ascontiguousarray(wav[:, 0] if wav.ndim == 2 else wav, dtype=np.int16)
        cut = breath(pcm)
        return rate, pcm[cut:], cut / rate

    rate, pcm, cut = take()
    again = ending(pcm) > -25
    if again:
        # 最后一个字还没落下去就停了：模型的采样偏向早点收尾。长度惩罚取 2 再读一遍，它会等这个字说完，
        # 哪一遍收得干净用哪一遍。不能一上来就取 2：带气声的音色（咲来）会因此句句多吐一口气，而且更响。
        second = take(length_penalty=2.0)
        if ending(second[1]) < ending(pcm):
            _, pcm, cut = second
    if seen is not None:
        seen.update(breath=cut, again=again)
    return rate, soften(leveled(pcm))


def breath(pcm):
    """开口之前多出来的那段气声有多少个采样，没有就是 0。
    有的参考句（咲来、结灯）会让模型在话前面先吐一口气：没有音高的"嘶"一声，一两百毫秒，有时和说话一样响，
    从第一个采样就满幅冒出来，隔几十毫秒的静音才开口。连着播放时，这就是句子之间的电流声和爆破声。
    只认最有把握的这一种：音频一开始就有声音（正常是等上几十毫秒才开口），持续 140 毫秒以上（清音声母
    没有这么长），里面没有清楚的音高，重心不高（s、sh 这类齿音在 4.5kHz 以上），然后响度掉下去一截。
    切到后面那句话之前 30 毫秒。说完之后的气声不切：它和轻声的最后一个字分不开，交给 soften 淡出。"""
    import numpy as np

    hop, size = SAMPLE_RATE // 100, 512  # 每 10 毫秒一格，音高和重心看以它为中心的 23 毫秒
    x = pcm.astype(np.float32)
    n = len(x) // hop
    if n < 50:
        return 0
    db = 10 * np.log10((x[:n * hop].reshape(n, hop) ** 2).mean(axis=1) + 1e-3)
    db -= np.percentile(db, 90)  # 相对这一句正常音量
    if db[:3].max() < -42:
        return 0
    first, end = int(np.argmax(db > -42)), 0
    for end in range(first + 5, min(n, first + 80)):
        if db[end] < max(-42.0, np.median(db[first:end]) - 15):  # 掉下去了：这一段到此为止
            break
    else:
        return 0
    if end - first < 14:
        return 0
    frames = np.lib.stride_tricks.sliding_window_view(np.pad(x[:end * hop + size], ((size - hop) // 2, size)), size)[::hop][first:end]
    frames = frames - frames.mean(axis=1, keepdims=True)
    auto = np.fft.irfft(np.abs(np.fft.rfft(frames, 2 * size)) ** 2)[:, :size]
    pitched = (auto[:, 49:245].max(axis=1) > 0.72 * auto[:, 0]) & (db[first:end] > -25)  # 90 到 450Hz 之间有清楚的周期
    power = np.abs(np.fft.rfft(frames * np.hanning(size), 2 * size)) ** 2
    centre = (power * np.fft.rfftfreq(2 * size, 1 / SAMPLE_RATE)).sum(axis=1) / (power.sum(axis=1) + 1e-9)
    if pitched.mean() >= 0.3 or np.median(centre) >= 4500:
        return 0
    floor, resume = max(-42.0, np.median(db[first:end]) - 15), end
    while resume < n and db[resume] < floor:
        resume += 1
    return max(end, resume - 3) * hop


def ending(pcm):
    """结尾前 80 到 40 毫秒里最响的地方，相对这一句正常音量的分贝。真人说完一句，从响到静要 150 毫秒上下；
    这里还不到 -25，就是最后一个字没说完被掐断了。"""
    import numpy as np

    hop = SAMPLE_RATE // 200
    n = len(pcm) // hop
    if n < 40:
        return -99.0
    db = 10 * np.log10((pcm[len(pcm) - n * hop:].astype(np.float32).reshape(n, hop) ** 2).mean(axis=1) + 1e-3)
    return float(db[-16:-8].max() - np.percentile(db, 90))


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
    """开头淡入、结尾淡出，各 12 毫秒。模型给的音频常常从波形中间直接开始（实测开头 3 毫秒就有满幅的
    一到三成），播放时会"啪"地爆一声；真人录音的开头是 0。哪一头贴着边还有声音（没切掉的短气声，
    没说完的最后一个字），那一头拉长到 40、60 毫秒，听起来是渐起渐收。凡是模型的输出都先过这里。"""
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
