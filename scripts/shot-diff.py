# -*- coding: utf-8 -*-
"""
两张同机位截图的 A/B 像素差分 —— 用于**证明**某个图层在画面里真的可见。

用法：python -X utf8 scripts/shot-diff.py <A.png> <B.png> [说明]
输出：差异像素占比、平均差值、最大差值，以及差异区域的包围盒（相对坐标）。

口径：
  diff = 每像素三通道绝对差的最大值
  changed = diff > 8（8/255 ≈ 3%，低于此视为压缩噪声）
"""
import json
import sys

import numpy as np
from PIL import Image


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    a_path, b_path = sys.argv[1], sys.argv[2]
    label = sys.argv[3] if len(sys.argv) > 3 else ""

    a = np.asarray(Image.open(a_path).convert("RGB")).astype(np.int16)
    b = np.asarray(Image.open(b_path).convert("RGB")).astype(np.int16)
    if a.shape != b.shape:
        print(json.dumps({"error": "尺寸不一致", "a": list(a.shape), "b": list(b.shape)}, ensure_ascii=False))
        sys.exit(1)

    d = np.abs(a - b).max(axis=2)
    changed = d > 8
    total = d.size
    ys, xs = np.nonzero(changed)
    box = None
    if len(xs):
        h, w = changed.shape
        box = {
            "x0": round(float(xs.min()) / w, 4), "x1": round(float(xs.max()) / w, 4),
            "y0": round(float(ys.min()) / h, 4), "y1": round(float(ys.max()) / h, 4),
        }
    out = {
        "label": label,
        "a": a_path, "b": b_path,
        "shape": [int(a.shape[1]), int(a.shape[0])],
        "changedPixels": int(changed.sum()),
        "changedRatioPct": round(float(changed.sum()) / total * 100, 3),
        "meanDiff": round(float(d.mean()), 3),
        "maxDiff": int(d.max()),
        "changedBox": box,
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
