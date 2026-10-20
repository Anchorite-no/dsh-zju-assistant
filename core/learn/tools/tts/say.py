"""边合成边出声：试听音色。

    tts say "要读的文字" --play
    tts say "読ませたい文章" --lang ja --play
    tts say --file 稿子.txt --out 试听.wav

文字按句号、问号、感叹号切成小段，一段合成完就交给播放线程，同时继续合成下一段。
"""
import argparse
import contextlib
import io
import queue
import re
import sys
import threading
import time
import wave

import numpy as np

import engine


def player(q):
    import winsound

    while True:
        pcm = q.get()
        if pcm is None:
            return
        buf = io.BytesIO()
        with wave.open(buf, "wb") as f:
            f.setnchannels(1)
            f.setsampwidth(2)
            f.setframerate(engine.SAMPLE_RATE)
            f.writeframes(pcm.tobytes())
        winsound.PlaySound(buf.getvalue(), winsound.SND_MEMORY)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("text", nargs="?")
    ap.add_argument("--file", help="从文本文件读入")
    ap.add_argument("--voice", help="参考音色的路径，或 voices/ 下的名字")
    ap.add_argument("--lang", choices=engine.LANGS, default="zh", help="这段文字是什么语言")
    ap.add_argument("--play", action="store_true", help="用扬声器边合成边播放")
    ap.add_argument("--out", help="把完整音频另存为 WAV")
    args = ap.parse_args()

    if args.file:
        with open(args.file, encoding="utf-8") as f:
            text = f.read().strip()
    else:
        text = (args.text or "").strip()
    if not text:
        sys.exit("没有要读的文字")
    voice = engine.resolve_voice(args.voice)

    tts = engine.load()
    q = queue.Queue()
    th = None
    if args.play:
        th = threading.Thread(target=player, args=(q,), daemon=True)
        th.start()

    chunks = []
    t0 = time.perf_counter()
    first = None
    for part in re.findall(r"[^。！？!?\n]+[。！？!?]*", text):
        if not part.strip():
            continue
        with contextlib.redirect_stdout(io.StringIO()):
            _, pcm = engine.speak(tts, voice, part.strip(), args.lang)
        pcm = np.r_[pcm, np.zeros(int(engine.SAMPLE_RATE * 0.3), dtype=np.int16)]  # 句间停 0.3 秒
        if first is None:
            first = time.perf_counter() - t0
        chunks.append(pcm)
        if args.play:
            q.put(pcm)
    wall = time.perf_counter() - t0
    audio = sum(len(c) for c in chunks) / engine.SAMPLE_RATE
    print(f"首段出声 {first:.2f}s；合成 {audio:.1f}s 音频用时 {wall:.1f}s，实时率 {wall / audio:.2f}", flush=True)

    if args.out:
        engine.save_wav(args.out, np.concatenate(chunks))
        print(f"已保存：{args.out}")
    if th:
        q.put(None)
        th.join()


if __name__ == "__main__":
    main()
