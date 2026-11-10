# -*- coding: utf-8 -*-
"""
撤销重染复验量化（v3-tint2，task id=24 leader 裁决：证明「回到原状」）。

数据源（2000×1250 canvas）：
  新帧（.tmp-dist-tint2 构建，重染撤销）：v3-tint2-XX-<short>.png（主图）+ iso 帧
  基线帧（roster-audit 重染前）：v3-roster-XX-<short>.png（主图）
双口径：
  A. leader 口径（主判据）：固定区域 x780-1240 / y640-1180（2000×1250）
     mean      = 区域内 (R+G+B)/3 均值
     meanSat   = 区域内 HSV S 均值
     nearWhite = 区域内像素 mean(R,G,B) > 240 的占比
     （口径校准：mean>240 与 leader 仲裁全部数字精确匹配——roster 帧奶蛙 0.19/奶猫 1.06/
     奶鱼 0.21%、重染帧奶猫 16.24/奶鱼 2.88，五点全中；min>240 定义过严全为 0）
  B. 掩膜口径（参考）：|iso − isoEmpty| 差分 >30 → 5×5 中值滤波，掩膜内中位色
判据（leader 裁决）：
  - hueΔ(新帧 vs roster 帧, 掩膜中位) < 8° = 回到原色
  - nearWhite < 2%（坏值：撤销前奶猫 16.24%）
  - meanSat ∈ [0.8×, 1.2×] roster 基线（奶鱼 0.312 / 奶猫 0.237 / 奶粉取 roster 帧）
  - |mean − roster 基线| < 15
  - 抽查奶蛙/西格玛同口径零漂移
输出：docs/evidence/tint2-metrics-20261110.json + 控制台表

用法：python -X utf8 scripts/measure-tint2.py
"""
import json
import colorsys
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EV = os.path.join(ROOT, "docs", "evidence")
OUT_JSON = os.path.join(EV, "tint2-metrics-20261110.json")

# leader 仲裁区域（2000×1250）
RX0, RY0, RX1, RY1 = 780, 640, 1240, 1180
NEAR_WHITE_TH = 240     # min(R,G,B) > 240 = 近白
DIFF_TH = 30            # 掩膜差分阈值
MEDIAN_K = 5

# idx: (short, name, leader 仲裁基线 mean/meanSat/nearWhite（有则填，用于校准对照）)
TARGETS = {
    0:  ("naiwa",  "奶蛙",   {"mean": 148.6, "meanSat": 0.434, "nearWhite": 0.0019}),
    6:  ("naifen", "奶粉",   {}),
    8:  ("naimao", "奶猫",   {"mean": 168.0, "meanSat": 0.237, "nearWhite": 0.0106}),
    12: ("naiyu",  "奶鱼",   {"mean": 144.8, "meanSat": 0.312, "nearWhite": 0.0021}),
    15: ("xigema", "西格玛奶蛙", {}),
}


def rgb2hsv_arr(rgb):
    """rgb float 数组 (N,3) 0-255 → (h 0-360, s 0-1, v 0-1)。"""
    c = rgb / 255.0
    mx = c.max(axis=1)
    mn = c.min(axis=1)
    d = mx - mn
    s = np.where(mx > 1e-9, d / np.maximum(mx, 1e-9), 0.0)
    r, g, b = c[:, 0], c[:, 1], c[:, 2]
    h = np.zeros(len(c))
    m = (mx == r) & (d > 0)
    h[m] = (((g[m] - b[m]) / d[m]) % 6)
    m = (mx == g) & (d > 0)
    h[m] = ((b[m] - r[m]) / d[m]) + 2
    m = (mx == b) & (d > 0)
    h[m] = ((r[m] - g[m]) / d[m]) + 4
    h = h * 60.0
    v = mx
    return h, s, v


def region_metrics(img_path):
    """leader 口径固定区域指标。"""
    arr = np.asarray(Image.open(img_path).convert("RGB")).astype(np.float64)
    reg = arr[RY0:RY1, RX0:RX1].reshape(-1, 3)
    mean = float(reg.mean())
    h, s, v = rgb2hsv_arr(reg)
    nearWhite = float((reg.mean(axis=1) > NEAR_WHITE_TH).mean())
    med = np.median(reg, axis=0)
    mh, ms, mv = rgb2hsv_arr(med.reshape(1, 3))
    return {
        "mean": round(mean, 1),
        "meanSat": round(float(s.mean()), 3),
        "nearWhitePct": round(nearWhite * 100, 2),
        "medRGB": [round(float(c), 1) for c in med],
        "medHSV": [round(float(mh[0]), 1), round(float(ms[0]), 3), round(float(mv[0]), 3)],
    }


