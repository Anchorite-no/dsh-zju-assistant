"""读 Artemis 引擎的 .pfs 包（pf8、pf6 格式），用来从本机安装的游戏里取角色语音和剧本。

《甜蜜女友3》用的是这个引擎。包里存的是带目录的真文件名：语音在 Amakano3.pfs.000 的
sound/vo/<角色代号>/ 下，一句台词一个 Ogg；剧本在 Amakano3.pfs 的 script/*.ast。
pf8 的文件内容和索引的 SHA-1 逐字节异或，pf6 不加密。
Archive 的用法和 kif.Archive 一样，所以 pick、unpack、dialogue 两种包都能读。
"""
import hashlib
import os
import struct

import numpy as np

KINDS = ("ogg", "ast")  # 只认语音和剧本，和 kif 一样；别的（口型数据等）name() 返回 None


class Archive:
    """一个 .pfs 包。folder 给了就只看这个目录下的文件，例如 sound/vo/shi。"""

    def __init__(self, path, folder=None):
        self.file = open(path, "rb")
        magic = self.file.read(3)
        if magic not in (b"pf8", b"pf6"):
            raise ValueError(f"不是 pfs 包：{path}")
        size, = struct.unpack("<I", self.file.read(4))
        table = self.file.read(size)
        self.key = np.frombuffer(hashlib.sha1(table).digest(), dtype=np.uint8) if magic == b"pf8" else None
        count, = struct.unpack_from("<I", table, 0)
        prefix = folder.replace("\\", "/").strip("/").lower() + "/" if folder else ""
        self.paths, self.entries, pos = [], [], 4
        for _ in range(count):
            n, = struct.unpack_from("<I", table, pos)
            name = table[pos + 4: pos + 4 + n].decode("utf-8", "replace").replace("\\", "/")
            offset, length = struct.unpack_from("<II", table, pos + 8 + n)  # 文件名后面有 4 个字节的 0
            pos += 16 + n
            if name.lower().startswith(prefix):
                self.paths.append(name)
                self.entries.append((offset, length))

    def read(self, i):
        offset, length = self.entries[i]
        self.file.seek(offset)
        data = np.frombuffer(self.file.read(length), dtype=np.uint8)
        if self.key is None:
            return data.tobytes()
        return (data ^ np.resize(self.key, length)).tobytes()

    def kind(self, i):
        ext = self.paths[i].rsplit(".", 1)[-1].lower()
        return ext if ext in KINDS else None

    def name(self, i):
        return os.path.basename(self.paths[i]) if self.kind(i) else None

    def voices(self):
        """包里（或 folder 下）所有 Ogg 文件的序号。"""
        return [i for i in range(len(self.entries)) if self.kind(i) == "ogg"]

    def close(self):
        self.file.close()


class Folder:
    """把一个文件夹当语音包用：里面一句台词一个音频文件。下载来的分角色语音包解开就是这样。
    只看这一层，不进子文件夹（战斗喊话之类通常另放一个子文件夹，正好不要）。"""

    def __init__(self, path):
        self.path = path
        self.paths = sorted(f for f in os.listdir(path) if f.lower().endswith((".wav", ".ogg", ".flac", ".mp3")))
        self.entries = [(0, os.path.getsize(os.path.join(path, f))) for f in self.paths]

    def read(self, i):
        with open(os.path.join(self.path, self.paths[i]), "rb") as f:
            return f.read()

    def kind(self, i):
        return self.paths[i].rsplit(".", 1)[-1].lower()

    def name(self, i):
        return self.paths[i]

    def voices(self):
        return list(range(len(self.paths)))

    def close(self):
        pass


def open_pack(path, folder=None):
    """按包头认格式：CatSystem2 的 .int、Artemis 的 .pfs，或者一个放着音频的文件夹。"""
    import kif

    if os.path.isdir(path):
        return Folder(path)
    with open(path, "rb") as f:
        magic = f.read(3)
    if magic in (b"pf8", b"pf6"):
        return Archive(path, folder)
    if folder:
        raise ValueError(".int 包本来就是一个角色一个包，不用给 --folder")
    return kif.Archive(path)
