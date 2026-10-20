"""音色相似度：一段合成出来的声音，和目标说话人像不像。

    tts similar <参照> <待测音频...>
    tts similar voices\\某音色\\candidates --save voices\\某音色\\voiceprint.npy

参照是目标说话人的真实录音：一个音频文件，或者一个放着多段录音的目录；
也可以是事先算好存下来的声纹（.npy）。
用的是 CAM++ 说话人模型（tools\\voiceprint 下的两个源码文件和 campplus_cn_common.bin，原是 IndexTTS 带的），
每段音频算一个 192 维的声纹向量，相似度是向量夹角的余弦，1 是完全一致，0 是毫不相干。
参照有多段时，先报告真人录音彼此之间有多像，这是克隆能达到的上限；排在最前面、离其余各段最远的，
多半是别的说话人、音效或情绪很重的句子。
--save 把参照的声纹中心存下来，这个音色以后都拿它当尺。
只加载声纹模型，在 CPU 上跑，不占显存。
"""
import argparse
import glob
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))  # engine 在上一级
import engine  # noqa: E402

AUDIO_EXT = (".wav", ".mp3", ".flac", ".ogg")
LEVEL_DB = -23  # 候选参考句统一调到的均方根响度


def leveled(samples):
    """调到统一的响度，并且不许削顶。克隆出来的音量跟着参考句走，所以候选参考句都先过这里。"""
    x = samples * 10 ** (LEVEL_DB / 20) / (np.sqrt((samples ** 2).mean()) + 1e-9)
    return x * min(1.0, 0.89 / (np.abs(x).max() + 1e-9))


def load_model():
    import torch

    sys.path.insert(0, engine.VOICEPRINT_DIR)  # 源码在这下面照原来的包路径放着，所以导入的写法不用变
    from indextts.s2mel.modules.campplus.DTDNN import CAMPPlus

    model = CAMPPlus(feat_dim=80, embedding_size=192)
    model.load_state_dict(torch.load(engine.VOICEPRINT_MODEL, map_location="cpu"))
    return model.eval()


def embed(model, samples, rate):
    """一段单声道音频的声纹向量（已归一化）。特征提取和 IndexTTS 推理时一致。"""
    import librosa
    import torch
    import torchaudio

    if rate != 16000:
        samples = librosa.resample(samples, orig_sr=rate, target_sr=16000)
    wave = torch.from_numpy(np.ascontiguousarray(samples, dtype=np.float32)).unsqueeze(0)
    feat = torchaudio.compliance.kaldi.fbank(wave, num_mel_bins=80, dither=0, sample_frequency=16000)
    feat = feat - feat.mean(dim=0, keepdim=True)
    with torch.no_grad():
        vec = model(feat.unsqueeze(0))[0].numpy()
    return vec / np.linalg.norm(vec)


def embed_file(model, path):
    import soundfile as sf

    samples, rate = sf.read(path, dtype="float32", always_2d=True)
    return embed(model, samples.mean(axis=1), rate)


def centroid(vectors):
    mean = np.mean(vectors, axis=0)
    return mean / np.linalg.norm(mean)


def audio_files(path):
    if os.path.isdir(path):
        return sorted(f for f in glob.glob(os.path.join(path, "*")) if f.lower().endswith(AUDIO_EXT))
    return [path]


def target_of(model, ref):
    """参照的声纹。.npy 是事先算好存下来的；其余是一段录音或放录音的目录，取各段的中心。"""
    if ref.lower().endswith(".npy"):
        return np.load(ref)
    files = audio_files(ref)
    if not files:
        sys.exit(f"参照里没有音频：{ref}")
    return centroid([embed_file(model, f) for f in files])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ref", help="目标说话人的真实录音：文件，或放着多段录音的目录")
    ap.add_argument("audio", nargs="*", help="待测的音频文件或目录")
    ap.add_argument("--save", help="把参照的声纹中心存成这个文件，例如 voices\\某音色\\voiceprint.npy")
    args = ap.parse_args()

    model = load_model()
    if args.ref.lower().endswith(".npy"):
        refs, ref_vecs, target = [], [], target_of(model, args.ref)
    else:
        refs = audio_files(args.ref)
        if not refs:
            sys.exit(f"参照里没有音频：{args.ref}")
        ref_vecs = [embed_file(model, f) for f in refs]
        target = centroid(ref_vecs)

    if not refs:
        print(f"参照是存好的声纹：{args.ref}")
    elif len(refs) > 1:
        # 每一段和其余各段的中心比，避免自己和自己比
        own = [float(v @ centroid(ref_vecs[:i] + ref_vecs[i + 1:])) for i, v in enumerate(ref_vecs)]
        print(f"参照 {len(refs)} 段，真人自己和自己：平均 {np.mean(own):.3f}，最低 {min(own):.3f}，最高 {max(own):.3f}")
        for f, s in sorted(zip(refs, own), key=lambda x: x[1]):
            print(f"  {s:.3f}  {os.path.basename(f)}")
    else:
        print("参照只有 1 段，无法估计真人自己和自己的相似度")
    if args.save:
        np.save(args.save, target)
        print(f"声纹存到 {args.save}")

    for path in args.audio:
        for f in audio_files(path):
            print(f"{float(embed_file(model, f) @ target):.3f}  {f}")


if __name__ == "__main__":
    main()
