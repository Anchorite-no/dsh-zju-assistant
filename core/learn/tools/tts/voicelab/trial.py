"""试克隆：让一个音色的每个候选参考句都读同一组测试句，量出克隆得像不像、语速正不正常、嗓音虚不虚。

    tts trial 某音色                       试 voices\\某音色\\candidates 下的全部候选
    tts trial 某音色 03_xxx.wav joined.wav   只试这几个（候选目录里的文件名，或任意音频的路径）
    tts trial 某音色 --lang en              测试句换成英语

模型只加载一次，所以先关掉朗读器：显存只够开一份模型。
测试句是同目录 sentences.json 里固定的几句讲课的话，所有音色都用它，分数才能互相比。
样句存到 voices\\<名字>\\trials\\<候选>\\<语言>-<序号>.wav，分数记在 trials\\scores.tsv（重跑只更新试过的那几行）：
  相似度  样句的声纹和这个音色的 voiceprint.npy 有多像，几句取平均。刻度见 voicelab\\README.md
  语速    样句的时长除以基准时长（sentences.json 里每句的 seconds，咲来读这一句通常用的时间）。1.2 以上是明显偏慢
  谐噪比  样句的嗓音里有音高的成分比气声高多少分贝。同一个音色的候选里明显垫底的，读出来像在小声说话
  齿音    样句里 s、sh、x 这类音最响的地方比元音最响的地方高多少分贝。越接近 0，每个齿音越"呲"
  气声    几句里有几句，模型在开口之前先吐了一口气（engine.breath 切掉的那种）。有的候选句句都有，有的一句没有
  掐尾    几句里有几句，最后一个字没说完就停了、补读过一遍
后四样量的是读出来的样句，不是参考句：参考句自己嗓音清楚，克隆出来照样可能发虚；气声也和参考句里喘不喘气对不上。
这里只管量，不替人挑：选哪一句，由做音色的人看着分数、对着样句定。
"""
import argparse
import contextlib
import csv
import glob
import io
import json
import os
import sys
import urllib.request

import numpy as np

import similar

import engine  # similar 已经把上一级目录加进了搜索路径

HERE = os.path.dirname(os.path.abspath(__file__))
SERVICE = "http://127.0.0.1:8766/status"  # 配音服务（朗读器的后台），端口见 serve.PORT
COLUMNS = ["候选", "语言", "参考句秒数", "相似度", "语速", "谐噪比", "齿音", "气声", "掐尾", "各句相似度", "各句秒数"]


def spoken_seconds(samples, rate):
    """去掉首尾静音之后的时长。"""
    hop = rate // 100
    n = len(samples) // hop
    db = 10 * np.log10((samples[: n * hop].reshape(n, hop) ** 2).mean(axis=1) + 1e-12)
    loud = np.flatnonzero(db > db.max() - 40)
    return (loud[-1] - loud[0] + 1) / 100


def hiss(samples, rate):
    """齿音比元音响多少分贝：高频占一半以上的帧里最响的，对几乎没有高频的帧里最响的。"""
    size, hop = 256, 64
    power = np.abs(np.fft.rfft(np.lib.stride_tricks.sliding_window_view(samples, size)[::hop] * np.hanning(size), axis=1)) ** 2
    db = 10 * np.log10(power.sum(axis=1) + 1e-12)
    high = power[:, np.fft.rfftfreq(size, 1 / rate) > 7000].sum(axis=1) / (power.sum(axis=1) + 1e-12)
    vowel = np.percentile(db[high < 0.1], 90)
    sharp = db[(high > 0.5) & (db > vowel - 25)]
    return float(np.percentile(sharp, 90) - vowel) if len(sharp) > 3 else float("nan")


def find(voice_dir, name):
    for path in (name, os.path.join(voice_dir, "candidates", name), os.path.join(voice_dir, name)):
        if os.path.isfile(path):
            return os.path.abspath(path)
    sys.exit(f"找不到这个候选：{name}")


