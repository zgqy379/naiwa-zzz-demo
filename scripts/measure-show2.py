# -*- coding: utf-8 -*-
"""
展示层二轮度量（只读，不修改任何产物）：
  1) 剪影 IoU 两套口径（固定全幅裁剪区 / bbox 归一化 shape），与上一轮 v3-show-iou-new.json 对照
  2) 角色本体占屏高
     - 主口径 body = (iso − iso_empty) ∩ lum>55  → 隔离帧差分，天然无地面投影阴影
     - 对照 sil  = (iso − iso_empty)              → 纯剪影（不筛亮度）
     - 对照 scene = (clean − bg) diff>12          → 完整场景差分（关 bloom、冻结帧）
     - 对照 sceneBody = scene ∩ lum>55            → 任务字面口径；含阴影时 bbox 虚高
  输入：docs/evidence/v3-show2-{00..05}-*.png / -bg-0X / -clean-0X / -iso-0X / -iso-empty-0X
  输出：docs/evidence/v3-show2-iou.json、docs/evidence/v3-show2-pixel-metrics.json
用法：python -X utf8 scripts/measure-show2.py
"""
import json
import os
import datetime
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _repo_path(*parts):
    """把读写路径钉在仓库根内（防路径穿越，Mimosa 合规）。"""
    p = os.path.abspath(os.path.join(ROOT, *parts))
    if os.path.commonpath([p, ROOT]) != ROOT:
        raise SystemExit(f"拒绝仓库根之外的路径：{p}")
    return p


EV = _repo_path("docs", "evidence")

SHOTS = [
    ("00", "naiwa", "v3-show2-00-naiwa-20261109.png", 31.0),
    ("01", "naifen", "v3-show2-01-naifen-20261109.png", 28.9),
    ("02", "naimao", "v3-show2-02-naimao-20261109.png", 27.6),
    ("03", "naishi", "v3-show2-03-naishi-20261109.png", 26.2),
    ("04", "naiyu", "v3-show2-04-naiyu-20261109.png", 17.5),
    ("05", "xigema", "v3-show2-05-xigema-20261109.png", 25.8),
]
H, W = 1250, 2000  # canvas 2000×1250（viewport 1600×1000 × dpr 1.25）


def load_rgb(name):
    im = Image.open(os.path.join(EV, name)).convert("RGB")
    return np.asarray(im, dtype=np.int16), im.size


def lum(a):
    return 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]


def bbox_of(mask):
    ys, xs = np.nonzero(mask)
    if ys.size == 0:
        return None
    return {"x0": int(xs.min()), "x1": int(xs.max()), "y0": int(ys.min()), "y1": int(ys.max()),
            "w": int(xs.max() - xs.min() + 1), "h": int(ys.max() - ys.min() + 1)}


def iou(a, b):
    inter = np.count_nonzero(a & b)
    union = np.count_nonzero(a | b)
    return float(inter) / float(union) if union else 0.0


def shape_norm(mask, size=256):
    bb = bbox_of(mask)
    if not bb:
        return np.zeros((size, size), dtype=bool)
    crop = mask[bb["y0"]:bb["y1"] + 1, bb["x0"]:bb["x1"] + 1]
    img = Image.fromarray((crop.astype(np.uint8) * 255), mode="L").resize((size, size), Image.NEAREST)
    return np.asarray(img) > 127


def pct(px):
    return round(px / H * 100, 2)


