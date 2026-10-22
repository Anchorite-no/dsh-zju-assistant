# 生成整片的配乐谱（ABC），写进 index.html 的 <script type="text/vnd.abc" id="om-score">。
# 120 BPM、4/4、一小节 2 秒；每段的小节数和场景一一对应，段首的 !mark:场景名! 对到时间线标签 scene:场景名。
# 用法：python tools/score.py   然后 om sound .
import io, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(HERE, '..', 'index.html')

PC = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
CH = {
    'D': [2, 6, 9], 'G': [7, 11, 2], 'A': [9, 1, 4], 'Bm': [11, 2, 6], 'Em': [4, 7, 11], 'F#m': [6, 9, 1],
    'E': [4, 8, 11], 'C#m': [1, 4, 8], 'B': [11, 3, 6], 'Asus': [9, 2, 4], 'F#': [6, 10, 1], 'Gmaj7': [7, 11, 2, 6], 'Dadd9': [2, 6, 9, 4],
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
def piz_4(ch):
    t = triad(ch, 60)
    return n(t[0] - 12, 2) + n(t[2], 2) + n(t[1], 2) + n(t[2], 2)

# 鼓：底鼓 C,,  军鼓 D,,  拍手 ^D,,  闭镲 ^F,,  开镲 ^A,,  吊镲 ^C,  沙锤 ^A  通鼓 A,,
K, S, CL, H, O, CR, SH, TM = 'C,,', 'D,,', '^D,,', '^F,,', '^A,,', '^C,', '^A', 'A,,'
def g(*xs): return '[' + ''.join(xs) + ']' if len(xs) > 1 else xs[0]
DR = {
    'kick4': lambda i: (g(K, CR) if i == 0 else K) + '2' + (K + '2') * 3,
    'groove': lambda i: g(K, CR if i == 0 else H) + H + g(K, CL, H) + H + g(K, H) + H + g(K, CL, H) + O,
    'soft': lambda i: g(K, SH) + SH + SH + SH + g(K, SH) + SH + g(S, SH) + SH,
    'shaker': lambda i: (SH + SH) * 4,
    'half': lambda i: g(K, H) + H + H + H + g(S, H) + H + H + H,
    'drive': lambda i: ''.join((g(K, H) if b % 2 == 0 else g(K, CL, H)) + '/' + H + '/' + H + '/' + H + '/' for b in range(4)),
    'fill': lambda i: (S + '/') * 4 + (TM + '/') * 4 + (S + '/') * 4 + g(K, CR) + '2',
}

# 旋律：动机 1-2-3-5，四小节一句
def phrase(key, chords, start=0):
    root = {'D': 74, 'Bm': 71, 'E': 76}[key]
    scale = {'D': [0, 2, 4, 7, 9], 'Bm': [0, 2, 3, 7, 8], 'E': [0, 2, 4, 7, 9]}[key]
    s = [root + x for x in scale]  # 1 2 3 5 6
    bars = []
    bars.append(n(s[0], 2) + n(s[1], 2) + n(s[2], 2) + n(s[3], 2))
    held = min((near(pc, s[3]) for pc in CH[chords[(start + 1) % len(chords)]]), key=lambda m: abs(m - s[3]))
    bars.append(n(held, 6) + 'z2')
    bars.append(n(s[4], 2) + n(s[3], 2) + n(s[2], 2) + n(s[1], 2))
    last = min((near(pc, s[0]) for pc in CH[chords[(start + 3) % len(chords)]]), key=lambda m: abs(m - s[0]))
    bars.append(n(last, 6) + 'z2')
    return bars

# ---------- 段落 ----------
# layers：声部 -> (写法, 力度[, 从第几小节开始, 到第几小节为止])
S_ = []
def sec(id, bars, chords, layers, key='D', melody=None, deco=None, stop=False, end=False):
    S_.append(dict(id=id, bars=bars, chords=chords, layers=layers, key=key, melody=melody, deco=deco or {}, stop=stop, end=end))

sec('hook', 11, ['Bm', 'G', 'D', 'A'], {'PLK': (plk_16, 'mp'), 'SYB': (bass_8, 'mp', 2), 'PAD': (pad_low, 'mp'), 'DR': ('kick4', 'mp', 0, 2), 'DR2': ('groove', 'mf', 2, 10), 'DRF': ('fill', 'mf', 10)},
    key='Bm', melody=('GLK', 'mf', 4, 8), deco={'DR': {10: ('!rise(!', '!rise)!')}})
sec('why', 11, ['Bm', 'Bm', 'G', 'G', 'Em', 'Em', 'G', 'A', 'Bm', 'Em', 'A'], {'PNO': (pno_arp_soft, 'mp'), 'STR': (pad_low, 'p', 4), 'BAS': (bass_whole, 'mp', 4), 'DR': ('shaker', 'p', 6)},
    key='Bm', deco={'DR': {9: ('!rise(!', None), 10: (None, '!rise)!')}})
sec('reveal', 5, ['D', 'Bm', 'G', 'A', 'D'], {'PNO': (pno_push, 'ff'), 'BAS': (bass_push, 'ff'), 'HRN': (pad_whole, 'f'), 'PLK': (plk_16, 'f'), 'DR': ('groove', 'ff'), 'PAD': (pad_whole, 'f')},
    melody=('STR', 'ff', 0, 4), deco={'DR': {0: ('!hit!', None)}})
sec('layers', 17, ['D', 'A', 'Bm', 'G'], {'PLK': (plk_8, 'mp'), 'SYB': (bass_8, 'mp'), 'DR': ('half', 'mp', 0, 6), 'DR2': ('groove', 'mp', 6, 17), 'PAD': (pad_whole, 'mp', 6)},
    melody=('GLK', 'mf', 10, 14), deco={'DR2': {15: ('!rise(!', None), 16: (None, '!rise)!')}})
sec('profile', 15, ['D', 'G', 'Bm', 'A'], {'PNO': (pno_arp, 'mf'), 'BAS': (bass_half, 'mf', 2), 'DR': ('soft', 'mp', 2), 'PAD': (pad_whole, 'mp')},
    melody=('GLK', 'mp', 0, 4))
sec('affairs', 25, ['D', 'A', 'Bm', 'G'], {'PNO': (pno_pulse, 'mp'), 'PLK': (plk_8, 'p'), 'BAS': (bass_half, 'mp'), 'DR': ('soft', 'mp')},
    melody=('FLT', 'mp', 20, 24))
sec('memo', 20, ['G', 'D', 'A', 'Bm'], {'MAR': (mar_8, 'mf'), 'PNO': (pno_block, 'mp'), 'BAS': (bass_half, 'mf'), 'DR': ('soft', 'mf'), 'PAD': (pad_whole, 'mp')})
sec('schedule', 16, ['D', 'Bm', 'G', 'A'], {'PIZ': (piz_4, 'f'), 'STR': (pad_low, 'mf'), 'BAS': (bass_half, 'mf'), 'DR': ('soft', 'mf'), 'PNO': (pno_pulse, 'mp')},
    melody=('GLK', 'mp', 8, 12))
sec('ask', 25, ['Bm', 'G', 'D', 'A'], {'PLK': (plk_16, 'p'), 'SYB': (bass_drive, 'mp'), 'PAD': (pad_whole, 'mp'), 'DR': ('drive', 'mp', 2, 20), 'DR2': ('soft', 'mp', 20)},
    key='Bm')
sec('confirm', 15, ['G', 'D', 'Em', 'A'], {'PNO': (pno_arp_soft, 'mf'), 'PAD': (pad_whole, 'mp'), 'BAS': (bass_whole, 'mp', 8)},
    melody=('FLT', 'mp', 8, 12))
sec('learning', 27, ['D', 'F#m', 'G', 'A'], {'PNO': (pno_arp, 'mf'), 'STR': (pad_low, 'mp'), 'BAS': (bass_half, 'mf'), 'DR': ('soft', 'mp', 4)},
    melody=('GLK', 'mp', 14, 22))
sec('plugins', 8, ['G', 'A', 'Bm', 'A'], {'PLK': (plk_16, 'mf'), 'SYB': (bass_8, 'mf'), 'PAD': (pad_whole, 'mf'), 'DR': ('groove', 'mf', 0, 7)},
    deco={'DR': {0: ('!filter(!', None), 4: ('!rise(!', None), 6: (None, '!filter)!'), 7: (None, '!rise)!')}}, stop=True)
sec('numbers', 20, ['E', 'C#m', 'A', 'B'], {'PNO': (pno_push, 'ff'), 'BAS': (bass_push, 'ff'), 'HRN': (pad_whole, 'f'), 'PLK': (plk_16, 'f'), 'DR': ('groove', 'ff'), 'PAD': (pad_whole, 'f')},
    key='E', melody=('STR', 'ff', 0, 8), deco={'DR': {0: ('!hit!', None)}})
sec('reflect', 11, ['D', 'Bm', 'G', 'A'], {'PNO': (pno_arp_soft, 'mf'), 'STR': (pad_low, 'mf'), 'BAS': (bass_whole, 'mp')},
    melody=('FLT', 'mp', 3, 11))
sec('end', 6, ['G', 'A', 'D', 'D'], {'PNO': (pno_block, 'mf'), 'STR': (pad_low, 'mf'), 'BAS': (bass_whole, 'mf'), 'HRN': (pad_whole, 'mp')},
    melody=('GLK', 'mf', 0, 4), end=True)

VOICES = [('PNO', 'piano', ''), ('PLK', 'synpluck', ' gain=0.55'), ('MAR', 'marimba', ' gain=0.6'), ('PIZ', 'pizz', ' gain=0.7'),
          ('PAD', 'warmpad', ' gain=0.25'), ('STR', 'strings', ' gain=0.75'), ('GLK', 'glock', ' gain=0.65 role=melody'), ('HRN', 'horn', ' gain=0.55'),
          ('FLT', 'flute', ' gain=0.6 role=melody'), ('BAS', 'bass', ' gain=0.5'), ('SYB', 'synbass', ' gain=0.38'),
          ('DR', 'drums kit=pop', ' gain=0.78'), ('DR2', 'drums kit=pop', ' gain=0.78'), ('DRF', 'drums kit=pop', ' gain=0.78')]
DRUMV = {'DR', 'DR2', 'DRF'}

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
