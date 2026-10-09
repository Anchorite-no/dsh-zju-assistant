"""从录音或视频的音轨里，切出背景干净的人声句子，当参考音色的候选。

    tts harvest voices\\某音色\\data --out voices\\某音色           data 下的每个音频、视频文件
    tts harvest voices\\某音色\\data\\访谈.m4a --out voices\\某音色
    tts harvest BV1Wr1rBvEct --out voices\\某音色                 B 站视频，音轨先下载到 <out>\\data
    加 --like voices\\某音色\\voiceprint.npy 顺便报告每句和已有声纹的相似度

只留背景安静时的人声：前后 3 秒内最安静的时刻接近无声，说明那一段没有垫乐。垫着音乐的片段拿去克隆，
音乐会被当成音色的一部分。参考音色要的是一句 7 到 13 秒连续的自然语音，所以停顿不到 1 秒的相邻短句
连成一句，连起来超过 13 秒的在最长的停顿处断开。每句调到同样的响度，存到 <out>\\candidates，
文件名是来源加起始秒数。
克隆会把参考句的停顿方式一起学过去。说话慢、停顿多的人，按上面的切法切出来的句子中间一停一停的，
克隆出来也不顺。这时加 --gap 0.4 --min-seconds 5，只要中间没有明显停顿、一口气说下来的片段。
里面可能混有别的说话人、音效，或者情绪很重的句子：用 tts similar 量一遍，离其余各句远的删掉。
"""
import argparse
import json
import os
import re
import shutil
import sys
import urllib.request

import numpy as np

import similar

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
FRAME = 0.01        # 量响度的帧长，秒
BED_DB = -60        # 前后 3 秒内最安静的 5% 低于它，才算没有垫乐
SPEECH_DB = -45     # 高于它算有人声
JOIN = 0.35         # 这么短的停顿算同一口气
SENTENCE = 1.0      # 停顿不超过它的相邻短句连成一句
LONGEST = 13.0      # 一句最长这么多秒：IndexTTS 只看参考音频的前 15 秒
MEDIA = similar.AUDIO_EXT + (".m4a", ".aac", ".opus", ".wma", ".mp4", ".mkv", ".webm", ".mov", ".flv")


def get(url, referer):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Referer": referer}), timeout=60)