def main():
    data, rows = {}, []
    for tag, key, fname, prev in SHOTS:
        main_arr, size = load_rgb(fname)
        assert size[0] == W and size[1] == H, (key, "尺寸异常", size)
        clean, _ = load_rgb("v3-show2-clean-%s.png" % tag)
        bg, _ = load_rgb("v3-show2-bg-%s.png" % tag)
        iso, _ = load_rgb("v3-show2-iso-%s.png" % tag)
        iso_empty, _ = load_rgb("v3-show2-iso-empty-%s.png" % tag)

        li = lum(iso)
        d_iso = np.max(np.abs(iso - iso_empty), axis=2)
        sil = d_iso > 12
        body = sil & (li > 55)                       # 主口径：隔离帧差分 ∩ 亮部（无阴影可剔，等同纯剪影亮部）
        ld = np.max(np.abs(clean - bg), axis=2)
        scene = ld > 12                              # 完整场景差分（关 bloom 冻结帧）
        lc = lum(clean)
        scene_body = scene & (lc > 55)               # 任务字面口径
        # 阴影贡献：完整场景差分里“暗部”像素（lum<=55）的 bbox —— 这些像素主要是地面投影阴影
        shadow = scene & (lc <= 55)
        bb_sil, bb_body = bbox_of(sil), bbox_of(body)
        bb_scene, bb_scene_body, bb_shadow = bbox_of(scene), bbox_of(scene_body), bbox_of(shadow)
        rec = {
            "key": key, "file": fname, "prevBodyHeightPct": prev,
            "bodyHeightPct": pct(bb_body["h"]) if bb_body else 0.0,
            "silHeightPct": pct(bb_sil["h"]) if bb_sil else 0.0,
            "sceneDiffHeightPct": pct(bb_scene["h"]) if bb_scene else 0.0,
            "sceneBodyHeightPct": pct(bb_scene_body["h"]) if bb_scene_body else 0.0,
            "shadowHeightPct": pct(bb_shadow["h"]) if bb_shadow else 0.0,
            "bodyBBox": bb_body, "silBBox": bb_sil, "sceneDiffBBox": bb_scene,
            "bodyMaskPixels": int(np.count_nonzero(body)),
            "silMaskPixels": int(np.count_nonzero(sil)),
            "sceneMaskPixels": int(np.count_nonzero(scene)),
            "shadowMaskPixels": int(np.count_nonzero(shadow)),
        }
        rows.append(rec)
        data[key] = {"fixed": sil, "shape": shape_norm(sil)}

    keys = [k for _, k, _, _ in SHOTS]
    fixed, shape = [], []
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            a, b = keys[i], keys[j]
            fixed.append(["%s-%s" % (SHOTS[i][0], a), "%s-%s" % (SHOTS[j][0], b), round(iou(data[a]["fixed"], data[b]["fixed"]), 3)])
            shape.append(["%s-%s" % (SHOTS[i][0], a), "%s-%s" % (SHOTS[j][0], b), round(iou(data[a]["shape"], data[b]["shape"]), 3)])

    by_key = {r["key"]: r for r in rows}
    ge30 = [k for k in keys if by_key[k]["bodyHeightPct"] >= 30.0]
    out = {
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "primaryMetric": "body = (iso − iso_empty，diff>12) ∩ lum(iso)>55；隔离帧无地面投影阴影",
        "iouMaskSource": "iso 帧 − iso-empty 帧（纯剪影）",
        "fixed": fixed, "shape": shape,
        "maxFixed": max(x[2] for x in fixed),
        "maxShape": max(x[2] for x in shape),
        "rows": rows,
        "acceptance": {
            "bodyHeightGe30Count": len(ge30),
            "bodyHeightGe30Keys": ge30,
            "bodyHeightTarget5of6": len(ge30) >= 5,
            "iouAllBelow090": max(max(x[2] for x in fixed), max(x[2] for x in shape)) < 0.90,
        },
    }
    # 写路径用字面量（本仓库单机约定 E:/naiwa-zzz）；用 pathlib 写 API（等价 open(w)，无路径拼接）
    Path("E:/naiwa-zzz/docs/evidence/v3-show2-iou.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    Path("E:/naiwa-zzz/docs/evidence/v3-show2-pixel-metrics.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")

    print("== 剪影 IoU（fixed / shape，剪影来源 iso−iso_empty）==")
    for a, b, v in fixed:
        print("fixed %-10s %-10s %.3f" % (a, b, v))
    for a, b, v in shape:
        print("shape %-10s %-10s %.3f" % (a, b, v))
    print("maxFixed=%.3f maxShape=%.3f  (需 <0.90)" % (out["maxFixed"], out["maxShape"]))
    print("== 角色本体占屏高（body=iso差分∩lum>55 / sil / scene=完整场景差分 / sceneBody / shadow）==")
    for k in keys:
        r = by_key[k]
        print("%-8s body=%6.2f%% (上一轮 %4.1f%%, Δ%+5.2f)  sil=%6.2f%%  scene=%6.2f%%  sceneBody=%6.2f%%  shadow=%5.2f%%  pxH body=%s"
              % (k, r["bodyHeightPct"], r["prevBodyHeightPct"], r["bodyHeightPct"] - r["prevBodyHeightPct"],
                 r["silHeightPct"], r["sceneDiffHeightPct"], r["sceneBodyHeightPct"], r["shadowHeightPct"],
                 r["bodyBBox"]["h"] if r["bodyBBox"] else None))
    print("== 验收 ==")
    print("body>=30%%: %d/6 %s  → 5/6 达标=%s" % (len(ge30), ge30, out["acceptance"]["bodyHeightTarget5of6"]))
    print("IoU 全部 <0.90: %s" % out["acceptance"]["iouAllBelow090"])
    print("[out] docs/evidence/v3-show2-iou.json + v3-show2-pixel-metrics.json")


if __name__ == "__main__":
    main()