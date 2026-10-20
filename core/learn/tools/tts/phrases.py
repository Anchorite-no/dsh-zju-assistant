"""Short speech groups and pause-based caption positions; the audio itself stays intact."""
import hashlib
import json
import re


def settings(info):
    raw = info.get('speech') or {}
    return {'sentences': max(1, min(2, int(raw.get('sentences', 2)))),
            'max_chars': max(40, min(240, int(raw.get('max_chars', 120)))),
            'gap': max(0, min(1, float(raw.get('gap', .30))))}


def groups(lines, config):
    result = []
    for line in lines:
        prev = result[-1][-1] if result else None
        block = result[-1] if result else []
        same = prev and not prev.get('para') and not prev.get('break_after')
        same = same and prev.get('lang') == line.get('lang') and prev.get('scene') == line.get('scene')
        same = same and (prev.get('mood') or None) == (line.get('mood') or None)
        # Tiny interjections and deliberately long lines keep their own timing.
        same = same and min(len(re.sub(r'\W', '', prev['text'])), len(re.sub(r'\W', '', line['text']))) >= 6
        if (same and len(block) < config['sentences']
                and sum(len(x['text']) for x in block) + len(line['text']) <= config['max_chars']):
            block.append(line)
        else:
            result.append([line])
    return result


def fingerprint(lang, texts, voice, speed, emotion):
    data = ['continuous-v1', lang, texts, voice, speed, emotion]
    return hashlib.sha256(json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()[:16]


def positions(pcm, rate, texts):
    """Locate the sentence pause near a text-length estimate. Never cut or stretch PCM.

    This is approximate caption alignment, not ASR/word-level forced alignment.
    Keep a conservative estimate if the speaker makes no detectable pause.
    """
    import numpy as np

    seconds = len(pcm) / rate
    if len(texts) == 1:
        return [0., seconds], 'single'
    weights = [max(1, len(re.sub(r'[^\w]', '', t))) for t in texts]
    expected = seconds * weights[0] / sum(weights)
    hop = max(1, round(rate * .01))
    x = pcm.astype(np.float32) / 32768
    frames = len(x) // hop
    power = (x[:frames*hop].reshape(frames, hop)**2).mean(1)
    quiet = power < max(1e-8, float(np.percentile(power, 90)) * .002)
    radius = min(seconds * .22, 1.5)
    candidates, start = [], None
    for i, low in enumerate(np.r_[quiet, False]):
        if low and start is None:
            start = i
        elif not low and start is not None:
            middle = (start+i)/2 * hop/rate
            if (i-start)*hop/rate >= .06 and .15 < middle < seconds-.15 and abs(middle-expected) <= radius:
                candidates.append((abs(middle-expected), middle))
            start = None
    boundary = min(candidates)[1] if candidates else expected
    return [0., boundary, seconds], 'pause' if candidates else 'estimated'
