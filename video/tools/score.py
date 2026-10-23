# 生成整片的配乐谱（ABC），写进 index.html 的 <script type="text/vnd.abc" id="om-score">。
# 120 BPM、4/4、一小节 2 秒；每段的小节数和场景一一对应，段首的 !mark:场景名! 对到时间线标签 scene:场景名。
# 用法：python tools/score.py   然后 om sound .
#
# 写法（照 huashu-motion 的 sound.md）：
# - 一个属于产品的动机：5-1-2-3-5（「校 园 智 能 体」五个字），开头钢琴轻轻起，中间换乐器、换和声，片尾回到钢琴加钟当声音落款。
# - 每段换一种主配器，不让同一套音色从头响到尾：钢琴、电钢琴、拇指琴、颤音琴、拨弦、断奏弦乐、圆号。
# - 能量：开场比产品登场低一档；「为什么帮不上」几乎只剩电钢琴，最后一小节留白；产品登场、讲解放出来、实测数字是三个高点。
import io, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(HERE, '..', 'index.html')

CH = {
    'D': [2, 6, 9], 'G': [7, 11, 2], 'A': [9, 1, 4], 'Bm': [11, 2, 6], 'Em': [4, 7, 11], 'F#m': [6, 9, 1],
    'E': [4, 8, 11], 'C#m': [1, 4, 8], 'B': [11, 3, 6],
    'Gadd9': [7, 11, 2, 9], 'Bm7': [11, 2, 6, 9], 'Em7': [4, 7, 11, 2], 'Aadd9': [9, 1, 4, 11],
}
NAMES = ['=C', '^C', '=D', '^D', '=E', '=F', '^F', '=G', '^G', '=A', '^A', '=B']

def note(m):
    n = NAMES[m % 12]
    acc, letter = n[0], n[1]
    o = m // 12 - 1
    if o >= 5:
        return acc + letter.lower() + "'" * (o - 5)
    return acc + letter + ',' * (4 - o)

def dur(d):
    if d == 1: return ''
    if d == 0.5: return '/'
    if d == int(d): return str(int(d))
    return {1.5: '3/2', 0.25: '//'}[d]

def n(m, d=1): return note(m) + dur(d)
def chord(ms, d): return '[' + ''.join(note(m) for m in ms) + ']' + dur(d)
def near(pc, center):
    best = None
    for m in range(center - 12, center + 13):
        if m % 12 == pc and (best is None or abs(m - center) < abs(best - center)): best = m
    return best
def triad(ch, center):
    pcs = CH[ch]
    root = near(pcs[0], center - 2)
    out = [root]
    for pc in pcs[1:]:
        m = near(pc, out[-1] + 4)
        while m <= out[-1]: m += 12
        out.append(m)
    return out

# ---------- 每个声部一小节的写法（8 个八分音符）----------
def bass_whole(ch): return n(near(CH[ch][0], 40), 8)
def bass_half(ch): r = near(CH[ch][0], 40); return n(r, 4) + n(r, 4)
def bass_8(ch):
    r = near(CH[ch][0], 40); f = r + 7
    return ''.join(n(x) for x in [r, r, r, r, r, r, f, r])
def bass_drive(ch):
    r = near(CH[ch][0], 40)
    return ''.join(n(x) for x in [r, r, r + 12, r, r, r, r + 12, r])
def bass_push(ch):  # 3+3+2
    r = near(CH[ch][0], 40)
    return n(r, 3) + n(r, 3) + n(r, 2)
def bass_walk(ch):  # 根音、五音来回
    r = near(CH[ch][0], 40)
    return n(r, 3) + n(r + 7, 1) + n(r, 2) + n(r + 7, 2)

def pad_whole(ch): return chord(triad(ch, 62), 8)
def pad_low(ch): return chord(triad(ch, 55), 8)
def pno_block(ch): t = triad(ch, 64); return chord([t[0] - 12] + t, 8)
def pno_pulse(ch): t = triad(ch, 70); return chord(t, 2) * 4
def pno_push(ch): t = triad(ch, 66); return chord(t, 3) + chord(t, 3) + chord(t, 2)
def pno_arp(ch):
    t = triad(ch, 67); r = t[0] - 12
    seq = [r, r + 7, t[1] + 12, t[0] + 12, t[2] + 12, t[0] + 12, t[1] + 12, r + 7]
    return ''.join(n(x) for x in seq)
