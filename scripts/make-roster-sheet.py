# -*- coding: utf-8 -*-
"""
族谱对照拼图（只读审计产出）：族谱全景缩小置顶 + 16 只主图 4x4 宫格，每格标注 idx+name+判级。

布局：
  顶部：族谱全景 3840x1920 → 缩至 1600x800
  下部：16 宫格 4x4（每格 400x250，主图 2000x1250 等比缩小），格间 4px 白边
  标注：每格左上角黑底白字「idx 名字 判级」
用法：python -X utf8 scripts/make-roster-sheet.py
输出：docs/evidence/v3-roster-sheet-20261110.png
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EV = os.path.join(ROOT, "docs", "evidence")
OUT = os.path.join(EV, "v3-roster-sheet-20261110.png")

FAMILY = [
    (0, "奶蛙", "还原"), (1, "奶豆", "还原"), (2, "小奶蛙", "还原"), (3, "奶蛋", "还原"),
    (4, "奶鼠", "还原"), (5, "奶狗", "还原"), (6, "奶粉", "缺失"), (7, "奶鸡", "还原"),
    (8, "奶猫", "部分"), (9, "奶屎", "部分"), (10, "豆奶", "部分"), (11, "奶兔", "还原"),
    (12, "奶鱼", "部分"), (13, "奶茶", "还原"), (14, "奶瓶", "还原"), (15, "西格玛奶蛙", "还原"),
]

GRADE_COLOR = {"还原": "#1a7f37", "部分": "#b58900", "缺失": "#c62828"}


def load_font(size):
    for p in [
        "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simhei.ttf",
        "C:/Windows/Fonts/simsun.ttc",
    ]:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def main():
    W = 1600
    ref = Image.open(os.path.join(ROOT, "docs", "reference-art", "奶蛙族谱全景_铭牌校正.png")).convert("RGB")
    ref = ref.resize((W, 800), Image.LANCZOS)
    cell_w, cell_h, gap = 400, 250, 4
    grid_h = 4 * (cell_h + gap) + gap
    canvas = Image.new("RGB", (W, 800 + 8 + grid_h), "#101014")
    canvas.paste(ref, (0, 0))
    draw = ImageDraw.Draw(canvas)
    font = load_font(15)
    draw.text((6, 802), "上：族谱全景_铭牌校正.png（17 只：后排 15 含 C 位奶蛙 + 前排奶鱼/西格玛；第 17 只「奶克」未进 16 壳）　下：3D 实拍 16 只（v3-roster 主图，2000x1250 缩至 400x250）",
              fill="#e8e8e8", font=font)
    for i, (idx, name, grade) in enumerate(FAMILY):
        r, c = divmod(i, 4)
        x0 = gap + c * (cell_w + gap)
        y0 = 800 + 8 + gap + r * (cell_h + gap)
        img = Image.open(os.path.join(EV, "v3-roster-%02d-%s.png" % (
            idx, {0: "naiwa", 1: "naidou", 2: "xiaonaiwa", 3: "naidan", 4: "nashu", 5: "naigou",
                  6: "naifen", 7: "naiji", 8: "naimao", 9: "naishi", 10: "dounai", 11: "naitu",
                  12: "naiyu", 13: "naicha", 14: "naiping", 15: "xigema"}[idx]))).convert("RGB")
        img = img.resize((cell_w, cell_h), Image.LANCZOS)
        canvas.paste(img, (x0, y0))
        label = "%d %s %s" % (idx, name, grade)
        tb = draw.textbbox((0, 0), label, font=font)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
        draw.rectangle([x0, y0, x0 + tw + 10, y0 + th + 8], fill="#000000c8"[:7])
        draw.text((x0 + 5, y0 + 4), label, fill=GRADE_COLOR[grade], font=font)
    canvas.save(OUT)
    print("[sheet] %s %s bytes=%d" % (OUT, canvas.size, os.path.getsize(OUT)))


if __name__ == "__main__":
    main()