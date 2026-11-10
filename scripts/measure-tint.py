# -*- coding: utf-8 -*-
"""
展示层重染色相/明度复测（v3-tint，task id=23）。

数据源（capture-tint.mjs 产出，2000x1250 canvas）：
  新帧（.tmp-dist-tint 构建，含 USE_TINT_NPR）：
    v3-tint-iso-XX.png            只留角色+灯光、无 DOM、无 bloom 的隔离帧
    v3-tint-iso-empty-XX.png      同状态但角色隐藏的纯背景帧
    v3-tint-iso-tintoff-XX.png    重染 3 只的同帧 uTintMix=0 对照帧（同 GLB 同光照不重染）
  旧帧（roster-audit-20261110，染色前基线，.tmp-dist-roster 构建）：
    v3-roster-iso-XX.png / v3-roster-iso-empty-XX.png
口径（同 measure-roster.py）：
  掩膜 = |iso - empty| 三通道绝对差求和 > 30，再经 5x5 中值滤波去噪
  指标：
    medRGB/medHSV        掩膜内中位色（HSV 按 colorsys 每像素换算后取中位）
    hueDeltaDeg          掩膜中位色相 vs tint 目标色（重染 3 只）或 config color（抽查 2 只）
    maskMeanLuma         掩膜内 0.299R+0.587G+0.114B 均值（0-255）
判据（任务书 §3）：
  1) 重染 3 只 hueΔ vs tint 目标色 < 25°
  2) 抽查 2 只（奶蛙 idx0 / 西格玛 idx15）新旧帧掩膜中位色色相差 < 8°（零漂移）
  3) 重染 3 只 tint on vs tintoff 同帧对照 maskMeanLuma 差 < 15（明度不塌）
  （参考项：roster 旧帧 meanLuma 对照——奶粉 GLB 于 02:22 被外部重导出，主色不变，
    该对照含重导出噪声，以同帧对照为主判据）
输出：docs/evidence/tint-metrics-20261110.json + 控制台表

用法：python -X utf8 scripts/measure-tint.py
"""
import json
import colorsys
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EV = os.path.join(ROOT, "docs", "evidence")
OUT_JSON = os.path.join(EV, "tint-metrics-20261110.json")

DIFF_TH = 30          # 三通道差分和阈值（0–765）
MEDIAN_K = 5          # 掩膜去噪中值核
MIN_AREA = 400        # 低于此面积视为切换/坏帧

# tint 目标色（src/game/squad.mjs COLOR_OVERRIDE）与 config color（squad.mjs FAMILY）
# idx: (id, name, tintTarget(None=未染色角色，用 config color), configColor)
FAMILY = {
    0:  ("shell_naiwa",   "奶蛙",   None,      0xF5C542),
    6:  ("shell_naifen",  "奶粉",   0xF2D8DE,  0xF2D8DE),
    8:  ("shell_naimao",  "奶猫",   0xBFC4CC,  0xBFC4CC),
    12: ("shell_naiyu",   "奶鱼",   0xA8D8EA,  0xA8D8EA),
    15: ("shell_xigema",  "西格玛奶蛙", None,   0x9C7A3C),
}


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
        "maskFrac": round(float(mask.mean()), 5),
    }


