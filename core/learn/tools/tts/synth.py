"""按解说词逐句合成配音（WAV 和 MP3），并把每句的真实时长写进 manifest.json。

    tts synth --narration <解说词.json> --out-dir <输出目录>

解说词是 {"lang": "ja", "lines": [...]}，每项 {"key": "s1", "text": "字幕文本", "tts": "朗读文本"}。
读的是 tts：外语配音时它是这一句的译文，中文配音时可以不写，不写就读字幕。
只给一个数组时按中文读。语言、文本、音色都没变的句子直接复用上次的音频。
"""
import argparse
import contextlib
import io
import json
import os
import shutil
import sys
import time

import engine


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--narration", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--voice", help="参考音色的路径，或 voices/ 下的名字")
    ap.add_argument("--lang", choices=engine.LANGS, help="配音语言，不给就用解说词里写的")
    ap.add_argument("--force", action="store_true", help="忽略缓存，全部重新合成")
    args = ap.parse_args()

    with open(args.narration, encoding="utf-8") as f:
        narration = json.load(f)
    if isinstance(narration, list):
        narration = {"lines": narration}
    lang = args.lang or narration.get("lang", "zh")
    if lang not in engine.LANGS:
        sys.exit(f"不认识的配音语言：{lang}")
    lines = [x for x in narration["lines"] if (x.get("tts") or x.get("text") or "").strip()]
    keys = [x["key"] for x in lines]
    if len(set(keys)) != len(keys):
        sys.exit("解说词里有重复的 key")

    voice = engine.resolve_voice(args.voice)
    out_dir = os.path.abspath(args.out_dir)
    os.makedirs(out_dir, exist_ok=True)
    manifest_path = os.path.join(out_dir, "manifest.json")
    old = {}
    if os.path.isfile(manifest_path) and not args.force:
        with open(manifest_path, encoding="utf-8") as f:
            old = json.load(f).get("lines", {})

    voice_id = engine.voice_id(voice)
    todo = []
    result = {}
    for x in lines:
        spoken = (x.get("tts") or x["text"]).strip()
        fp = engine.fingerprint(lang, spoken, voice_id)
        wav_path = os.path.join(out_dir, x["key"] + ".wav")
        prev = old.get(x["key"])
        if prev and prev.get("fingerprint") == fp and os.path.isfile(wav_path):
            result[x["key"]] = prev
        elif os.path.isfile(engine.cached(fp)) and not args.force:  # 播放时现场合成过的句子
            shutil.copyfile(engine.cached(fp), wav_path)
            result[x["key"]] = {"file": x["key"] + ".wav", "seconds": engine.wav_seconds(wav_path), "spoken": spoken, "fingerprint": fp}
        else:
            todo.append((x["key"], spoken, fp, wav_path))

    print(f"配音语言 {lang}：共 {len(lines)} 句，复用 {len(result)} 句，需合成 {len(todo)} 句", flush=True)
    wall = 0.0
    if todo:
        tts = engine.load()
        for i, (key, spoken, fp, wav_path) in enumerate(todo, 1):
            t0 = time.perf_counter()
            with contextlib.redirect_stdout(io.StringIO()):
                sr, pcm = engine.speak(tts, voice, spoken, lang)
            took = time.perf_counter() - t0
            wall += took
            engine.save_wav(wav_path, pcm)
            seconds = round(len(pcm) / sr, 3)
            result[key] = {"file": key + ".wav", "seconds": seconds, "spoken": spoken, "fingerprint": fp}
            print(f"[{i}/{len(todo)}] {key}  {seconds:.2f}s 音频，用时 {took:.2f}s", flush=True)

    for key in keys:
        wav_path, mp3_path = os.path.join(out_dir, key + ".wav"), os.path.join(out_dir, key + ".mp3")
        if not os.path.isfile(mp3_path) or os.path.getmtime(mp3_path) < os.path.getmtime(wav_path):
            engine.wav_to_mp3(wav_path, mp3_path)

    ordered = {k: result[k] for k in keys}
    total = sum(v["seconds"] for v in ordered.values())
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump({"lang": lang, "voice": os.path.basename(voice), "engine": engine.ENGINE, "sample_rate": engine.SAMPLE_RATE,
                   "total_seconds": round(total, 3), "lines": ordered}, f, ensure_ascii=False, indent=1)
    new_audio = sum(result[k]["seconds"] for k, *_ in todo)
    rtf = f"，实时率 {wall / new_audio:.2f}" if new_audio else ""
    print(f"完成：配音总长 {total:.1f}s，本次合成用时 {wall:.1f}s{rtf}")
    print(f"时长清单：{manifest_path}")


if __name__ == "__main__":
    main()
