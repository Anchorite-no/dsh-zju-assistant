"""把游戏的包按真名解出来，文件内容原样不动。认 CatSystem2 的 .int 和 Artemis 的 .pfs。

    tts unpack "E:\\...\\pcm_DD.int" --out voices\\咲来\\data\\game-voice
    tts unpack "E:\\...\\Amakano3.pfs.000" --folder sound/vo/shi --out voices\\柳木诗梦\\data\\game-voice

只解语音（.ogg）和脚本（.cst、.ast）。语音包里另有口型数据，跳过。
.pfs 包里所有角色在一起，用 --folder 只解一个目录。已经解出来的文件不重复写，中断了可以接着跑。
"""
import argparse
import os

import pfs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("archive", help="要解的包，例如 pcm_DD.int 或 Amakano3.pfs.000")
    ap.add_argument("--folder", help=".pfs 包里只解这个目录，例如 sound/vo/shi")
    ap.add_argument("--out", required=True, help="解到哪个目录")
    args = ap.parse_args()

    archive = pfs.open_pack(args.archive, args.folder)
    os.makedirs(args.out, exist_ok=True)
    seen = set()
    written = kept = skipped = size = 0
    for i, (_, length) in enumerate(archive.entries):
        name = archive.name(i)
        if not name:
            skipped += 1
            continue
        if name.lower() in seen:  # Windows 不分大小写，只差大小写的两个文件会互相覆盖
            stem, ext = os.path.splitext(name)
            name = f"{stem}~{i}{ext}"
        seen.add(name.lower())
        path = os.path.join(args.out, name)
        size += length
        if os.path.isfile(path) and os.path.getsize(path) == length:
            kept += 1
            continue
        with open(path, "wb") as f:
            f.write(archive.read(i))
        written += 1
        if written % 1000 == 0:
            print(f"  已解出 {written} 个", flush=True)
    archive.close()
    print(f"{os.path.basename(args.archive)}：解出 {written} 个，已有 {kept} 个，共 {size / 1e6:.0f} MB；"
          f"不是语音和脚本的跳过 {skipped} 个。在 {args.out}")


if __name__ == "__main__":
    main()