def stats_of(iso_path, mask):
    """掩膜内中位 RGB/HSV + meanLuma（用 iso 帧，NPR 无 bloom 口径）。"""
    arr = np.asarray(Image.open(iso_path).convert("RGB"))
    ys, xs = np.where(mask)
    pix = arr[ys, xs].astype(np.float64)
    med = np.median(pix, axis=0)
    hsv = np.array([rgb2hsv(*p) for p in pix[:: max(1, len(pix) // 5000)]])
    med_h = float(np.median(hsv[:, 0]))
    med_s = float(np.median(hsv[:, 1]))
    med_v = float(np.median(hsv[:, 2]))
    luma = pix[:, 0] * 0.299 + pix[:, 1] * 0.587 + pix[:, 2] * 0.114
    return {
        "medRGB": [round(float(c), 1) for c in med],
        "medHSV": [round(med_h, 1), round(med_s, 3), round(med_v, 3)],
        "maskMeanLuma": round(float(luma.mean()), 1),
        "areaPx": int(mask.sum()),
    }


def main():
    rows = []
    for idx in sorted(FAMILY):
        sid, name, tint_color, cfg_color = FAMILY[idx]
        i2 = "%02d" % idx
        new_iso = os.path.join(EV, "v3-tint-iso-%s.png" % i2)
        new_empty = os.path.join(EV, "v3-tint-iso-empty-%s.png" % i2)
        old_iso = os.path.join(EV, "v3-roster-iso-%s.png" % i2)
        old_empty = os.path.join(EV, "v3-roster-iso-empty-%s.png" % i2)
        tintoff_iso = os.path.join(EV, "v3-tint-iso-tintoff-%s.png" % i2)
        for p in (new_iso, new_empty):
            if not os.path.exists(p):
                raise SystemExit("缺少新采集帧: " + p)

        row = {"idx": idx, "id": sid, "name": name,
               "tintTarget": ("#%06X" % tint_color) if tint_color else None,
               "cfgColor": "#%06X" % cfg_color}

        # ---- 新帧（重染后）----
        mask_new, diag_new = mask_of(new_iso, new_empty)
        if mask_new.sum() < MIN_AREA:
            row["error"] = "新帧掩膜过小(<%d px)" % MIN_AREA
            rows.append(row)
            print("%-2d %-6s ERROR 新帧掩膜过小" % (idx, name))
            continue
        st_new = stats_of(new_iso, mask_new)
        target = tint_color if tint_color else cfg_color
        tr, tg, tb = ((target >> 16) & 255, (target >> 8) & 255, target & 255)
        t_h, t_s, t_v = rgb2hsv(tr, tg, tb)
        hue_new_vs_target = hue_delta(st_new["medHSV"][0], t_h)
        row.update({
            "new": st_new,
            "diagNew": diag_new,
            "hueNewVsTarget": round(hue_new_vs_target, 1),
            "targetHSV": [round(t_h, 1), round(t_s, 3), round(t_v, 3)],
        })

        # ---- 同帧明度对照（重染 3 只）：tintoff vs tint on ----
        if tint_color and os.path.exists(tintoff_iso):
            mask_off, diag_off = mask_of(tintoff_iso, new_empty)
            if mask_off.sum() >= MIN_AREA:
                st_off = stats_of(tintoff_iso, mask_off)
                row["tintOff"] = st_off
                row["lumaDeltaOnOff"] = round(st_new["maskMeanLuma"] - st_off["maskMeanLuma"], 1)
                row["hueOffVsTarget"] = round(hue_delta(st_off["medHSV"][0], t_h), 1)
            else:
                row["tintOffError"] = "tintoff 掩膜过小"

        # ---- 旧帧（roster-audit 染色前基线，参考项）----
        if os.path.exists(old_iso) and os.path.exists(old_empty):
            mask_old, diag_old = mask_of(old_iso, old_empty)
            if mask_old.sum() >= MIN_AREA:
                st_old = stats_of(old_iso, mask_old)
                row["old"] = st_old
                # 抽查零漂移判据：新旧帧掩膜中位色互比 hue 差
                row["hueNewVsOld"] = round(hue_delta(st_new["medHSV"][0], st_old["medHSV"][0]), 1)
                row["lumaNewVsOld"] = round(st_new["maskMeanLuma"] - st_old["maskMeanLuma"], 1)
            else:
                row["oldError"] = "旧帧掩膜过小"

        # ---- 判级 ----
        if tint_color:
            row["hueGrade"] = ("还原" if hue_new_vs_target < 25 else ("部分" if hue_new_vs_target <= 45 else "缺失"))
            if "lumaDeltaOnOff" in row:
                row["lumaGrade"] = "通过(<15)" if abs(row["lumaDeltaOnOff"]) < 15 else "不达标(>=15)"
        else:
            hnvo = row.get("hueNewVsOld")
            row["driftGrade"] = ("零漂移通过(<8°)" if hnvo is not None and hnvo < 8 else
                                 ("不达标(>=8°)" if hnvo is not None else "无旧帧可比"))

        rows.append(row)
        extra = ""
        if tint_color:
            extra = (" hueΔ(vs tint)=%.1f° %s lumaΔ(on-off)=%s"
                     % (row["hueNewVsTarget"], row["hueGrade"], row.get("lumaDeltaOnOff")))
        else:
            extra = " 新旧hueΔ=%s° %s" % (row.get("hueNewVsOld"), row.get("driftGrade"))
        print("%-2d %-6s medRGB=%s meanLuma=%s%s" % (idx, name, st_new["medRGB"], st_new["maskMeanLuma"], extra))

    payload = {
        "criteria": {
            "diffTh": DIFF_TH, "medianK": MEDIAN_K,
            "tintHue": "重染 3 只掩膜中位色 vs COLOR_OVERRIDE tint 目标色 hueΔ <25°=还原",
            "drift": "抽查 2 只新旧帧掩膜中位色互比 hueΔ <8°=零漂移",
            "luma": "重染 3 只同帧 uTintMix=1 vs 0 对照掩膜 meanLuma 差 <15=明度不塌",
        },
        "maskMethod": "|iso - isoEmpty| 三通道差分和 > 30 → 5x5 中值滤波（同 measure-roster.py）",
        "rows": rows,
        "familySource": "src/game/squad.mjs COLOR_OVERRIDE / FAMILY（只读对齐）",
    }
    with open(OUT_JSON, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    print("[json] " + OUT_JSON)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())