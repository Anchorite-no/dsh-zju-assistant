"""IndexTTS-2.5 本机基准：测一种配置的显存峰值、实时率和流式余量。

每种配置单独起一个进程跑，结果写成 JSON：
    tts bench --name bf16 --bf16 --out out\bench\bf16.json
"""
import argparse
import contextlib
import io
import json
import os
import re
import statistics
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

# 讲解旁白式的句子，长度从一句到一整段
TEXTS = {
    "一句(16字)": "我们先从一个最简单的问题开始。",
    "两句(36字)": "如果每次都要从一堆数里找出最小的那个，最笨的办法，是把它们全部看一遍。",
    "一段(83字)": "这当然可行，但是太慢了。每找一次，就要把所有的数重新比较一遍。有没有一种摆放方式，让最小的那个数永远待在最容易拿到的位置，而且拿走它之后，剩下的数还能很快重新排好？",
    "长段(196字)": "答案是有的，这种结构叫做堆。你可以把它想象成一棵树，每个节点上放一个数，并且遵守一条规矩：父亲永远不比孩子大。这条规矩很弱，它并不要求左边比右边小，也不要求整棵树有序，它只管父子之间的关系。但正是这条很弱的规矩，保证了最小的数一定在树根。因为如果它不在树根，那它一定有一个父亲，而父亲不能比它大，这就矛盾了。所以我们只要看一眼树根，就拿到了最小值，不需要任何比较。",
}

TIMING = re.compile(r">> (gpt_gen_time|s2mel_time|bigvgan_time): ([\d.]+) seconds")


def run_once(tts, voice, text, gen):
    """合成一次，返回耗时、音频时长和三个阶段各自的用时。"""
    buf = io.StringIO()
    t0 = time.perf_counter()
    with contextlib.redirect_stdout(buf):
        sr, wav = tts.infer(spk_audio_prompt=voice, text=text, output_path=None, lang="ZH", **gen)
    wall = time.perf_counter() - t0
    audio = wav.shape[0] / sr
    stages = {k: float(v) for k, v in TIMING.findall(buf.getvalue())}
    return {"wall": wall, "audio": audio, "rtf": wall / audio, **stages}


def run_stream(tts, voice, text, max_tokens, gen):
    """分段流式合成：记录每段就绪的时刻，算首段延迟和最小余量。

    余量 = 该段必须开始播放的时刻 - 它实际就绪的时刻，负数表示播放会卡顿。
    第一段一就绪就开播，余量恒为 0，所以只统计第二段起。
    """
    sr = 22050
    ready, durs = [], []
    t0 = time.perf_counter()
    with contextlib.redirect_stdout(io.StringIO()):
        chunks = tts.infer(spk_audio_prompt=voice, text=text, output_path=None, lang="ZH",
                           stream_return=True, max_text_tokens_per_segment=max_tokens, **gen)
        for chunk in chunks:
            ready.append(time.perf_counter() - t0)
            durs.append(chunk.shape[-1] / sr)
    total = time.perf_counter() - t0
    # 语音段和静音段交替返回；静音段几乎不耗时，合并到前一段语音里看
    speech_ready = ready[0::2]
    played, slack = 0.0, []
    for i, r in enumerate(speech_ready):
        slack.append(speech_ready[0] + played - r)
        played += durs[2 * i] + (durs[2 * i + 1] if 2 * i + 1 < len(durs) else 0.0)
    return {
        "segments": len(speech_ready),
        "first_audio": speech_ready[0],
        "min_slack": min(slack[1:]) if len(slack) > 1 else None,
        "wall": total,
        "audio": sum(durs),
        "rtf": total / sum(durs),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--bf16", action="store_true")
    ap.add_argument("--compile", action="store_true")
    ap.add_argument("--beams", type=int, help="束搜索宽度，上游默认 3")
    ap.add_argument("--voice", default=os.path.join(ROOT, "voices", "咲来", "voice.wav"))
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    import torch

    import engine

    t0 = time.perf_counter()
    tts = engine.load(bf16=args.bf16, compile=args.compile)
    load = time.perf_counter() - t0
    gb = 1024 ** 3
    gen = {"num_beams": args.beams} if args.beams else {}
    result = {
        "name": args.name,
        "flags": {"bf16": args.bf16, "compile": args.compile, "beams": args.beams or 3},
        "torch": torch.__version__,
        "gpu": torch.cuda.get_device_name(0),
        "load_seconds": load,
        "vram_after_load_gb": torch.cuda.memory_allocated() / gb,
    }

    # 预热：第一次合成含参考音色编码和各种惰性初始化（开了 compile 时还含编译）
    warm = [run_once(tts, args.voice, t, gen) for t in TEXTS.values()]
    result["warmup_seconds"] = sum(w["wall"] for w in warm)
    torch.cuda.reset_peak_memory_stats()

    rows = {}
    for label, text in TEXTS.items():
        runs = [run_once(tts, args.voice, text, gen) for _ in range(args.reps)]
        rows[label] = {k: statistics.median(r[k] for r in runs) for k in runs[0]}
        print(f"[{args.name}] {label}: RTF {rows[label]['rtf']:.3f} "
              f"({rows[label]['wall']:.2f}s -> {rows[label]['audio']:.2f}s)", file=sys.stderr, flush=True)
    result["texts"] = rows
    wall = sum(r["wall"] for r in rows.values())
    audio = sum(r["audio"] for r in rows.values())
    result["overall_rtf"] = wall / audio

    long_text = "".join(TEXTS.values())
    result["stream"] = {
        f"max_tokens={n}": run_stream(tts, args.voice, long_text, n, gen) for n in (120, 60)
    }
    result["vram_peak_allocated_gb"] = torch.cuda.max_memory_allocated() / gb
    result["vram_peak_reserved_gb"] = torch.cuda.max_memory_reserved() / gb

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"[{args.name}] overall RTF {result['overall_rtf']:.3f}, "
          f"peak VRAM {result['vram_peak_reserved_gb']:.2f} GB", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
