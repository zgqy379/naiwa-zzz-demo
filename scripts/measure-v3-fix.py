# -*- coding: utf-8 -*-
"""
角色区像素客观指标（只读）：给「uKeyDir 修复后角色是否真的渲染出来」提供可复算的判据。

口径（本任务的验收线，任务书 §2.4）：
  区域  x∈[780,1240]  y∈[640,1180]（2000x1250 画布，坐标系左上原点，右开区间）
  meanLuma      = 区域像素 Rec.709 亮度均值：0.2126R + 0.7152G + 0.0722B
  meanSat       = 区域像素 HSV 饱和度均值：max(ch)/255（max(ch)=0 的纯黑像素按 0 计）
  yellowFrac    = 区域内「黄色系」像素占比：R>110 且 G>95 且 B<0.75*min(R,G) 且 饱和度>0.25
                  （奶蛙角色主色为暖黄，用于佐证「不是暗色块」）
  warmFrac      = 区域内暖色（R>G>B 且 R>90）占比，作为次口径佐证

判据：meanLuma >= 100 且 meanSat >= 0.25

用法：
  python -X utf8 scripts/measure-v3-fix.py --region 780,640,1240,1180 a.png b.png ...
  python -X utf8 scripts/measure-v3-fix.py --region 780,640,1240,1180 --json out.json a.png
"""
import json
from pathlib import Path
import os
import sys

import numpy as np
from PIL import Image

DEFAULT_REGION = (780, 640, 1240, 1180)


def parse_region(text):
    if not text:
        return DEFAULT_REGION
    parts = [int(x) for x in text.split(",")]
    if len(parts) != 4:
        raise SystemExit("--region 需要 x0,y0,x1,y1")
    return tuple(parts)


def measure(path, region):
    im = Image.open(path).convert("RGB")
    arr = np.asarray(im).astype(np.float64)
    h, w = arr.shape[:2]
    x0, y0, x1, y1 = region
    # 区域裁剪：越界即视为用法错误（不静默改口径）
    if not (0 <= x0 < x1 <= w and 0 <= y0 < y1 <= h):
        raise SystemExit("%s 尺寸 %dx%d 不包含区域 %s" % (os.path.basename(path), w, h, region))
    roi = arr[y0:y1, x0:x1]
    r, g, b = roi[..., 0], roi[..., 1], roi[..., 2]

    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    mx = roi.max(axis=2)
    sat = np.where(mx > 0, (mx - roi.min(axis=2)) / np.maximum(mx, 1.0), 0.0)

    yellow = (r > 110) & (g > 95) & (b < 0.75 * np.minimum(r, g)) & (sat > 0.25)
    warm = (r > g) & (g > b) & (r > 90)

    return {
        "file": os.path.basename(path),
        "image": [w, h],
        "region": [x0, y0, x1, y1],
        "meanLuma": round(float(luma.mean()), 2),
        "meanSat": round(float(sat.mean()), 4),
        "meanRGB": [round(float(r.mean()), 1), round(float(g.mean()), 1), round(float(b.mean()), 1)],
        "yellowFrac": round(float(yellow.mean()), 4),
        "warmFrac": round(float(warm.mean()), 4),
        "maxLuma": round(float(luma.max()), 1),
        "passLuma": bool(luma.mean() >= 100.0),
        "passSat": bool(sat.mean() >= 0.25),
        "pass": bool(luma.mean() >= 100.0 and sat.mean() >= 0.25),
    }


def main(argv):
    region = DEFAULT_REGION
    json_out = None
    files = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--region":
            region = parse_region(argv[i + 1])
            i += 2
        elif a == "--json":
            json_out = argv[i + 1]
            i += 2
        else:
            files.append(a)
            i += 1
    if not files:
        raise SystemExit("缺少 png 参数")
    rows = [measure(f, region) for f in files]
    payload = {"region": list(region), "criteria": {"meanLuma>=": 100, "meanSat>=": 0.25}, "files": rows}
    for m in rows:
        print(
            "%-52s meanLuma=%7.2f  meanSat=%.4f  meanRGB=%s  yellow=%.2f%%  warm=%.2f%%  pass=%s"
            % (m["file"], m["meanLuma"], m["meanSat"], m["meanRGB"],
               m["yellowFrac"] * 100, m["warmFrac"] * 100, m["pass"])
        )
    if json_out:
        Path(json_out).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print("[json] " + json_out)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))