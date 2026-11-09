#!/usr/bin/env python
"""
合成官方「奶蛙家族族谱图」。

为什么不用参考图那张：
  参考图 `奶蛙族谱全景_铭牌校正.png` 有三个问题——
    1. 右下角带「Miora 生成」水印，不能随包发；
    2. 它画了 **19 只**角色，与项目实际的 16 只对不上，名字也不一致；
    3. 角色是 AI 生成的圆润 3D 渲染，与游戏内实际模型不是同一套造型，
       当「家族举证」反而露怯（评审会问「游戏里是这 16 只吗」）。
  所以改成：**用游戏里真实渲染出来的 16 只立绘**合成，版式借参考图的
  「环形展台 + 铭牌」思路，但内容百分之百对得上。

输入：.ego-tmp-alpha-<id>.png（16 张透明底立绘，640²）
      src/game/squad.mjs 的成员名单（名字与编号）
输出：docs/evidence/family-roster.png（1920×1080）
      public/portrait/family-roster.png（游戏内族谱页用）

合规：不使用任何权属素材；版式为自研；底纹为程序化生成。
"""
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 透明底立绘落在项目根目录的 .ego-tmp-alpha-<id>.png
ALPHA_GLOB = ".ego-tmp-alpha-%s.png"
OUT_EVIDENCE = os.path.join(ROOT, "docs", "evidence", "family-roster.png")
OUT_PUBLIC = os.path.join(ROOT, "public", "portrait", "family-roster.png")

W, H = 1920, 1080

# 与游戏一致的强调色（取自主仓库 HUD 色板）
GOLD = (245, 197, 66)
CYAN = (110, 231, 255)
INK = (7, 9, 14)


def load_roster():
    """从 squad.mjs 读成员顺序与名字，避免和代码脱节。"""
    p = os.path.join(ROOT, "src", "game", "squad.mjs")
    src = open(p, encoding="utf-8").read()
    out = []
    for m in re.finditer(
        r'\{\s*id:\s*"(shell_[a-z0-9_]+)",\s*name:\s*"([^"]+)"', src
    ):
        out.append((m.group(1), m.group(2)))
    return out


def make_background():
    """黑底 + 顶部黄黑警戒条 + 地面椭圆光带 + 细网格。"""
    bg = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(bg)

    # 顶部警戒条
    for x in range(-40, W + 40, 48):
        d.polygon(
            [(x, 0), (x + 24, 0), (x + 24 - 22, 10), (x - 22, 10)],
            fill=GOLD,
        )
    # 警戒条下方压一条深色，制造层次
    d.rectangle([0, 10, W, 26], fill=(12, 14, 20))

    # 背景细网格（很淡，只做质感不抢戏）
    grid = Image.new("RGB", (W, H), INK)
    gd = ImageDraw.Draw(grid)
    for x in range(0, W, 60):
        gd.line([(x, 26), (x, H)], fill=(16, 19, 27), width=1)
    for y in range(26, H, 60):
        gd.line([(0, y), (W, y)], fill=(16, 19, 27), width=1)
    bg = Image.blend(bg, grid, 0.55)

    # 地面光带（椭圆，给出「站在展台上」的地面感）
    glow = Image.new("L", (W, H), 0)
    gld = ImageDraw.Draw(glow)
    gld.ellipse([W * 0.10, H * 0.80, W * 0.90, H * 1.06], fill=110)
    gld.ellipse([W * 0.24, H * 0.84, W * 0.76, H * 1.00], fill=150)
    glow = glow.filter(ImageFilter.GaussianBlur(38))
    cyan = Image.new("RGB", (W, H), (40, 130, 160))
    bg = Image.composite(Image.blend(bg, cyan, 0.35), bg, glow)

    # 顶部冷光
    top = Image.new("L", (W, H), 0)
    td = ImageDraw.Draw(top)
    td.ellipse([W * 0.18, -H * 0.34, W * 0.82, H * 0.30], fill=95)
    top = top.filter(ImageFilter.GaussianBlur(70))
    cool = Image.new("RGB", (W, H), (30, 70, 100))
    bg = Image.composite(Image.blend(bg, cool, 0.30), bg, top)
    return bg


