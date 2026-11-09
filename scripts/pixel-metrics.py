# -*- coding: utf-8 -*-
"""
只读像素曝光度量：复算与对照截图用同一口径。

口径（与 docs/evidence/show-layer-status-20261109.md 的 0.41%/0.07%/110-112.5 对齐）：
  nearWhite = RGB 三通道全部 > 240 的像素占全图比例
  blown     = RGB 三通道全部 > 250 的像素占全图比例
  mean      = 全图 RGB 均值（同时给 Rec.709 亮度均值作参考）

用法： python -X utf8 scripts/pixel-metrics.py <png...>
"""
import os
import sys

import numpy as np
from PIL import Image


def metrics(path):
    im = np.asarray(Image.open(path).convert("RGB")).astype(np.float64)
    gray = im.mean(axis=2)  # 通道算术均值：与基线 0.41% / 0.07% 口径一致（已用 v3-show3 主图反推验证）
    return {
        "file": os.path.basename(path),
        "shape": list(im.shape),
        "rgbMean": round(float(im.mean()), 2),
        "grayMean": round(float(gray.mean()), 2),
        "nearWhite240": round(float((gray > 240).mean() * 100), 2),
        "blown250": round(float((gray > 250).mean() * 100), 2),
        "allChannel240": round(float((im > 240).all(axis=2).mean() * 100), 2),
        "anyChannel240": round(float((im.max(axis=2) > 240).mean() * 100), 2),
        "uniqueColors": int(len(np.unique(im.reshape(-1, 3), axis=0))),
    }


if __name__ == "__main__":
    for p in sys.argv[1:]:
        m = metrics(p)
        print(
            "%s  %dx%d  rgbMean=%s  grayMean=%s  nearWhite(gray>240)=%s%%  blown(gray>250)=%s%%  allCh>240=%s%%  anyCh>240=%s%%  uniqueColors=%d"
            % (m["file"], m["shape"][1], m["shape"][0], m["rgbMean"], m["grayMean"],
               m["nearWhite240"], m["blown250"], m["allChannel240"], m["anyChannel240"], m["uniqueColors"])
        )