def pno_arp_soft(ch):
    t = triad(ch, 67); r = t[0] - 12
    return n(r, 2) + n(t[2], 2) + n(t[1] + 12, 2) + n(t[2], 2)
def pno_wide(ch):  # 低音一个、右手一个和弦，留很多空
    t = triad(ch, 67); r = t[0] - 12
    return n(r, 4) + chord(t, 4)
def rhd_comp(ch):  # 电钢琴：二、四拍上的和弦
    t = triad(ch, 64)
    return 'z2' + chord(t, 2) + 'z2' + chord(t, 2)
def plk_16(ch):
    t = triad(ch, 79)
    seq = [t[0], t[1], t[2], t[1]] * 4
    return ''.join(n(x, 0.5) for x in seq)
def plk_8(ch):
    t = triad(ch, 79)
    return ''.join(n(x) for x in [t[0], t[2], t[1], t[2], t[0] + 12, t[2], t[1], t[2]])
def mar_8(ch):
    t = triad(ch, 76)
    return ''.join(n(x) for x in [t[0], t[1], t[2], t[1] + 12, t[2], t[1], t[0] + 12, t[2]])
def kal_8(ch):  # 拇指琴：高音区的分解和弦
    t = triad(ch, 79)
    return ''.join(n(x) for x in [t[0], t[2], t[1] + 12, t[2], t[0] + 12, t[2], t[1] + 12, t[1]])
def vib_half(ch):  # 颤音琴：两拍一个分解
    t = triad(ch, 74)
    return n(t[0]) + n(t[1]) + n(t[2], 2) + n(t[1]) + n(t[2]) + n(t[0] + 12, 2)
def piz_4(ch):
    t = triad(ch, 60)
    return n(t[0] - 12, 2) + n(t[2], 2) + n(t[1], 2) + n(t[2], 2)
def piz_8(ch):
    t = triad(ch, 60)
    return ''.join(n(x) for x in [t[0] - 12, t[2], t[1], t[2], t[0], t[2], t[1], t[2]])
def stc_8(ch):  # 断奏弦乐的八分音符固定音型：根、五、八、五
    r = near(CH[ch][0], 55)
    return ''.join(n(x) for x in [r, r + 7, r + 12, r + 7] * 2)
def cel_8(ch):  # 大提琴低音区的八分音符，紧一点
    r = near(CH[ch][0], 47)
    return ''.join(n(x) for x in [r, r, r + 12, r, r, r + 7, r + 12, r + 7])
def hrn_long(ch): t = triad(ch, 60); return chord(t[:2], 8)
def harp_up(ch):  # 竖琴往上刮一把，后半小节停住
    t = triad(ch, 62)
    seq = [t[0], t[1], t[2], t[0] + 12, t[1] + 12, t[2] + 12, t[0] + 24, t[1] + 24]
    return ''.join(n(x, 0.5) for x in seq) + n(t[2] + 24, 4)
def bell_hit(ch): t = triad(ch, 86); return chord(t[:2], 8)