def draw_plate(draw, x, y, w, h, title, sub):
    """单个成员的展台：椭圆台面 + 铭牌。"""
    # 台面投影
    draw.ellipse([x - w * 0.16, y + h * 0.02, x + w * 0.16, y + h * 0.10], fill=(10, 12, 18))
    # 台面环
    draw.ellipse([x - w * 0.15, y - h * 0.02, x + w * 0.15, y + h * 0.04], outline=(58, 74, 92), width=2)
    draw.arc([x - w * 0.15, y - h * 0.02, x + w * 0.15, y + h * 0.04], 200, 340, fill=CYAN, width=2)

    # 铭牌底
    pw = 118
    ph = 46
    px = x - pw / 2
    py = y + h * 0.05
    draw.rounded_rectangle([px, py, px + pw, py + ph], radius=4, fill=(14, 17, 24), outline=(46, 54, 68), width=1)
    # 铭牌左侧编号条
    draw.rectangle([px, py, px + 4, py + ph], fill=GOLD)
    # 名字
    draw.text((px + pw / 2, py + 15), title, font=FONT_NAME, fill=(236, 240, 248), anchor="mm")
    # 副标题（招式）
    draw.text((px + pw / 2, py + 33), sub, font=FONT_SUB, fill=(150, 162, 178), anchor="mm")


def main():
    global FONT_NAME, FONT_SUB, FONT_TITLE, FONT_NUM

    roster = load_roster()
    if len(roster) != 16:
        print("警告：读到 %d 名成员（预期 16）" % len(roster))

    # 字体：Windows 自带黑体族
    def font(name, size):
        for f in [
            "C:/Windows/Fonts/msyh.ttc",
            "C:/Windows/Fonts/msyhbd.ttc",
            "C:/Windows/Fonts/simhei.ttf",
            "C:/Windows/Fonts/simsun.ttc",
        ]:
            if os.path.exists(f):
                try:
                    return ImageFont.truetype(f, size)
                except Exception:
                    continue
        return ImageFont.load_default()

    FONT_NAME = font("name", 19)
    FONT_SUB = font("sub", 13)
    FONT_TITLE = font("title", 44)
    FONT_NUM = font("num", 13)

    bg = make_background()
    canvas = bg.convert("RGBA")

    # 标题
    d = ImageDraw.Draw(canvas)
    d.text((60, 54), "奶蛙家族 · 族谱", font=FONT_TITLE, fill=(242, 246, 252))
    d.text((62, 110), "NAIWA FAMILY ROSTER · 16 MEMBERS", font=FONT_SUB, fill=(122, 134, 150))
    # 标题下的金色短线
    d.rectangle([60, 140, 240, 144], fill=GOLD)

    # 两排 8 列排布
    cols = 8
    rows = 2
    margin_x = 96
    cell_w = (W - margin_x * 2) / cols
    img_h = 268
    # 顶部留给标题，底部留白收紧
    row1_top = 176
    row2_top = 596
    row_tops = [row1_top, row2_top]

    for i, (pid, name) in enumerate(roster):
        col = i % cols
        row = i // cols
        cx = margin_x + cell_w * (col + 0.5)
        # 立绘底边（= 展台位置）
        cy = row_tops[row] + img_h

        fp = os.path.join(ROOT, ALPHA_GLOB % pid)
        if not os.path.exists(fp):
            print("  缺图 %s" % pid)
            continue

        im = Image.open(fp).convert("RGBA")
        # 缩放到统一高度
        scale = img_h / im.height
        im = im.resize((int(im.width * scale), img_h), Image.LANCZOS)
        # 落地阴影
        sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
        sa = im.getchannel("A").point(lambda v: int(v * 0.42))
        sh.putalpha(sa)
        sh = sh.filter(ImageFilter.GaussianBlur(9))
        canvas.alpha_composite(sh, (int(cx - im.width / 2), int(cy - im.height + 14)))

        canvas.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height + 6)))

        # 展台 + 铭牌
        draw_plate(d, cx, cy + 8, cell_w, img_h, name, "%02d" % (i + 1))

    # 底部说明
    d.rectangle([60, H - 52, W - 60, H - 50], fill=(30, 36, 46))
    d.text(
        (60, H - 34),
        "同源圆润语汇下的 16 种剪影 · 换壳即换招，不是换颜色 · 角色资产由 Lux3D 生成后离线渲染",
        font=FONT_SUB,
        fill=(126, 138, 154),
    )

    out = canvas.convert("RGB")
    os.makedirs(os.path.dirname(OUT_EVIDENCE), exist_ok=True)
    out.save(OUT_EVIDENCE, quality=95)
    os.makedirs(os.path.dirname(OUT_PUBLIC), exist_ok=True)
    out.save(OUT_PUBLIC)
    print("已生成：%s" % OUT_EVIDENCE)
    print("已生成：%s" % OUT_PUBLIC)
    print("尺寸 %dx%d" % out.size)


if __name__ == "__main__":
    main()
