# -*- coding: utf-8 -*-
"""19k 资产「轮廓可辨识度」量化取证。

方法（可复现）：
1. 以 `v3-20k-bg-diagnostic.png`（同机位、隐藏全部成员 group 后拍摄）为背景参考，
   对 6 张交付截图逐像素求最大通道差，超过阈值即判为角色前景 → 得到剪影掩膜。
2. 两两计算掩膜 IoU（交集/并集）——IoU 越接近 1 说明剪影越难区分。
3. 在角色裁剪区（与 closeup sheet 同一矩形）计算两两平均像素差与「明显差异像素占比」。
4. 7.6k 版（v3-16-*）与 19k 版同角色成对比较：没有同机位背景帧，故只做像素差统计。
5. 产出：edge overlay（6 只剪影边缘彩色叠加）、3up 并排、20k vs 16k 成对对比图。

输出：
  docs/evidence/v3-20k-edge-overlay-diagnostic.png
  docs/evidence/v3-20k-compare-3up-diagnostic.png
  docs/evidence/v3-20k-vs-16-diagnostic.png
  docs/evidence/v3-20k-diag-20261109.json
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

EV = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "evidence"))

# 与 closeup sheet 完全一致的裁剪矩形（截图 px，非 CSS px）
CROP = (738, 430, 1263, 955)

SHOTS = [
    ("v3-20k-00-naiwa-20261109.png", "奶蛙 1/16"),
    ("v3-20k-01-naishu-20261109.png", "奶鼠 5/16"),
    ("v3-20k-02-naifen-20261109.png", "奶粉 7/16"),
    ("v3-20k-03-naimao-20261109.png", "奶猫 9/16"),
    ("v3-20k-04-naishi-20261109.png", "奶屎 10/16"),
    ("v3-20k-05-xigema-20261109.png", "西格玛 16/16"),
]

# 7.6k 版与 19k 版的同角色配对
PAIRS_16_20K = [
    ("v3-16-00-naiwa-20261109.png", "v3-20k-00-naiwa-20261109.png", "奶蛙"),
    ("v3-16-03-naishu-20261109.png", "v3-20k-01-naishu-20261109.png", "奶鼠"),
    ("v3-16-04-naimao-20261109.png", "v3-20k-03-naimao-20261109.png", "奶猫"),
    ("v3-16-05-naishi-20261109.png", "v3-20k-04-naishi-20261109.png", "奶屎"),
]

SKIN_DIFF_THRESHOLD = 12   # 前景判定：任一通道绝对差 > 12
VISIBLE_DIFF_THRESHOLD = 24  # 「人眼明显差异」判定阈值

FONT = None
for fp in ("C:/Windows/Fonts/msyhbd.ttc", "C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/simhei.ttf"):
    if os.path.exists(fp):
        FONT = ImageFont.truetype(fp, 22)
        break
assert FONT, "no CJK font"


def load(name):
    return np.asarray(Image.open(os.path.join(EV, name)).convert("RGB"), dtype=np.int16)


def crop(a):
    x0, y0, x1, y1 = CROP
    return a[y0:y1, x0:x1]


def diff_stats(a, b):
    d = np.abs(a.astype(np.int16) - b.astype(np.int16))
    per_px = d.max(axis=2)
    return {
        "meanAbsDiff": round(float(d.mean()), 2),
        "meanMaxChannelDiff": round(float(per_px.mean()), 2),
        "visibleDiffPct": round(float((per_px > VISIBLE_DIFF_THRESHOLD).mean() * 100), 2),
    }


def main():
    bg = load("v3-20k-bg-diagnostic.png")
    imgs, labels, masks = [], [], []
    per_shot = {}
    for f, label in SHOTS:
        a = load(f)
        m = (np.abs(a - bg).max(axis=2) > SKIN_DIFF_THRESHOLD)
        # 只保留裁剪区内的主体，避免 HUD / 地面细节噪声混进剪影
        mc = np.zeros_like(m)
        mc[CROP[1]:CROP[3], CROP[0]:CROP[2]] = m[CROP[1]:CROP[3], CROP[0]:CROP[2]]
        ys, xs = np.nonzero(mc)
        box = None
        if len(xs):
            box = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
        per_shot[f] = {"label": label, "maskPx": int(mc.sum()), "maskBBoxPx": box}
        imgs.append(a)
        labels.append(label)
        masks.append(mc)

    # ---- 两两 IoU ----
    iou = {}
    for i in range(len(masks)):
        for j in range(i + 1, len(masks)):
            inter = np.logical_and(masks[i], masks[j]).sum()
            union = np.logical_or(masks[i], masks[j]).sum()
            iou[labels[i] + " vs " + labels[j]] = round(float(inter / union) if union else 0.0, 3)

    # ---- 两两像素差（角色裁剪区）----
    pix = {}
    for i in range(len(imgs)):
        for j in range(i + 1, len(imgs)):
            pix[labels[i] + " vs " + labels[j]] = diff_stats(crop(imgs[i]), crop(imgs[j]))

    # ---- edge overlay：把 6 只剪影边缘用不同颜色画在同一张黑底上 ----
    colors = [(255, 64, 64), (255, 170, 0), (240, 240, 60), (60, 220, 90), (60, 170, 255), (220, 90, 255)]
    x0, y0, x1, y1 = CROP
    w, h = x1 - x0, y1 - y0
    ov = Image.new("RGB", (w, h), (0, 0, 0))
    px = ov.load()
    for k, m in enumerate(masks):
        mc = m[y0:y1, x0:x1]
        # 边缘 = 掩膜 与 4 邻域腐蚀结果之差
        er = mc.copy()
        er[1:, :] &= mc[:-1, :]
        er[:-1, :] &= mc[1:, :]
        er[:, 1:] &= mc[:, :-1]
        er[:, :-1] &= mc[:, 1:]
        edge = np.logical_and(mc, np.logical_not(er))
        ey, ex = np.nonzero(edge)
        c = colors[k % len(colors)]
        for yy, xx in zip(ey.tolist(), ex.tolist()):
            px[xx, yy] = c
    ov = ov.resize((w * 2, h * 2), Image.NEAREST)
    ov.save(os.path.join(EV, "v3-20k-edge-overlay-diagnostic.png"))

    # ---- 3up：奶蛙 / 奶猫 / 西格玛 并排裁剪 ----
    pick = [0, 3, 5]
    tile = 560
    sheet = Image.new("RGB", (tile * 3, tile + 34), (24, 24, 28))
    d = ImageDraw.Draw(sheet)
    for n, idx in enumerate(pick):
        c = Image.fromarray(crop(imgs[idx]).astype(np.uint8)).resize((tile, tile), Image.LANCZOS)
        sheet.paste(c, (n * tile, 0))
        d.text((n * tile + 10, tile + 6), labels[idx], font=FONT, fill=(240, 240, 240))
    sheet.save(os.path.join(EV, "v3-20k-compare-3up-diagnostic.png"))

    # ---- 20k vs 16k 同角色成对 ----
    pairs = []
    tile = 500
    rows = len(PAIRS_16_20K)
    sheet = Image.new("RGB", (tile * 2, (tile + 40) * rows), (24, 24, 28))
    d = ImageDraw.Draw(sheet)
    for r, (f16, f20, name) in enumerate(PAIRS_16_20K):
        a16, a20 = load(f16), load(f20)
        st = diff_stats(crop(a16), crop(a20))
        pairs.append({"name": name, "a": f16, "b": f20, **st})
        for c, arr in enumerate((a16, a20)):
            im = Image.fromarray(crop(arr).astype(np.uint8)).resize((tile, tile), Image.LANCZOS)
            sheet.paste(im, (c * tile, r * (tile + 40)))
        d.text((10, r * (tile + 40) + tile + 8),
               "%s  7.6k(左) vs 19k(右)  meanDiff=%.2f  visibleDiff=%.2f%%"
               % (name, st["meanAbsDiff"], st["visibleDiffPct"]),
               font=FONT, fill=(240, 240, 240))
    sheet.save(os.path.join(EV, "v3-20k-vs-16-diagnostic.png"))

    out = {
        "method": {
            "bgRef": "v3-20k-bg-diagnostic.png（同机位，隐藏全部成员 group 后拍摄）",
            "foregroundThreshold": SKIN_DIFF_THRESHOLD,
            "visibleDiffThreshold": VISIBLE_DIFF_THRESHOLD,
            "cropPx": list(CROP),
        },
        "perShot": per_shot,
        "iou19k": iou,
        "iou19kSorted": sorted(iou.items(), key=lambda kv: -kv[1]),
        "pixelDiff19k": pix,
        "vs16k": pairs,
    }
    with open(os.path.join(EV, "v3-20k-diag-20261109.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)

    print("== per-shot silhouette ==")
    for f, v in per_shot.items():
        print(v["label"], "maskPx=%d" % v["maskPx"], "bbox=%s" % v["maskBBoxPx"])
    print("== IoU (19k) ==")
    for k, v in out["iou19kSorted"]:
        print("%.3f  %s" % (v, k))
    print("== pixel diff (19k, char crop) ==")
    for k, v in pix.items():
        print(k, v)
    print("== 7.6k vs 19k ==")
    for p in pairs:
        print(p["name"], p)


if __name__ == "__main__":
    main()