# 鼓：底鼓 C,,  军鼓 D,,  拍手 ^D,,  闭镲 ^F,,  开镲 ^A,,  吊镲 ^C,  沙锤 ^A  通鼓 A,,  铃鼓 ^F,
K, S, CL, H, O, CR, SH, TM, TB = 'C,,', 'D,,', '^D,,', '^F,,', '^A,,', '^C,', '^A', 'A,,', '^F,'
def g(*xs): return '[' + ''.join(xs) + ']' if len(xs) > 1 else xs[0]
DR = {
    'kick4': lambda i: (g(K, CR) if i == 0 else K) + '2' + (K + '2') * 3,
    'groove': lambda i: g(K, CR if i == 0 else H) + H + g(K, CL, H) + H + g(K, H) + H + g(K, CL, H) + O,
    'soft': lambda i: g(K, SH) + SH + SH + SH + g(K, SH) + SH + g(S, SH) + SH,
    'shaker': lambda i: (SH + SH) * 4,
    'half': lambda i: g(K, H) + H + H + H + g(S, H) + H + H + H,
    'drive': lambda i: ''.join((g(K, H) if b % 2 == 0 else g(K, CL, H)) + '/' + H + '/' + H + '/' + H + '/' for b in range(4)),
    'fill': lambda i: (S + '/') * 4 + (TM + '/') * 4 + (S + '/') * 4 + g(K, CR) + '2',
    'tamb': lambda i: g(K, TB) + TB + TB + TB + g(CL, TB) + TB + TB + TB,
    'pulse': lambda i: g(K, H) + H + H + H + g(K, H) + H + H + H,
    'taiko': lambda i: K + '2' + 'z2' + g(K, TM) + '2' + 'z2',
}

# 动机 5-1-2-3-5（大调）/ 5-1-2-♭3-5（小调），四小节一句：动机、长音、回应、落下
def phrase(key, chords, start=0):
    T = {'D': 74, 'Bm': 71, 'E': 76}[key]
    third = 3 if key.endswith('m') else 4
    mot = [T - 5, T, T + 2, T + third, T + 7]
    ans = [T + (8 if third == 3 else 9), T + 7, T + third, T + 2]
    bars = [n(mot[0]) + n(mot[1]) + n(mot[2], 2) + n(mot[3], 2) + n(mot[4], 2)]
    held = min((near(pc, T + 7) for pc in CH[chords[(start + 1) % len(chords)]]), key=lambda m: abs(m - (T + 7)))
    bars.append(n(held, 6) + 'z2')
    bars.append(''.join(n(x, 2) for x in ans))
    last = min((near(pc, T) for pc in CH[chords[(start + 3) % len(chords)]]), key=lambda m: abs(m - T))
    bars.append(n(last, 6) + 'z2')
    return bars

# ---------- 段落 ----------
# layers：声部 -> (写法, 力度[, 从第几小节开始, 到第几小节为止])
S_ = []
def sec(id, bars, chords, layers, key='D', melody=None, deco=None, stop=False, end=False):
    S_.append(dict(id=id, bars=bars, chords=chords, layers=layers, key=key, melody=melody, deco=deco or {}, stop=stop, end=end))

# 开场：钢琴轻轻说出动机 → 四个亮点上拇指琴和轻的鼓 → 收在产品名上，钟响；比产品登场低一档
sec('open', 16, ['D', 'Gadd9', 'Bm7', 'Aadd9'], {
    'PNO': (pno_wide, 'mp', 0, 2), 'PAD': (pad_whole, 'p'), 'HRP': (harp_up, 'mp', 0, 1),
    'KAL': (kal_8, 'p', 2, 15), 'SYB': (bass_walk, 'p', 2, 15), 'DR': ('half', 'pp', 2, 8), 'DR2': ('pulse', 'p', 8, 14), 'DRF': ('fill', 'p', 14, 15),
    'VIB': (vib_half, 'pp', 8, 15), 'BEL': (bell_hit, 'mp', 15, 16)},
    melody=('PNO2', 'mp', 0, 4), stop=True)
# 问题：低音弦乐的固定音型，压着
sec('hook', 9, ['Bm', 'G', 'D', 'A'], {'CEL': (cel_8, 'mp'), 'PLK': (plk_8, 'p', 2), 'PAD': (pad_low, 'mp'), 'DR': ('kick4', 'mp', 0, 2), 'DR2': ('groove', 'mp', 2, 8), 'DRF': ('fill', 'mf', 8)},
    key='Bm', melody=('GLK', 'mp', 4, 8), deco={'DR': {8: ('!rise(!', '!rise)!')}})
