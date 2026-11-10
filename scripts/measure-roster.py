# -*- coding: utf-8 -*-
"""
16 只族谱还原度量化（只读审计，v3-roster）。

数据源（capture-roster.mjs 产出，2000x1250 canvas）：
  - v3-roster-iso-XX.png        只留角色+灯光、无 DOM、无 bloom 的隔离帧
  - v3-roster-iso-empty-XX.png  同状态但角色隐藏的纯背景帧
口径：
  掩膜 = |iso - empty| 三通道绝对差求和 > DIFF_TH，再经 5x5 中值滤波去噪
  指标：
    bbox            掩膜外接框（canvas px）
    aspect          bbox 宽高比 w/h（>1 宽扁、<1 窄高、≈1 方圆）
    fill            掩膜面积 / bbox 面积（1=实心块，低=细枝/分离件多）
    areaFrac        掩膜面积 / 全画面（本体屏占比口径，不含阴影/背景）
    medRGB/medHSV   掩膜内中位色（HSV 按 colorsys 每像素换算后取中位）
    hueDeltaDeg     掩膜中位色相 vs squad.mjs config color 色相（环上最小差）
    shapeHint       规则化形状描述（供人工复核，不作判级依据）
判级阈值（任务书 §4）：
  配色：hueDelta <25°=还原、25–45°=部分、>45°=缺失（S/V 漂移在报告人工叙述）

用法：python -X utf8 scripts/measure-roster.py
输出：docs/evidence/roster-metrics-20261110.json + 控制台表
"""
import json
import colorsys
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EV = os.path.join(ROOT, "docs", "evidence")
OUT_JSON = os.path.join(EV, "roster-metrics-20261110.json")

DIFF_TH = 30          # 三通道差分和阈值（0–765）
MEDIAN_K = 5          # 掩膜去噪中值核
MIN_AREA = 400        # 低于此面积视为切换/坏帧

# 与 src/game/squad.mjs L22-38 逐条对齐（勿臆造；color 为 config 原值）
FAMILY = [
    {"idx": 0,  "id": "shell_naiwa",      "name": "奶蛙",     "color": 0xF5C542, "glb": "naiwa_laugh_g1_runtime.glb"},
    {"idx": 1,  "id": "shell_naidou",     "name": "奶豆",     "color": 0xE0B84F, "glb": "naiwa_naidou_runtime.glb"},
    {"idx": 2,  "id": "shell_xiaonaiwa",  "name": "小奶蛙",   "color": 0xF8D96B, "glb": "naiwa_xiaonaiwa_runtime.glb"},
    {"idx": 3,  "id": "shell_naidan",     "name": "奶蛋",     "color": 0xFFF0C2, "glb": "naiwa_naidan_runtime.glb"},
    {"idx": 4,  "id": "shell_nashu",      "name": "奶鼠",     "color": 0xCFA878, "glb": "naiwa_nashu_runtime.glb"},
    {"idx": 5,  "id": "shell_naigou",     "name": "奶狗",     "color": 0xC98D5A, "glb": "naiwa_naigou_runtime.glb"},
    {"idx": 6,  "id": "shell_naifen",     "name": "奶粉",     "color": 0xF2D8DE, "glb": "naiwa_naifen_runtime.glb"},
    {"idx": 7,  "id": "shell_naiji",      "name": "奶鸡",     "color": 0xF0E0A8, "glb": "naiwa_naiji_runtime.glb"},
    {"idx": 8,  "id": "shell_naimao",     "name": "奶猫",     "color": 0xBFC4CC, "glb": "naiwa_naimao_runtime.glb"},
    {"idx": 9,  "id": "shell_naishi",     "name": "奶屎",     "color": 0xB08E5E, "glb": "naiwa_naishi_runtime.glb"},
    {"idx": 10, "id": "shell_dounai",     "name": "豆奶",     "color": 0xEFE8D8, "glb": "naiwa_dounai_runtime.glb"},
    {"idx": 11, "id": "shell_naitu",      "name": "奶兔",     "color": 0xF7F1E3, "glb": "naiwa_naitu_runtime.glb"},
    {"idx": 12, "id": "shell_naiyu",      "name": "奶鱼",     "color": 0xA8D8EA, "glb": "naiwa_naiyu_runtime.glb"},
    {"idx": 13, "id": "shell_naicha",     "name": "奶茶",     "color": 0xC68A4E, "glb": "naiwa_naicha_runtime.glb"},
    {"idx": 14, "id": "shell_naiping",    "name": "奶瓶",     "color": 0xFDF3E0, "glb": "naiwa_naiping_runtime.glb"},
    {"idx": 15, "id": "shell_xigema",     "name": "西格玛奶蛙", "color": 0x9C7A3C, "glb": "naiwa_xigema_runtime.glb"},
]