def main():
    import librosa
    import soundfile as sf
    import torch

    import pick

    ap = argparse.ArgumentParser()
    ap.add_argument("name", help="音色名，voices\\ 下的文件夹")
    ap.add_argument("candidates", nargs="*", help="只试这几个候选，不给就试 candidates 下的全部 wav")
    ap.add_argument("--lang", choices=engine.LANGS, default="ja", help="测试句的语言，和配音的语言一致")
    args = ap.parse_intermixed_args()  # 候选的文件名写在 --lang 前面后面都行

    voice_dir = os.path.join(engine.VOICE_DIR, args.name)
    print_path = os.path.join(voice_dir, "voiceprint.npy")
    if not os.path.isfile(print_path):
        sys.exit(f"还没有这个音色的声纹。先跑：tts similar {os.path.join(voice_dir, 'candidates')} --save {print_path}")
    refs = [find(voice_dir, c) for c in args.candidates] or sorted(glob.glob(os.path.join(voice_dir, "candidates", "*.wav")))
    if not refs:
        sys.exit(f"没有候选：{os.path.join(voice_dir, 'candidates')} 下没有 wav")
    with open(os.path.join(HERE, "sentences.json"), encoding="utf-8") as f:
        sentences = json.load(f).get(args.lang)
    if not sentences:
        sys.exit(f"sentences.json 里没有 {args.lang} 的测试句")
    with contextlib.suppress(OSError):
        urllib.request.urlopen(SERVICE, timeout=1)
        sys.exit("朗读器（配音服务）正开着。先关掉它：显存只够开一份模型。")

    trial_dir = os.path.join(voice_dir, "trials")
    table = os.path.join(trial_dir, "scores.tsv")
    rows = {}
    if os.path.isfile(table):
        with open(table, encoding="utf-8-sig", newline="") as f:
            rows = {(r["候选"], r["语言"]): r for r in csv.DictReader(f, delimiter="\t")}

    target = np.load(print_path)
    scorer = similar.load_model()
    tts = engine.load()
    print(f"{args.name}：{len(refs)} 个候选，各读 {len(sentences)} 句{args.lang}测试句", flush=True)
    for ref in refs:
        stem = os.path.splitext(os.path.basename(ref))[0]
        sims, seconds, said, faults = [], [], [], []
        for n, sentence in enumerate(sentences, 1):
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):  # 模型的日志和进度条
                faults.append({})
                rate, pcm = engine.speak(tts, ref, sentence["text"], args.lang, seen=faults[-1])
            engine.save_wav(os.path.join(trial_dir, stem, f"{args.lang}-{n}.wav"), pcm)
            samples = pcm.astype(np.float32) / 32768
            sims.append(float(similar.embed(scorer, samples, rate) @ target))
            seconds.append(spoken_seconds(samples, rate))
            said.append(samples)
        said = np.concatenate(said)
        clear, sharp = pick.clarity(torch.from_numpy(librosa.resample(said, orig_sr=rate, target_sr=16000))), hiss(said, rate)
        breaths, cuts = (f"{sum(bool(f[k]) for f in faults)}/{len(faults)}" for k in ("breath", "again"))
        based = [s / sentence["seconds"] for s, sentence in zip(seconds, sentences) if sentence.get("seconds")]
        pace = f"{np.mean(based):.2f}" if based else ""  # sentences.json 里还没记基准时长，就只留各句秒数
        info = sf.info(ref)
        rows[stem, args.lang] = dict(zip(COLUMNS, [
            stem, args.lang, f"{info.frames / info.samplerate:.1f}", f"{np.mean(sims):.3f}", pace, f"{clear:.1f}", f"{sharp:+.1f}", breaths, cuts,
            " ".join(f"{s:.3f}" for s in sims), " ".join(f"{s:.2f}" for s in seconds)]))
        print(f"  相似度 {np.mean(sims):.3f}  语速 {pace or '未定基准'}  谐噪比 {clear:.1f}  齿音 {sharp:+.1f}  气声 {breaths}  掐尾 {cuts}  共 {sum(seconds):.1f} 秒  {stem}", flush=True)

    with open(table, "w", encoding="utf-8-sig", newline="") as f:
        out = csv.DictWriter(f, COLUMNS, delimiter="\t", lineterminator="\n")
        out.writeheader()
        out.writerows(sorted(rows.values(), key=lambda r: (r["语言"], -float(r["相似度"]))))
    print(f"分数表 {table}，样句在 {trial_dir}")


if __name__ == "__main__":
    main()