# 为什么帮不上：只剩电钢琴和一点沙锤，最后一小节留白
sec('why', 9, ['Bm7', 'Bm7', 'Gadd9', 'Em7', 'Em7', 'Gadd9', 'Aadd9', 'Em7', 'A'], {'RHD': (rhd_comp, 'p', 0, 8), 'PAD': (pad_low, 'pp', 3, 8), 'BAS': (bass_whole, 'pp', 3, 8), 'DR': ('shaker', 'pp', 5, 8)},
    key='Bm', deco={'DR': {8: ('!rise(!', '!rise)!')}})
# 产品登场：第一个高点，全奏，动机在弦乐上
sec('reveal', 5, ['D', 'Bm', 'G', 'A', 'D'], {'PNO': (pno_push, 'f'), 'BAS': (bass_push, 'f'), 'HRN': (hrn_long, 'mf'), 'PLK': (plk_16, 'mf'), 'DR': ('groove', 'f'), 'PAD': (pad_whole, 'mf')},
    melody=('STR', 'f', 0, 4), deco={'DR': {0: ('!hit!', None)}})
# 两层结构：马林巴的八分音符，后半段鼓进来，钟琴再说一次动机
sec('layers', 17, ['D', 'Aadd9', 'Bm', 'Gadd9'], {'MAR': (mar_8, 'mp'), 'SYB': (bass_8, 'mp'), 'DR': ('half', 'mp', 0, 6), 'DR2': ('groove', 'mp', 6, 16), 'PAD': (pad_whole, 'mp', 6)},
    melody=('GLK', 'mf', 10, 14), deco={'DR2': {14: ('!rise(!', None), 15: (None, '!rise)!')}})
# 初始化：钢琴开门（章节牌），拨弦和拇指琴一条条接上，长笛说动机
sec('init', 16, ['G', 'D', 'Em7', 'Aadd9'], {'PNO': (pno_arp_soft, 'mp', 0, 3), 'PIZ': (piz_8, 'mp', 2, 15), 'KAL': (kal_8, 'p', 4, 15), 'BAS': (bass_half, 'mp', 2, 15), 'DR': ('tamb', 'p', 4, 12),
    'DR2': ('pulse', 'mp', 12, 15), 'HRN': (hrn_long, 'mp', 12, 15), 'PAD': (pad_whole, 'p')},
    melody=('FLT', 'mp', 6, 10), deco={'DR2': {14: ('!rise(!', None), 15: (None, '!rise)!')}})
# 校园事务：电钢琴打拍子，拨弦，长笛在后面
sec('affairs', 26, ['D', 'Aadd9', 'Bm7', 'Gadd9'], {'RHD': (rhd_comp, 'mp'), 'PLK': (plk_8, 'p', 4), 'BAS': (bass_walk, 'mp', 2), 'DR': ('soft', 'mp', 2), 'PAD': (pad_whole, 'p')},
    melody=('FLT', 'mp', 18, 22))
# 问助手：偏电子，十六分音符的拨弦和推进的鼓
sec('ask', 25, ['Bm', 'G', 'D', 'A'], {'PLK': (plk_16, 'p'), 'SYB': (bass_drive, 'mp'), 'PAD': (pad_whole, 'mp'), 'DR': ('drive', 'mp', 2, 20), 'DR2': ('soft', 'mp', 20), 'VIB': (vib_half, 'p', 12, 20)},
    key='Bm')
# 学习：钢琴分解和弦，开讲解窗口时钟琴说动机
sec('learning', 17, ['D', 'F#m', 'Gadd9', 'A'], {'PNO': (pno_arp, 'mf'), 'STR': (pad_low, 'mp'), 'BAS': (bass_half, 'mf', 2), 'DR': ('soft', 'mp', 4)},
    melody=('GLK', 'mf', 11, 15), deco={'DR': {16: ('!rise(!', '!rise)!')}})