def mask_med(iso_path, empty_path):
    """掩膜口径：|iso−empty| 差分 >30 → 中值滤波，掩膜内中位色。"""
    if not (os.path.exists(iso_path) and os.path.exists(empty_path)):
        return None
    iso = np.asarray(Image.open(iso_path).convert("RGB")).astype(np.int32)
    empty = np.asarray(Image.open(empty_path).convert("RGB")).astype(np.int32)
    if iso.shape != empty.shape:
        return None
    diff = np.abs(iso - empty).sum(axis=2)
    raw = diff > DIFF_TH
    mimg = Image.fromarray((raw * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(MEDIAN_K))
    mask = np.asarray(mimg) > 127
    ys, xs = np.where(mask)
    if len(xs) < 400:
        return None
    pix = iso[ys, xs].astype(np.float64)
    med = np.median(pix, axis=0)
    mh, ms, mv = rgb2hsv_arr(med.reshape(1, 3))
    return {"medRGB": [round(float(c), 1) for c in med],
            "medHSV": [round(float(mh[0]), 1), round(float(ms[0]), 3), round(float(mv[0]), 3)],
            "areaPx": int(len(xs))}


def hue_delta(h1, h2):
    d = abs(h1 - h2) % 360.0
    return min(d, 360.0 - d)


def main():
    rows = []
    for idx in sorted(TARGETS):
        short, name, leaderBase = TARGETS[idx]
        i2 = "%02d" % idx
        new_main = os.path.join(EV, "v3-tint2-%s-%s.png" % (i2, short))
        old_main = os.path.join(EV, "v3-roster-%s-%s.png" % (i2, short))
        for p in (new_main, old_main):
            if not os.path.exists(p):
                raise SystemExit("缺少帧: " + p)

        reg_new = region_metrics(new_main)
        reg_old = region_metrics(old_main)

        mask_new = mask_med(os.path.join(EV, "v3-tint2-iso-%s.png" % i2),
                            os.path.join(EV, "v3-tint2-iso-empty-%s.png" % i2))
        mask_old = mask_med(os.path.join(EV, "v3-roster-iso-%s.png" % i2),
                            os.path.join(EV, "v3-roster-iso-empty-%s.png" % i2))

        row = {"idx": idx, "id": short, "name": name, "leaderBase": leaderBase or None,
               "regionNew": reg_new, "regionOld": reg_old,
               "maskNew": mask_new, "maskOld": mask_old}

        # 判据（固定区域主口径）
        dMean = round(reg_new["mean"] - reg_old["mean"], 1)
        ratioSat = round(reg_new["meanSat"] / reg_old["meanSat"], 3) if reg_old["meanSat"] > 0 else None
        row["dMean"] = dMean
        row["satRatioNewVsOld"] = ratioSat
        row["grade"] = {
            "meanDelta<15": "通过" if abs(dMean) < 15 else "不达标",
            "nearWhite<2%": "通过" if reg_new["nearWhitePct"] < 2 else "不达标",
            "meanSat±20%": ("通过" if ratioSat is not None and 0.8 <= ratioSat <= 1.2 else "不达标"),
        }
        if mask_new and mask_old:
            hd = round(hue_delta(mask_new["medHSV"][0], mask_old["medHSV"][0]), 1)
            row["maskHueDeltaNewVsOld"] = hd
            row["grade"]["maskHue<8"] = "通过" if hd < 8 else "不达标"
        rows.append(row)
        print("%-2d %-8s mean %s→%s(Δ%+.1f) sat %.3f→%.3f(×%s) nearWhite %.2f%%→%.2f%% | %s"
              % (idx, name, reg_old["mean"], reg_new["mean"], dMean,
                 reg_old["meanSat"], reg_new["meanSat"], row["satRatioNewVsOld"],
                 reg_old["nearWhitePct"], reg_new["nearWhitePct"],
                 " ".join("%s=%s" % (k, v) for k, v in row["grade"].items())
                 + (" maskHueΔ=%s°" % row["maskHueDeltaNewVsOld"] if "maskHueDeltaNewVsOld" in row else "")))

    payload = {
        "criteria": {
            "region": "leader 仲裁区域 x780-1240 / y640-1180（2000×1250）",
            "nearWhite": "min(R,G,B)>240 占比 <2%",
            "mean": "|新 − roster 基线| <15",
            "meanSat": "新 / roster 基线 ∈ [0.8, 1.2]",
            "maskHue": "掩膜中位色 hueΔ(新 vs roster) <8° = 回到原色",
        },
        "note": "撤销重染复验：COLOR_OVERRIDE 置空后渲染应回到 roster 基线观感",
        "rows": rows,
    }
    with open(OUT_JSON, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    print("[json] " + OUT_JSON)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())