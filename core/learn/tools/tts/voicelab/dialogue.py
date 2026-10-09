"""把本机游戏的台词导出来：日文原文、中文译文，以及每句对应的语音文件。

    tts dialogue "E:\\...\\游戏目录" --out voices\\咲来\\data\\game-script

认两种引擎。CatSystem2（《甜蜜女友2+》）：日文脚本在 scene.int，汉化补丁的中文脚本在 cndate*.int。
Artemis（《甜蜜女友3》）：脚本是 .pfs 包里的 script/*.ast，第一个带脚本的包是日文，后面的包是汉化补丁。
两边句数相同，按顺序逐句对齐。
产出：
  <out>\\scenes\\<场景>.txt   一个场景一个文件，逐句列出语音文件名、说话人、日文、中文
  <out>\\lines.tsv            全部台词一张表：场景、语音、说话人、日文、中文
CatSystem2 的语音文件名前两个字母就是角色的语音包，例如 DD_01_YU02_001 在 pcm_DD.int 里；
Artemis 的语音文件名中间是角色代号，例如 fem_shi_00001 在 sound/vo/shi 下。
导出的内容是游戏的版权文本，只放在本机自己看。
"""
import argparse
import glob
import os
import re
import struct
import sys
import zlib

import kif
import pfs


def parse(data):
    """一个 .cst 脚本里的全部条目：[(类型, 原始字节)]。0x20 是对白，0x21 是说话人，0x30 是命令。"""
    packed, size = struct.unpack_from("<II", data, 8)
    raw = zlib.decompress(data[16: 16 + packed]) if packed else data[16: 16 + size]
    table, strings = struct.unpack_from("<II", raw, 8)
    offsets = struct.unpack_from(f"<{(strings - table) // 4}I", raw, 16 + table)
    entries = []
    for o in offsets:
        start = 16 + strings + o
        entries.append((raw[start + 1], raw[start + 2: raw.index(b"\0", start + 2)]))
    return entries


def spoken(data, encoding):
    """脚本里的每句对白：[(语音文件名或 None, 说话人或 None, 对白)]。"""
    lines, voice, who = [], None, None
    for kind, text in parse(data):
        if kind == 0x30 and text[:4].lower() == b"pcm ":
            voice = text[4:].decode("ascii", "replace").strip()
        elif kind == 0x21:
            who = text.decode(encoding, "replace")
        elif kind == 0x20:
            lines.append((voice, who, text.decode(encoding, "replace").replace("\t", " ")))
            voice = who = None
    return lines


def spoken_ast(data):
    """Artemis 的 .ast 脚本里的每句对白，形状和 spoken 的结果一样。脚本是一行一项的 Lua 表：
    text={ vo={ {"vo",file="语音"}, }, ja={ { name={"说话人"}, "对白", }, }, }。几个人同时说的一句，每个语音各算一行。"""
    lines, depth = [], 0
    for row in data.decode("utf-8", "replace").splitlines():
        row = row.strip()
        if not depth:
            if row == "text={":
                depth, voices, who, text = 1, [], None, []
        elif row.endswith("{"):
            depth += 1
        elif row in ("},", "}"):
            depth -= 1
            if not depth and text:
                lines += [(voice, who, "".join(text)) for voice in voices or [None]]
        elif row.startswith('{"vo"'):
            voices += re.findall(r'file="([^"]+)"', row)
        elif row.startswith("name={"):
            who = re.search(r'"([^"]*)"', row)[1]
        elif row.startswith('"'):
            text.append(row.rstrip(",")[1:-1].replace('\\"', '"').replace("\t", " "))
    return lines


def scripts(path, kind="cst", folder=None):
    """包里的全部脚本：{场景名（小写）: (场景名, 内容)}。"""
    archive = pfs.open_pack(path, folder)
    found = {}
    for i in range(len(archive.entries)):
        if archive.kind(i) == kind:
            name = archive.name(i)[:-4]
            found[name.lower()] = (name, archive.read(i))
    archive.close()
    return found


def catsystem(game):
    """日文和中文的全部对白：({场景: (场景名, 对白)}, {场景: (场景名, 对白)})。"""
    read = lambda found, encoding: {key: (name, spoken(data, encoding)) for key, (name, data) in found.items()}
    chinese = {}
    for path in sorted(glob.glob(os.path.join(game, "cndate*.int"))):
        try:
            chinese.update(read(scripts(path), "utf-8"))
        except ValueError:
            pass  # 补丁里也有不是 KIF 的包
    return read(scripts(os.path.join(game, "scene.int")), "cp932"), chinese


def artemis(game):
    japanese, chinese = {}, {}
    for path in sorted(glob.glob(os.path.join(game, "*.pfs*"))):
        try:
            found = scripts(path, "ast", "script")
        except ValueError:
            continue  # 空的占位文件
        (chinese if japanese else japanese).update({key: (name, spoken_ast(data)) for key, (name, data) in found.items()})
    return japanese, chinese


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("game", help="游戏的安装目录")
    ap.add_argument("--out", required=True, help="导出到哪个目录")
    args = ap.parse_args()

    japanese, chinese = (catsystem if os.path.isfile(os.path.join(args.game, "scene.int")) else artemis)(args.game)
    if not japanese:
        sys.exit("游戏目录里没有找到脚本（scene.int 或 *.pfs）")

    scene_dir = os.path.join(args.out, "scenes")
    os.makedirs(scene_dir, exist_ok=True)
    total = voiced = scenes = mismatched = 0
    with open(os.path.join(args.out, "lines.tsv"), "w", encoding="utf-8-sig", newline="\n") as table:
        table.write("场景\t语音\t说话人\t日文\t说话人(中)\t中文\n")
        for key in sorted(japanese):
            name, ja = japanese[key]
            if not ja:
                continue
            zh = chinese[key][1] if key in chinese else []
            if len(zh) != len(ja):
                mismatched += bool(zh)
                zh = [(None, None, "")] * len(ja)
            scenes += 1
            with open(os.path.join(scene_dir, name + ".txt"), "w", encoding="utf-8-sig", newline="\n") as f:
                for (voice, who, text), (_, who_zh, text_zh) in zip(ja, zh):
                    total += 1
                    voiced += bool(voice)
                    f.write(f"[{voice or '无语音'}] {who or '旁白'}\n  {text}\n  {text_zh}\n\n")
                    table.write(f"{name}\t{voice or ''}\t{who or ''}\t{text}\t{who_zh or ''}\t{text_zh}\n")
    print(f"{scenes} 个场景，{total} 句对白，其中带语音的 {voiced} 句；有中文的场景 {len(chinese)} 个"
          + (f"，{mismatched} 个场景中日句数对不上，只导出了日文" if mismatched else ""))
    print(f"导出到 {args.out}")


if __name__ == "__main__":
    main()