# 这一讲怎么做出来的：断奏弦乐和拨弦压着往前推，后段闷着打开（filter），第 24 小节全奏，弦乐说动机
sec('lessonmake', 36, ['D', 'Aadd9', 'Bm', 'Gadd9'], {'PNO': (pno_wide, 'mp', 0, 2), 'STC': (stc_8, 'mp', 2, 24), 'PIZ': (piz_8, 'p', 6, 24), 'MAR': (mar_8, 'p', 12, 24), 'SYB': (bass_drive, 'mp', 2, 24),
    'DR': ('drive', 'mp', 4, 23), 'DRF': ('fill', 'mf', 23, 24), 'PAD': (pad_whole, 'mp'),
    'PNO2': (pno_push, 'f', 24, 34), 'BAS': (bass_push, 'f', 24, 34), 'HRN': (hrn_long, 'mf', 24, 34), 'DR2': ('groove', 'f', 24, 34), 'KAL': (kal_8, 'mp', 24, 34)},
    melody=('STR', 'f', 25, 33), deco={'DR': {16: ('!filter(!', None), 22: (None, '!filter)!')}, 'DR2': {24: ('!hit!', None)}})
# 技能和定时任务：颤音琴和拨弦，时间轴走过一天的时候鼓推起来
sec('skills', 20, ['D', 'Bm7', 'Gadd9', 'Aadd9'], {'VIB': (vib_half, 'mf'), 'PIZ': (piz_8, 'mp', 2), 'BAS': (bass_walk, 'mf', 1), 'DR': ('soft', 'mf', 1, 9), 'DR2': ('drive', 'mf', 9, 14), 'KAL': (kal_8, 'mp', 9, 14), 'PAD': (pad_whole, 'mp')},
    melody=('GLK', 'mp', 4, 8), deco={'DR2': {13: ('!rise(!', None), 14: (None, '!rise)!')}})
# 日程表：拨弦加拇指琴，钟琴收
sec('schedule', 8, ['D', 'Bm', 'G', 'A'], {'PIZ': (piz_8, 'mf'), 'KAL': (kal_8, 'p'), 'STR': (pad_low, 'mp'), 'BAS': (bass_half, 'mp'), 'DR': ('soft', 'mp')},
    melody=('GLK', 'mp', 4, 8))
# 备忘录：马林巴和拨弦，第二段最后一场；最后闷着往上推，磁带停转，留给实测数字
sec('memo', 11, ['G', 'D', 'A', 'Bm'], {'MAR': (mar_8, 'mf'), 'PIZ': (piz_4, 'mp'), 'BAS': (bass_half, 'mf'), 'DR': ('tamb', 'mp', 1, 8), 'DR2': ('groove', 'mf', 8, 10), 'PAD': (pad_whole, 'mp')},
    deco={'DR2': {8: ('!filter(!', None), 9: ('!rise(!', '!filter)!'), 10: (None, '!rise)!')}}, stop=True)
# 实测数字：升到 E 大调的高点
sec('numbers', 20, ['E', 'C#m', 'A', 'B'], {'PNO': (pno_push, 'f'), 'BAS': (bass_push, 'f'), 'HRN': (hrn_long, 'mf'), 'PLK': (plk_16, 'mf'), 'DR': ('groove', 'f'), 'PAD': (pad_whole, 'mf'), 'DRC': ('taiko', 'mf', 0, 4)},
    key='E', melody=('STR', 'f', 0, 8), deco={'DR': {0: ('!hit!', None)}})
# 反思：钢琴和弦乐，安静
sec('reflect', 11, ['D', 'Bm7', 'Gadd9', 'A'], {'PNO': (pno_arp_soft, 'mf'), 'STR': (pad_low, 'mp'), 'BAS': (bass_whole, 'mp')},
    melody=('FLT', 'mp', 3, 11))
# 落版：钢琴说动机，竖琴一刮，钟响，停在主和弦上
sec('end', 6, ['G', 'A', 'D', 'D'], {'PNO': (pno_block, 'mf'), 'STR': (pad_low, 'mf'), 'BAS': (bass_whole, 'mf'), 'HRP': (harp_up, 'mp', 2, 3), 'BEL': (bell_hit, 'mp', 4, 6)},
    melody=('PNO2', 'mf', 0, 4), end=True)

