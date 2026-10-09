"""读 CatSystem2 引擎的 .int 包（KIF 格式），用来从本机安装的游戏里取角色语音。

这个引擎的语音按角色分包（pcm_XX.int），一句台词一个 Ogg 文件，没有背景音乐。
包是加密的：索引里的偏移和长度、文件内容都用 Blowfish 加密，密钥由包头里的一个数
经梅森旋转算出来，不需要游戏的口令。文件名另外做了字母替换，每个文件的起始偏移量
由游戏口令决定；这里不用口令，而是按文件内容认出扩展名，再试出让扩展名对得上的偏移量。
"""
import os
import struct

import numpy as np

ENTRY = 0x48  # 索引里每一项：64 字节文件名，4 字节偏移，4 字节长度
LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
KINDS = {b"OggS": "ogg", b"CatS": "cst"}  # 内容开头的标记 → 扩展名


def _pi_words(n):
    """Blowfish 的初始常数是圆周率小数部分的十六进制展开，现算，省得抄一千个数。"""
    from mpmath import mp

    mp.prec = 32 * n + 64
    frac = int(mp.floor((mp.pi - 3) * mp.mpf(2) ** (32 * n)))
    return [(frac >> (32 * (n - 1 - i))) & 0xFFFFFFFF for i in range(n)]


class Blowfish:
    def __init__(self, key):
        words = _pi_words(18 + 4 * 256)
        P = [p ^ int.from_bytes(bytes(key[(4 * i + j) % len(key)] for j in range(4)), "big") for i, p in enumerate(words[:18])]
        S = [words[18 + 256 * i: 18 + 256 * (i + 1)] for i in range(4)]

        def encrypt(l, r):
            for i in range(16):
                l ^= P[i]
                r ^= ((((S[0][l >> 24] + S[1][(l >> 16) & 255]) & 0xFFFFFFFF) ^ S[2][(l >> 8) & 255]) + S[3][l & 255]) & 0xFFFFFFFF
                l, r = r, l
            return r ^ P[17], l ^ P[16]

        l = r = 0
        for box in [P] + S:
            for i in range(0, len(box), 2):
                box[i], box[i + 1] = l, r = encrypt(l, r)
        self.P = np.array(P, dtype=np.uint32)
        self.S = [np.array(s, dtype=np.uint32) for s in S]

    def decrypt(self, data):
        """解密整 8 字节的块，尾巴上不足 8 字节的部分本来就没有加密。"""
        n = len(data) // 8
        if not n:
            return data
        words = np.frombuffer(data, dtype="<u4", count=n * 2).reshape(n, 2)
        l, r = words[:, 0], words[:, 1]
        P, S = self.P, self.S
        for i in range(17, 1, -1):
            l = l ^ P[i]
            r = r ^ (((S[0][l >> 24] + S[1][(l >> 16) & 255]) ^ S[2][(l >> 8) & 255]) + S[3][l & 255])
            l, r = r, l
        out = np.stack([r ^ P[0], l ^ P[1]], axis=1).astype("<u4").tobytes()
        return out + data[n * 8:]


def _twist(seed):
    """梅森旋转（1998 年版的播种方式）播种后的第一个输出。"""
    mt = []
    for _ in range(624):
        high = seed & 0xFFFF0000
        seed = (69069 * seed + 1) & 0xFFFFFFFF
        mt.append(high | (seed & 0xFFFF0000) >> 16)
        seed = (69069 * seed + 1) & 0xFFFFFFFF
    y = (mt[0] & 0x80000000) | (mt[1] & 0x7FFFFFFF)
    y = mt[397] ^ (y >> 1) ^ (0x9908B0DF if y & 1 else 0)
    y ^= y >> 11
    y ^= (y << 7) & 0x9D2C5680
    y ^= (y << 15) & 0xEFC60000
    return y ^ (y >> 18)


class Archive:
    """一个 .int 包。entries 是 [(偏移, 长度)]，read(i) 返回第 i 个文件解密后的内容。"""

    def __init__(self, path):
        self.file = open(path, "rb")
        magic, count = struct.unpack("<4sI", self.file.read(8))
        if magic != b"KIF\0":
            raise ValueError(f"不是 KIF 包：{path}")
        table = self.file.read(ENTRY * count)
        size = os.path.getsize(path)
        first = 0 if table[:11].lower() != b"__key__.dat" else 1
        self.raw_names = [table[ENTRY * i: ENTRY * i + 0x40].split(b"\0")[0].decode("cp932", "replace") for i in range(first, count)]
        if not first:
            self.cipher = None
            self.entries = [struct.unpack_from("<II", table, ENTRY * i + 0x40) for i in range(count)]
        else:
            self.cipher = Blowfish(struct.pack("<I", _twist(struct.unpack_from("<I", table, 0x44)[0])))
            self.entries = []
            for i in range(1, count):
                offset, length = struct.unpack_from("<II", table, ENTRY * i + 0x40)
                block = self.cipher.decrypt(struct.pack("<II", (offset + i) & 0xFFFFFFFF, length))
                self.entries.append(struct.unpack("<II", block))
        if any(o + n > size for o, n in self.entries):
            raise ValueError(f"索引解不开，可能是这个引擎的别的版本：{path}")

    def read(self, i):
        offset, length = self.entries[i]
        self.file.seek(offset)
        data = self.file.read(length)
        return self.cipher.decrypt(data) if self.cipher else data

    def kind(self, i):
        """第 i 个文件的类型（ogg、cst），认不出返回 None。只读文件的头 8 个字节。"""
        offset, length = self.entries[i]
        if length < 8:
            return None
        self.file.seek(offset)
        head = self.file.read(8)
        return KINDS.get((self.cipher.decrypt(head) if self.cipher else head)[:4])

    def name(self, i):
        """第 i 个文件的真名。类型认不出的文件解不了，返回 None。"""
        raw = self.raw_names[i]
        if not self.cipher:
            return raw
        ext = self.kind(i)
        for shift in range(52) if ext else ():
            plain = "".join(LETTERS[51 - (LETTERS.find(c) + shift + k) % 52] if c in LETTERS else c for k, c in enumerate(raw))
            if plain.lower().endswith("." + ext):
                return plain
        return None

    def voices(self):
        """包里所有 Ogg 文件的序号。"""
        return [i for i in range(len(self.entries)) if self.kind(i) == "ogg"]

    def close(self):
        self.file.close()
