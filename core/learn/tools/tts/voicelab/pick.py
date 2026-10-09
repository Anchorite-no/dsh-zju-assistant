"""从本机游戏的一个角色语音包里，挑出适合做参考音色的台词，并存下这个角色的声纹。

    tts pick "E:\\...\\pcm_DD.int" --out voices\\咲来
    tts pick "E:\\...\\Amakano3.pfs.000" --folder sound/vo/shi --out voices\\柳木诗梦

给包里每一句台词算声纹，取中心存成 <out>\\voiceprint.npy，之后用它量克隆得像不像。
再挑出适合当参考音色的句子导出到 <out>\\candidates：7 到 13 秒的单句，说得连贯（句中停顿少），
嗓音清楚（不带气声），音量正常（不是耳语也不是喊叫），不出自成人场景，并且最接近这个角色平常的声音。
参考音色会把语速、停顿、情绪一起带进克隆的结果，所以要挑说话平稳的句子；导出时调到同样的响度。
每句的声纹缓存在 <out>\\candidates\\lines.npz，重跑不用再算。哪个包是哪个角色，各导出几句听一下就知道。
给了 --dialogue（tts dialogue 导出的 lines.tsv）就把每句候选的日文和中文写进 <out>\\candidates\\台词.txt，
并且按场景名认成人场景（场景名以 h 结尾）。
CatSystem2 的游戏一个角色一个 .int 包；Artemis 的游戏所有角色在一个 .pfs 包里，用 --folder 指出这个角色的目录。
也可以直接给一个文件夹：里面一句台词一个音频文件，下载来的分角色语音包解开就是这样。
"连贯"默认按停顿占比算（--pause）。这个量法对录得轻、说话慢的角色偏严，一句也挑不出来时改用 --gap 0.3：
只要求最长的一处停顿不超过 0.3 秒。克隆会把参考句的停顿方式学过去，所以宁可句子短一点，也要挑一口气说下来的。
导出之后接着 tts trial <音色名>，让每个候选试克隆同一组测试句。
"""
import argparse
import csv
import glob
import io
import os
import re

import numpy as np

import pfs
import similar

FRAME = 320  # 16kHz 下的 20 毫秒
ADULT = re.compile(r"_[a-z]{2}\d\d[a-z]?h_", re.I)  # CatSystem2：语音文件名里的场景代号以 H 结尾的是成人场景


def clarity(wave):
    """谐噪比，单位分贝：说话的时候，嗓音里有音高的成分比沙沙的气声高多少。wave 是 16kHz 的一句话。
    正常说话在 9 上下；轻声细语、带气声的句子只有两三，拿去当参考句，克隆出来整段都发沙。"""
    import torch

    size, hop = 640, 160  # 40 毫秒一帧，每 10 毫秒取一帧
    if len(wave) < size:
        return 0.0
    frames = wave.unfold(0, size, hop)
    frames = frames - frames.mean(dim=1, keepdim=True)
    power = (frames ** 2).mean(dim=1)
    frames = frames[power > torch.quantile(power, 0.9) / 100]  # 只看比最响处低不到 20 分贝的帧
    auto = torch.fft.irfft(torch.fft.rfft(frames, n=2 * size).abs() ** 2)[:, :size]
    auto = auto / auto[:, :1].clamp_min(1e-9) / torch.linspace(1, 0.01, size, device=wave.device)
    peak = auto[:, 36:178].max(dim=1).values  # 音高在 90 到 450Hz 之间
    peak = peak[(peak > 0.3) & (peak < 0.999)]  # 只算有音高的帧
    return float((10 * torch.log10(peak / (1 - peak))).median()) if len(peak) else 0.0