VOICES = [('PNO', 'piano', ''), ('PNO2', 'piano', ' role=melody'), ('RHD', 'rhodes', ' gain=0.5'), ('PLK', 'synpluck', ' gain=0.5'), ('MAR', 'marimba', ' gain=0.6'),
          ('KAL', 'kalimba', ' gain=0.6'), ('VIB', 'vibes', ' gain=0.55'), ('PIZ', 'pizz', ' gain=0.7'), ('STC', 'stacc', ' gain=0.6'), ('CEL', 'celli', ' gain=0.7'),
          ('HRP', 'harp', ' gain=0.6'), ('PAD', 'warmpad', ' gain=0.25'), ('STR', 'strings', ' gain=0.75'), ('GLK', 'glock', ' gain=0.6 role=melody'), ('HRN', 'horn', ' gain=0.55'),
          ('FLT', 'flute', ' gain=0.6 role=melody'), ('BEL', 'bell', ' gain=0.45'), ('BAS', 'bass', ' gain=0.5'), ('SYB', 'synbass', ' gain=0.36'),
          ('DR', 'drums kit=pop', ' gain=0.72'), ('DR2', 'drums kit=pop', ' gain=0.72'), ('DRF', 'drums kit=pop', ' gain=0.72'), ('DRC', 'drums kit=cinematic', ' gain=0.5')]
DRUMV = {'DR', 'DR2', 'DRF', 'DRC'}

def voice_line(v):
    out = []
    for s in S_:
        bars = s['bars']
        cells = ['z8'] * bars
        dyn_at = {}
        lay = s['layers'].get(v)
        if lay:
            pat, dyn = lay[0], lay[1]
            a = lay[2] if len(lay) > 2 else 0
            b = lay[3] if len(lay) > 3 else bars
            for i in range(a, b):
                ch = s['chords'][i % len(s['chords'])]
                cells[i] = DR[pat](i - a) if v in DRUMV else pat(ch)
            dyn_at[a] = dyn
        mel = s['melody']
        if mel and mel[0] == v:
            _, dyn, a, b = mel
            i = a
            while i < b:
                ph = phrase(s['key'], s['chords'], i)
                for j, cell in enumerate(ph):
                    if i + j < b: cells[i + j] = cell
                i += 4
            dyn_at[a] = dyn
        if s['stop'] and cells[-1] != 'z8':
            cells[-1] = cell_first_half(cells[-1])
        if s['end'] and cells[-1] != 'z8':
            cells[-1] = '!fermata!' + cells[-1]
        deco = s['deco'].get(v, {})
        for i in range(bars):
            pre, post = deco.get(i, (None, None))
            if pre: cells[i] = pre + ' ' + cells[i]
            if post: cells[i] = cells[i] + ' ' + post
            if i in dyn_at: cells[i] = f'!{dyn_at[i]}! ' + cells[i]
        if v == 'DR':
            cells[0] = f'!mark:{s["id"]}! ' + cells[0]
        out.append(' | '.join(cells))
    return ' |\n'.join(out) + ' |]'

def cell_first_half(cell):
    # 粗略：把这一小节换成「第一拍长音 + 休止」
    toks = re.findall(r'(\[[^\]]+\]|[\^=_][A-Ga-g][,\']*)(\d+/?\d*|/)?', cell)
    if not toks: return 'z8'
    head = toks[0][0]
    return head + '4z4'

def build():
    head = ['X:1', 'T:校园智能体 · 演示片配乐', 'M:4/4', 'L:1/8', 'Q:1/4=120', 'K:C']
    body = []
    for v, inst, extra in VOICES:
        body.append(f'V:{v} inst={inst}{extra}')
        body.append(voice_line(v))
    return '\n'.join(head + body) + '\n'

abc = build()
s = io.open(INDEX, encoding='utf8').read()
block = '<script type="text/vnd.abc" id="om-score">\n' + abc + '</script>\n'
if 'id="om-score"' in s:
    s = re.sub(r'<script type="text/vnd.abc" id="om-score">.*?</script>\n', lambda m: block, s, flags=re.S)
else:
    s = s.replace('<script src="main.js"></script>', block + '<script src="main.js"></script>')
io.open(INDEX, 'w', encoding='utf8').write(s)
total = sum(x['bars'] for x in S_)
print('bars', total, 'seconds', total * 2, 'voices', len(VOICES), 'chars', len(abc))