def fetch_bilibili(bvid, src_dir):
    """下载 B 站视频第一个分 P 的音轨（不登录能拿到的最高码率），已有就不重复下载。"""
    path = os.path.join(src_dir, bvid + ".m4a")
    if os.path.isfile(path):
        return path
    page = f"https://www.bilibili.com/video/{bvid}/"
    view = json.load(get(f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}", page))
    if view["code"]:
        sys.exit(f"查不到这个视频：{view['message']}")
    info = view["data"]
    play = json.load(get(f"https://api.bilibili.com/x/player/playurl?bvid={bvid}&cid={info['pages'][0]['cid']}&fnval=16", page))
    track = max(play["data"]["dash"]["audio"], key=lambda a: a["bandwidth"])
    print(f"下载《{info['title']}》的音轨，{info['duration']} 秒，约 {track['bandwidth'] * info['duration'] / 8e6:.1f} MB", flush=True)
    os.makedirs(src_dir, exist_ok=True)
    with get(track["baseUrl"], page) as r, open(path + ".part", "wb") as f:
        shutil.copyfileobj(r, f)
    os.replace(path + ".part", path)
    return path


def decode(path):
    """解码成单声道浮点。用 PyAV：B 站的音轨是 AAC，soundfile 读不了，本机又没有 ffmpeg。"""
    import av

    with av.open(path) as container:
        stream = container.streams.audio[0]
        rate = stream.rate
        mono = av.AudioResampler(format="flt", layout="mono", rate=rate)
        chunks = [f.to_ndarray()[0] for frame in container.decode(stream) for f in mono.resample(frame)]
        chunks += [f.to_ndarray()[0] for f in mono.resample(None)]
    return np.concatenate(chunks), rate


def cut(run):
    """一串连着的短句太长，就在最长的停顿处断开，直到每一段都不超过 LONGEST。"""
    if len(run) == 1 or (run[-1][1] - run[0][0]) * FRAME <= LONGEST:
        return [run]
    k = max(range(1, len(run)), key=lambda i: run[i][0] - run[i - 1][1])
    return cut(run[:k]) + cut(run[k:])


def find_clips(samples, rate, min_seconds, bed_db=BED_DB, gap=SENTENCE):
    """返回 [(起, 止, 停顿占比)]，起止的单位是秒：背景安静、不短于 min_seconds 的一句句人声。"""
    from scipy.ndimage import percentile_filter

    hop = int(rate * FRAME)
    n = len(samples) // hop
    power = (samples[: n * hop].reshape(n, hop) ** 2).mean(axis=1)
    db = np.maximum(10 * np.log10(power + 1e-12), -90)
    floor = percentile_filter(db, 5, size=int(6 / FRAME))
    voiced = np.flatnonzero((db > SPEECH_DB) & (floor < bed_db))
    if not len(voiced):
        return []
    breaks = np.flatnonzero(np.diff(voiced) > min(JOIN, gap) / FRAME)
    breaths = list(zip(np.r_[voiced[0], voiced[breaks + 1]], np.r_[voiced[breaks], voiced[-1]] + 1))
    sentences, run = [], breaths[:1]
    for breath in breaths[1:]:
        if breath[0] - run[-1][1] <= gap / FRAME:
            run.append(breath)
        else:
            sentences += cut(run)
            run = [breath]
    sentences += cut(run)
    clips = []
    for run in sentences:
        start, end = run[0][0], run[-1][1]
        if (end - start) * FRAME >= min_seconds:
            clips.append((start * FRAME, end * FRAME, 1 - sum(e - s for s, e in run) / (end - start)))
    return clips


def main():
    import soundfile as sf

    ap = argparse.ArgumentParser()
    ap.add_argument("source", help="B 站视频的 BV 号、一个音频或视频文件，或者放着它们的目录")
    ap.add_argument("--out", required=True, help="这个音色的目录，例如 voices\\某音色")
    ap.add_argument("--min-seconds", type=float, default=2.0, help="短于它的句子不要")
    ap.add_argument("--gap", type=float, default=SENTENCE, help="停顿超过多少秒就断成两句。想要一口气说下来的片段时调小，例如 0.4")
    ap.add_argument("--bed", type=float, default=BED_DB, help="背景低于多少分贝才算安静。录音有底噪、一句也切不出来时调高，例如 -50")
    ap.add_argument("--like", help="已有的参照（文件、目录或 .npy），给了就顺便报告每句和它的相似度")
    args = ap.parse_args()

    if re.fullmatch(r"BV\w{10}", args.source):
        paths = [fetch_bilibili(args.source, os.path.join(args.out, "data"))]
    elif os.path.isdir(args.source):
        paths = sorted(os.path.join(args.source, f) for f in os.listdir(args.source) if f.lower().endswith(MEDIA))
    else:
        paths = [args.source]
    if not paths:
        sys.exit(f"这个目录下没有音频或视频文件：{args.source}")

    model = target = None
    if args.like:
        model = similar.load_model()
        target = similar.target_of(model, args.like)
    clip_dir = os.path.join(args.out, "candidates")
    os.makedirs(clip_dir, exist_ok=True)
    total = 0
    for path in paths:
        samples, rate = decode(path)
        clips = find_clips(samples, rate, args.min_seconds, args.bed, args.gap)
        print(f"{os.path.basename(path)}：全长 {len(samples) / rate:.0f} 秒，背景干净的人声 {len(clips)} 句，共 {sum(e - s for s, e, _ in clips):.1f} 秒")
        stem = os.path.splitext(os.path.basename(path))[0]
        for start, end, pause in clips:
            clip = similar.leveled(samples[int(max(0, start - 0.05) * rate): int((end + 0.05) * rate)])
            name = f"{stem}_{start:05.1f}.wav"
            sf.write(os.path.join(clip_dir, name), clip, rate, subtype="PCM_16")
            like = f"  相似度 {float(similar.embed(model, clip, rate) @ target):.3f}" if model else ""
            print(f"  {name}  {end - start:4.1f} 秒  停顿 {pause * 100:2.0f}%{like}")
        total += len(clips)
    if total:
        print(f"候选在 {clip_dir}。接着用 tts similar 量一遍，把不是这个人的删掉")
    else:
        print("一句也没切出来。录音有底噪的话把 --bed 调高，例如 --bed -50；一直垫着音乐的素材用不了")


if __name__ == "__main__":
    main()