def scan(archive):
    """包里每一句台词的声纹、时长、句中停顿、音量和谐噪比。有显卡就用显卡。"""
    import soundfile as sf
    import torch
    import torchaudio

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = similar.load_model().to(device)
    voices = archive.voices()
    rows = {"vec": [], "sec": [], "pause": [], "level": [], "gap": [], "hnr": []}
    for n, i in enumerate(voices, 1):
        samples, rate = sf.read(io.BytesIO(archive.read(i)), dtype="float32", always_2d=True)
        wave = torch.from_numpy(samples.mean(axis=1)).to(device)
        if rate != 16000:
            wave = torchaudio.functional.resample(wave, rate, 16000)
        frames = len(wave) // FRAME
        vec, pause, level, gap, hnr = np.zeros(192, np.float32), 1.0, -90.0, 99.0, 0.0
        if frames:
            db = 10 * torch.log10((wave[: frames * FRAME].reshape(frames, FRAME) ** 2).mean(1) + 1e-12)
            loud = db > -45
            where = torch.nonzero(loud).flatten()
            if len(where) >= 10:  # 不到 0.2 秒有声的是喘息和语气词，不算
                feat = torchaudio.compliance.kaldi.fbank(wave.unsqueeze(0), num_mel_bins=80, dither=0, sample_frequency=16000)
                with torch.no_grad():
                    out = model((feat - feat.mean(dim=0, keepdim=True)).unsqueeze(0))[0]
                vec = torch.nn.functional.normalize(out, dim=0).cpu().numpy()
                pause = float(1 - loud[where[0]: where[-1] + 1].float().mean())
                level = float(db[loud].mean())
                # 最长的一处停顿。按这一句自己的响度来量（比最响处低 40 分贝算停），录得轻的包也量得准
                still = (db < torch.quantile(db, 0.95) - 40).cpu().numpy()
                sound = np.flatnonzero(~still)
                run = longest = 0
                for q in still[sound[0]: sound[-1] + 1]:
                    run = run + 1 if q else 0
                    longest = max(longest, run)
                gap = longest * FRAME / 16000
                hnr = clarity(wave)
        rows["hnr"].append(hnr)
        rows["vec"].append(vec)
        rows["sec"].append(len(wave) / 16000)
        rows["pause"].append(pause)
        rows["level"].append(level)
        rows["gap"].append(gap)
        if n % 1000 == 0:
            print(f"  已算 {n}/{len(voices)} 句", flush=True)
    return {"index": np.array(voices), **{k: np.array(v) for k, v in rows.items()}}


