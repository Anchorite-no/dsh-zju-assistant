"""把一个目录里的真人短片段拼成一条参考句，当一个候选。素材里没有 7 秒以上连贯的句子时才用它。

    tts voice voices\\某音色\\candidates --out voices\\某音色\\candidates\\joined.wav

IndexTTS 只看参考音频的前 15 秒，所以拼就是挑：每个片段和其余片段的中心比一次相似度，
从最像的开始取，凑到 15 秒为止；每段调到同样的响度，中间隔 0.3 秒静音。
最像中心的片段是这个人最平常的声音，离得远的往往是情绪重的台词、音效或别的角色。
拼出来的参考句克隆时容易偏慢，和最长的自然句一起拿去试克隆（tts trial），看分数再定。
"""
import argparse
import os
import sys

import numpy as np

import similar

LIMIT = 15.0     # IndexTTS 截取参考音频的长度，秒
PAUSE = 0.3


def main():
    import librosa
    import soundfile as sf

    ap = argparse.ArgumentParser()
    ap.add_argument("clips", help="放着真人片段的目录")
    ap.add_argument("--out", required=True, help="拼出来的候选，例如 voices\\某音色\\candidates\\joined.wav")
    args = ap.parse_args()

    files = similar.audio_files(args.clips)
    if len(files) < 2:
        sys.exit("至少要两个片段才能挑")
    model = similar.load_model()
    clips = []
    for f in files:
        samples, rate = sf.read(f, dtype="float32", always_2d=True)
        clips.append({"name": os.path.basename(f), "samples": samples.mean(axis=1), "rate": rate})
    vecs = [similar.embed(model, c["samples"], c["rate"]) for c in clips]
    for i, c in enumerate(clips):
        c["score"] = float(vecs[i] @ similar.centroid(vecs[:i] + vecs[i + 1:]))

    rate = clips[0]["rate"]
    parts, total = [], 0.0
    for c in sorted(clips, key=lambda c: -c["score"]):
        seconds = len(c["samples"]) / c["rate"]
        took = total + seconds + (PAUSE if parts else 0) <= LIMIT
        print(f"  {'取' if took else '  '}  {c['score']:.3f}  {seconds:4.1f} 秒  {c['name']}")
        if not took:
            continue
        x = c["samples"] if c["rate"] == rate else librosa.resample(c["samples"], orig_sr=c["rate"], target_sr=rate)
        x = similar.leveled(x)
        if parts:
            parts.append(np.zeros(int(PAUSE * rate), dtype=np.float32))
            total += PAUSE
        parts.append(x)
        total += seconds
    sf.write(args.out, np.concatenate(parts), rate, subtype="PCM_16")
    print(f"参考音色 {args.out}：{total:.1f} 秒")


if __name__ == "__main__":
    main()