def rgb2hsv(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    return h * 360.0, s, v


def hue_delta(h1, h2):
    d = abs(h1 - h2) % 360.0
    return min(d, 360.0 - d)


def mask_of(iso_path, empty_path):
    """iso−empty 差分掩膜 + 中值去噪。返回 (mask, 诊断)。"""
    iso = np.asarray(Image.open(iso_path).convert("RGB")).astype(np.int32)
    empty = np.asarray(Image.open(empty_path).convert("RGB")).astype(np.int32)
    if iso.shape != empty.shape:
        raise SystemExit("尺寸不一致: %s %s vs %s %s" % (iso_path, iso.shape, empty_path, empty.shape))
    diff = np.abs(iso - empty).sum(axis=2)
    raw = diff > DIFF_TH
    mimg = Image.fromarray((raw * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(MEDIAN_K))
    mask = np.asarray(mimg) > 127
    return mask, {
        "diffMean": round(float(diff.mean()), 2),
        "rawFrac": round(float(raw.mean()), 5),
        "maskFrac": round(float(mask.mean()), 5),
    }


def region_stats(mask):
    ys, xs = np.where(mask)
    if len(xs) < MIN_AREA:
        return None
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    area = int(mask.sum())

    return {
        "bbox": [x0, y0, x1, y1], "bboxSize": [bw, bh],
        "aspectWH": round(bw / bh, 3),
        "fill": round(area / (bw * bh), 3),
        "areaFrac": round(area / mask.size, 4),
        "areaPx": area,
        "centroid": [round(float(xs.mean()), 1), round(float(ys.mean()), 1)],
    }


def color_stats(iso_path, mask):
    """掩膜内中位 RGB/HSV（用 iso 帧，NPR 无 bloom 口径）。"""
    arr = np.asarray(Image.open(iso_path).convert("RGB"))
    ys, xs = np.where(mask)
    pix = arr[ys, xs].astype(np.float64)
    med = np.median(pix, axis=0)
    hsv = np.array([rgb2hsv(*p) for p in pix[:: max(1, len(pix) // 5000)]])  # 采样上限 ~5000
    med_h = float(np.median(hsv[:, 0]))
    med_s = float(np.median(hsv[:, 1]))
    med_v = float(np.median(hsv[:, 2]))
    return {
        "medRGB": [round(float(c), 1) for c in med],
        "medHSV": [round(med_h, 1), round(med_s, 3), round(med_v, 3)],
    }


def shape_hint(aspect, fill):
    """规则化形状描述（人工复核辅助）。"""
    a = aspect
    f = fill
    if a < 0.75:
        base = "窄高"
    elif a <= 1.25:
        base = "方圆"
    else:
        base = "宽扁"
    if f >= 0.85:
        extra = "实心饱满"
    elif f >= 0.65:
        extra = "较饱满"
    elif f >= 0.45:
        extra = "有分离件/细枝"
    else:
        extra = "大量分离件/极端纤细"
    return base + "·" + extra


def main():
    rows = []
    for f in FAMILY:
        i2 = "%02d" % f["idx"]
        iso_p = os.path.join(EV, "v3-roster-iso-%s.png" % i2)
        empty_p = os.path.join(EV, "v3-roster-iso-empty-%s.png" % i2)
        for p in (iso_p, empty_p):
            if not os.path.exists(p):
                raise SystemExit("缺少采集帧: " + p)
        mask, diag = mask_of(iso_p, empty_p)
        st = region_stats(mask)
        if st is None:
            rows.append({"idx": f["idx"], "id": f["id"], "name": f["name"], "error": "掩膜过小(<%d px)" % MIN_AREA, "diag": diag})
            print("%-2d %-14s ERROR 掩膜过小 maskFrac=%.5f" % (f["idx"], f["name"], diag["maskFrac"]))
            continue
        cs = color_stats(iso_p, mask)
        cr, cg, cb = ((f["color"] >> 16) & 255, (f["color"] >> 8) & 255, f["color"] & 255)
        cfg_h, cfg_s, cfg_v = rgb2hsv(cr, cg, cb)
        hd = hue_delta(cs["medHSV"][0], cfg_h)
        sv_delta = [round(cs["medHSV"][1] - cfg_s, 3), round(cs["medHSV"][2] - cfg_v, 3)]
        row = {
            "idx": f["idx"], "id": f["id"], "name": f["name"], "glb": f["glb"],
            "cfgColor": "#%06X" % f["color"],
            "cfgHSV": [round(cfg_h, 1), round(cfg_s, 3), round(cfg_v, 3)],
            **st, **cs,
            "hueDeltaDeg": round(hd, 1),
            "svDelta": sv_delta,
            "shapeHint": shape_hint(st["aspectWH"], st["fill"]),
            "diag": diag,
            "colorGrade": "还原" if hd < 25 else ("部分" if hd <= 45 else "缺失"),
        }
        rows.append(row)
        print("%-2d %-8s aspect=%.2f fill=%.2f areaFrac=%.3f bbox=%s medRGB=%s hueΔ=%5.1f° ΔS/V=%s %s"
              % (f["idx"], f["name"], row["aspectWH"], row["fill"], row["areaFrac"], row["bboxSize"],
                 row["medRGB"], hd, sv_delta, row["colorGrade"]))

    payload = {
        "criteria": {"diffTh": DIFF_TH, "medianK": MEDIAN_K,
                     "hueGrade": "<25°=还原 / 25–45°=部分 / >45°=缺失（相对 squad.mjs config color）"},
        "maskMethod": "|iso - isoEmpty| 三通道差分和 > 30 → 5x5 中值滤波",
        "rows": rows,
        "familySource": "src/game/squad.mjs L22-38（只读对齐，勿臆造）",
    }
    with open(OUT_JSON, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    print("[json] " + OUT_JSON)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())