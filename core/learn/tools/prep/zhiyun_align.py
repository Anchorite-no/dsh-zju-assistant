"""把智云的课堂截图和字幕按时间对齐，方便"一张图加这段话"地读资料。

    tools\index-tts\.venv\Scripts\python.exe tools\prep\zhiyun_align.py lessons\<主题>\data lessons\<主题>\plan [字幕落后的秒数]

读入 data\slides\<序号>-<秒数>s.jpg 和 data\subtitles.json，产出：
  plan\timeline.md        每张截图一节，下面是它在屏幕上时老师说的话
  plan\sheets\sheet-NN.jpg 缩略图总览，每张 9 格，格子左上角标着序号和时刻

截图和字幕的时间轴不一定同一个起点。ADS 第一讲实测，字幕的时间戳比截图早 9 到 10 分钟：
字幕里 73:33 说的话，对应的是 82:46 才出现的那张截图。所以先不带第三个参数跑一遍，
挑三四处内容对得上的地方（老师念出了幻灯片上的某个词）算出差多少秒，再带上这个数重跑。
不核对就直接读，会把老师的话配到错的幻灯片上。

借用的是 IndexTTS 虚拟环境里的 Pillow，和配音无关。
"""
import glob
import json
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

COLS, ROWS, TW, TH, BAR = 3, 3, 640, 360, 34


def clock(seconds):
    return f"{int(seconds) // 60:02d}:{int(seconds) % 60:02d}"


def main():
    data_dir, plan_dir = sys.argv[1], sys.argv[2]
    shift = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0   # 字幕时间 + shift = 截图时间
    slides = []
    for path in glob.glob(os.path.join(data_dir, "slides", "*.jpg")):
        m = re.fullmatch(r"(\d+)-(\d+)s", os.path.splitext(os.path.basename(path))[0])
        if m:
            slides.append((int(m.group(1)), int(m.group(2)), path))
    slides.sort()
    with open(os.path.join(data_dir, "subtitles.json"), encoding="utf-8") as f:
        captions = json.load(f)["captions"]

    os.makedirs(plan_dir, exist_ok=True)
    with open(os.path.join(plan_dir, "timeline.md"), "w", encoding="utf-8") as out:
        out.write("# 截图和字幕对照\n\n字幕是自动识别的，错字很多。定义、公式、数字以截图为准。\n")
        out.write(f"\n方括号里是字幕自己的时间戳。字幕按落后 {shift:g} 秒对到截图上"
                  + ("；这个数没有核对过，先找几处内容对得上的地方确认。\n" if not shift else "。\n"))
        before = [c for c in captions if c["start"] + shift < slides[0][1]]
        if before:
            out.write("\n## 第一张截图之前\n\n" + "\n".join(f"[{clock(c['start'])}] {c['text']}" for c in before) + "\n")
        for i, (no, t, _) in enumerate(slides):
            end = slides[i + 1][1] if i + 1 < len(slides) else float("inf")
            said = [c for c in captions if t <= c["start"] + shift < end]
            shown = (end - t) if end != float("inf") else 0
            out.write(f"\n## 截图 {no}（{clock(t)}，停留 {int(shown)} 秒）\n\n")
            out.write("\n".join(f"[{clock(c['start'])}] {c['text']}" for c in said) if said else "（这一页上没有字幕）")
            out.write("\n")

    try:
        font = ImageFont.truetype("msyh.ttc", 22)
    except OSError:
        font = ImageFont.load_default()
    sheet_dir = os.path.join(plan_dir, "sheets")
    os.makedirs(sheet_dir, exist_ok=True)
    per = COLS * ROWS
    for s in range(0, len(slides), per):
        sheet = Image.new("RGB", (COLS * TW, ROWS * (TH + BAR)), "white")
        draw = ImageDraw.Draw(sheet)
        for k, (no, t, path) in enumerate(slides[s:s + per]):
            x, y = (k % COLS) * TW, (k // COLS) * (TH + BAR)
            draw.text((x + 8, y + 4), f"截图 {no}   {clock(t)}", fill="black", font=font)
            sheet.paste(Image.open(path).convert("RGB").resize((TW, TH), Image.LANCZOS), (x, y + BAR))
        sheet.save(os.path.join(sheet_dir, f"sheet-{s // per + 1:02d}.jpg"), quality=88)
    print(f"{len(slides)} 张截图，{len(captions)} 句字幕 -> {os.path.join(plan_dir, 'timeline.md')}，{(len(slides) + per - 1) // per} 张总览")


if __name__ == "__main__":
    main()
