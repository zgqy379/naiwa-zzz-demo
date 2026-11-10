# -*- coding: utf-8 -*-
"""
族谱三只（奶猫/奶鱼/奶粉）本体中位色采样（task id=24 返工 A 步）。

数据源：docs/reference-art/奶蛙族谱全景_铭牌校正.png（3840×1920）
bbox 来源：analyzeImage 全景定位 + 裁剪精读（名牌逐字确认：奶猫/奶鱼/奶粉，
猫耳/鳍/圆润站姿特征匹配，两次独立调用一致）。

口径（leader 返工指令）：
  - 排除名牌白底：RGB 三通道差 <15 且 lum>200
  - 排除背景：与裁剪区四角背景中位色欧氏距离 <40
  - 主体像素：余下全部像素取中位数（灰猫饱和度天然低，不做高饱和过滤，
    另附 S 分布上下分位供参考）
输出：docs/evidence/tint2-ref-sample-20261110.json + 控制台表

用法：python -X utf8 scripts/sample-ref-tint.py
"""
import json
import colorsys
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, "docs", "reference-art", "奶蛙族谱全景_铭牌校正.png")
OUT_JSON = os.path.join(ROOT, "docs", "evidence", "tint2-ref-sample-20261110.json")

# analyzeImage 定位 bbox（全景 3840×1920），向外扩 12% 容差
TARGETS = {
    "naimao": {"name": "奶猫", "bbox": (2960, 820, 3180, 1060)},
    "naiyu":  {"name": "奶鱼", "bbox": (420, 1180, 680, 1420)},
    "naifen": {"name": "奶粉", "bbox": (2460, 820, 2660, 1060)},
}
BG_DIST = 40          # 与背景中位色的欧氏距离阈值
WHITE_TH = 15         # 名牌白：三通道差阈值
WHITE_LUM = 200       # 名牌白：亮度阈值


def rgb2hsv(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    return h * 360.0, s, v


def main():
    img = np.asarray(Image.open(REF).convert("RGB")).astype(np.int32)
    rows = []
    for key, t in TARGETS.items():
        x0, y0, x1, y1 = t["bbox"]
        m = int((x1 - x0) * 0.12), int((y1 - y0) * 0.12)
        cx0, cy0, cx1, cy1 = max(0, x0 - m[0]), max(0, y0 - m[1]), min(img.shape[1], x1 + m[0]), min(img.shape[0], y1 + m[1])
        crop = img[cy0:cy1, cx0:cx1]
        h, w = crop.shape[:2]

        # 背景色：四角 16×16 块中位
        corners = np.concatenate([
            crop[:16, :16].reshape(-1, 3), crop[:16, -16:].reshape(-1, 3),
            crop[-16:, :16].reshape(-1, 3), crop[-16:, -16:].reshape(-1, 3),
        ])
        bg = np.median(corners, axis=0)

        flat = crop.reshape(-1, 3).astype(np.float64)
        lum = flat.mean(axis=1)
        chDiff = flat.max(axis=1) - flat.min(axis=1)
        distBg = np.sqrt(((flat - bg) ** 2).sum(axis=1))

        mask = (distBg >= BG_DIST) & ~((chDiff < WHITE_TH) & (lum > WHITE_LUM))
        pix = flat[mask]
        if len(pix) < 200:
            rows.append({"key": key, "error": "主体像素过少(%d)" % len(pix), "bg": bg.tolist()})
            print("%s ERROR 主体像素过少 %d" % (key, len(pix)))
            continue
        med = np.median(pix, axis=0)
        hsv = np.array([rgb2hsv(*p) for p in pix[:: max(1, len(pix) // 8000)]])
        row = {
            "key": key, "name": t["name"], "bbox": [x0, y0, x1, y1], "crop": [int(cx0), int(cy0), int(cx1), int(cy1)],
            "bgRGB": [round(float(c), 1) for c in bg],
            "nTotal": int(flat.shape[0]), "nBody": int(len(pix)), "bodyFrac": round(len(pix) / flat.shape[0], 3),
            "medRGB": [round(float(c), 1) for c in med],
            "medHex": "#%02X%02X%02X" % tuple(int(round(c)) for c in med),
            "medHSV": [round(float(v), 1) for v in [np.median(hsv[:, 0]) * 1, np.median(hsv[:, 1]), np.median(hsv[:, 2])]],
            "satP25": round(float(np.percentile(hsv[:, 1], 25)), 3),
            "satP75": round(float(np.percentile(hsv[:, 1], 75)), 3),
            "hueP25": round(float(np.percentile(hsv[:, 0], 25)), 1),
            "hueP75": round(float(np.percentile(hsv[:, 0], 75)), 1),
        }
        rows.append(row)
        print("%-6s %-4s med=%s %s body=%d/%d bg=%s hueP25-75=%.0f-%.0f satP25-75=%.2f-%.2f"
              % (key, t["name"], row["medHex"], row["medHSV"], len(pix), flat.shape[0],
                 row["bgRGB"], row["hueP25"], row["hueP75"], row["satP25"], row["satP75"]))

    with open(OUT_JSON, "w", encoding="utf-8") as fh:
        json.dump({"source": os.path.basename(REF), "criteria": {
            "bgDist": BG_DIST, "whiteChDiff": WHITE_TH, "whiteLum": WHITE_LUM,
        }, "rows": rows}, fh, ensure_ascii=False, indent=2)
    print("[json] " + OUT_JSON)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())