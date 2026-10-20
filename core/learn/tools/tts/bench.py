"""本机配音模型的基准：加载用时、显存峰值、合成 1 秒声音要几秒。

    tts bench --out out\\bench\\qwen3.json

先关掉朗读器：显存里放两份模型没有意义，测出来的数也不准。
"""
import argparse
import contextlib
import io
import json
import os
import statistics
import time

import engine

# 讲解旁白式的句子，长度从一句到一整段
TEXTS = {
    "一句(16字)": "我们先从一个最简单的问题开始。",
    "两句(36字)": "如果每次都要从一堆数里找出最小的那个，最笨的办法，是把它们全部看一遍。",
    "一段(83字)": "这当然可行，但是太慢了。每找一次，就要把所有的数重新比较一遍。有没有一种摆放方式，让最小的那个数永远待在最容易拿到的位置，而且拿走它之后，剩下的数还能很快重新排好？",
    "长段(196字)": "答案是有的，这种结构叫做堆。你可以把它想象成一棵树，每个节点上放一个数，并且遵守一条规矩：父亲永远不比孩子大。这条规矩很弱，它并不要求左边比右边小，也不要求整棵树有序，它只管父子之间的关系。但正是这条很弱的规矩，保证了最小的数一定在树根。因为如果它不在树根，那它一定有一个父亲，而父亲不能比它大，这就矛盾了。所以我们只要看一眼树根，就拿到了最小值，不需要任何比较。",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", help="参考音色的路径，或 voices/ 下的名字")
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    import torch

    voice = engine.resolve_voice(args.voice)
    t0 = time.perf_counter()
    tts = engine.load()
    load = time.perf_counter() - t0

    def once(text):
        t = time.perf_counter()
        with contextlib.redirect_stdout(io.StringIO()):
            rate, pcm = engine.speak(tts, voice, text, "zh")
        wall, audio = time.perf_counter() - t, len(pcm) / rate
        return {"wall": wall, "audio": audio, "rtf": wall / audio}

    t0 = time.perf_counter()
    once("准备好了。")  # 头一句要算参考音色
    first = time.perf_counter() - t0
    torch.cuda.reset_peak_memory_stats()
    rows = {}
    for label, text in TEXTS.items():
        runs = [once(text) for _ in range(args.reps)]
        rows[label] = {k: statistics.median(r[k] for r in runs) for k in runs[0]}
        print(f"{label}: {rows[label]['audio']:.1f}s 音频，用时 {rows[label]['wall']:.1f}s，实时率 {rows[label]['rtf']:.2f}", flush=True)
    result = {"engine": engine.ENGINE, "torch": torch.__version__, "gpu": torch.cuda.get_device_name(0), "voice": os.path.basename(os.path.dirname(voice)),
              "load_seconds": load, "first_sentence_seconds": first, "vram_peak_gb": torch.cuda.max_memory_allocated() / 2 ** 30, "texts": rows}
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print(f"加载 {load:.0f}s，头一句 {first:.0f}s，显存峰值 {result['vram_peak_gb']:.1f}GB；已写入 {args.out}")


if __name__ == "__main__":
    main()