def main():
    import soundfile as sf

    ap = argparse.ArgumentParser()
    ap.add_argument("archive", help="角色语音包，例如 pcm_DD.int 或 Amakano3.pfs.000；或者一句台词一个文件的文件夹")
    ap.add_argument("--folder", help=".pfs 包里这个角色的语音目录，例如 sound/vo/shi")
    ap.add_argument("--out", required=True, help="这个音色的目录，例如 voices\\咲来")
    ap.add_argument("--count", type=int, default=12, help="导出几句候选")
    ap.add_argument("--pause", type=float, default=0.12, help="句中停顿最多占多少。说话慢、停顿多的角色按默认值挑不出来时放宽，例如 0.2")
    ap.add_argument("--gap", type=float, help="换一种要求连贯的办法：最长的一处停顿不超过多少秒，例如 0.3。给了它就不看 --pause")
    ap.add_argument("--dialogue", help="tts dialogue 导出的 lines.tsv，给了就附上每句候选的台词")
    args = ap.parse_args()

    archive = pfs.open_pack(args.archive, args.folder)
    out_dir = os.path.join(args.out, "candidates")
    os.makedirs(out_dir, exist_ok=True)
    cache = os.path.join(out_dir, "lines.npz")
    lines = dict(np.load(cache)) if os.path.isfile(cache) else {}
    if not lines or "hnr" not in lines:  # 早先存的缓存里没有"最长停顿"和"谐噪比"，重算
        lines = scan(archive)
        np.savez(cache, **lines)

    voiced = (np.linalg.norm(lines["vec"], axis=1) > 0.5) & (lines["sec"] >= 2.0)
    print(f"{len(lines['sec'])} 句台词，共 {lines['sec'].sum() / 3600:.1f} 小时，其中 2 秒以上的 {voiced.sum()} 句")
    target = similar.centroid(list(lines["vec"][voiced]))
    np.save(os.path.join(args.out, "voiceprint.npy"), target)
    score = lines["vec"] @ target
    print(f"声纹存到 {os.path.join(args.out, 'voiceprint.npy')}；真人台词和它的相似度：中位数 {np.median(score[voiced]):.3f}，"
          f"四分位 {np.percentile(score[voiced], 25):.3f} 到 {np.percentile(score[voiced], 75):.3f}")

    # 音量正常：不要耳语，也不要喊叫。耳语按"比一般的句子轻 6 分贝以上"算，不按分位数算：
    # 有的包所有台词的音量只差三四分贝，按分位数会把最平稳的那些句子当成"太轻"砍掉（守岸人就是）
    quiet, loud = np.median(lines["level"][voiced]) - 6, np.percentile(lines["level"][voiced], 90)
    fluent = lines["gap"] <= args.gap if args.gap else lines["pause"] <= args.pause
    # 嗓音清楚：谐噪比不比这个人一般的句子低 2 分贝以上。气声重的句子克隆出来发沙
    clear = lines["hnr"] >= np.median(lines["hnr"][voiced]) - 2
    print(f"谐噪比：中位数 {np.median(lines['hnr'][voiced]):.1f} dB，低于 {np.median(lines['hnr'][voiced]) - 2:.1f} dB 的算气声重，不要")
    fit = voiced & (lines["sec"] >= 7) & (lines["sec"] <= 13) & fluent & clear & (lines["level"] >= quiet) & (lines["level"] <= loud)
    named = {j: archive.name(int(lines["index"][j]))[:-4] for j in np.flatnonzero(fit)}
    text = {}
    if args.dialogue:
        with open(args.dialogue, encoding="utf-8-sig", newline="") as f:
            text = {row[1].lower(): row for row in csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE) if row[1]}

    def adult(name):
        row = text.get(name.lower())
        return bool(ADULT.search(name)) or bool(row and row[0].lower().endswith("h"))

    best = sorted((j for j in named if not adult(named[j])), key=lambda j: -score[j])[: args.count]
    for old in glob.glob(os.path.join(out_dir, "[0-9][0-9]_*.wav")):  # 上一次导出的候选
        os.remove(old)
    print(f"连贯、嗓音清楚、音量正常、7 到 13 秒的有 {fit.sum()} 句，去掉成人场景后导出最接近平常声音的 {len(best)} 句：")
    with open(os.path.join(out_dir, "台词.txt"), "w", encoding="utf-8-sig", newline="\n") as listing:
        for rank, j in enumerate(best, 1):
            samples, rate = sf.read(io.BytesIO(archive.read(int(lines["index"][j]))), dtype="float32", always_2d=True)
            name = f"{rank:02d}_{named[j]}.wav"
            sf.write(os.path.join(out_dir, name), similar.leveled(samples.mean(axis=1)), rate, subtype="PCM_16")
            longest = f"，最长一处 {lines['gap'][j]:.2f} 秒  谐噪比 {lines['hnr'][j]:.1f}"
            print(f"  {name}  {lines['sec'][j]:4.1f} 秒  相似度 {score[j]:.3f}  停顿 {lines['pause'][j] * 100:2.0f}%{longest}")
            row = text.get(named[j].lower())
            listing.write(f"{name}\n  {row[3] if row else ''}\n  {row[5] if row else ''}\n\n")
    print(f"候选在 {out_dir}。接着 tts trial {os.path.basename(os.path.normpath(args.out))}，让每个候选试克隆同一组测试句")


if __name__ == "__main__":
    main()
