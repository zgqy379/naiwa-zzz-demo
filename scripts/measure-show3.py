# -*- coding: utf-8 -*-
"""
展示层三轮度量（只读，不修改任何截图产物）：

  1) 脚底 vs HUD 客观判据
     - hudTop 来自 DOM `getBoundingClientRect()`（capture-show3.mjs 写入 v3-show3-metrics.json 的
       hudBefore.hudKeysRect.topCanvas，已由 CSS px × canvas.height/innerHeight 换算到 2000×1250 画布坐标）
     - footY / topY 来自 iso 帧 − iso-empty 帧差分掩膜（diff>12）的最低 / 最高行
     - 判据：footY < hudTop - 6 且 topY > 0，6 只全部满足才算通过
  2) 角色本体占屏高（与二轮同口径）：(iso − iso_empty) diff>12 ∩ lum(iso)>55 的 bbox 高度 ÷ 1250
  3) 剪影 IoU 两套口径（fixed 全幅 / shape bbox 归一化），15 对，要求全部 < 0.90
  4) 拼 v3-show3-family-sheet-20261109.png（3×2）与 v3-show3-foot-diagnostic.png
     （6 行 × 底部 y=1140–1250 裁剪放大，主图 + iso 帧各一列，并画 HUD 顶边红线）

输入：docs/evidence/v3-show3-{00..05}-*.png / -bg-0X / -clean-0X / -iso-0X / -iso-empty-0X
      docs/evidence/v3-show3-metrics.json
输出：docs/evidence/v3-show3-iou.json、v3-show3-pixel-metrics.json、v3-show3-foot-check.json
      docs/evidence/v3-show3-family-sheet-20261109.png
      docs/evidence/v3-show3-foot-diagnostic.png
用法：python -X utf8 scripts/measure-show3.py
"""
import json
import os
import datetime
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EV = os.path.join(ROOT, "docs", "evidence")
H, W = 1250, 2000  # canvas 2000×1250（viewport 1600×1000 × dpr 1.25）

# 正确对照表（本任务给定；不要用 v3-show2-metrics.json 里错位的 prevBodyHeightPct）
SHOTS = [
    # tag, key(英文标签), 主图文件, 第一轮%, 第二轮%, 期望中文名
    ("00", "naiwa",   "v3-show3-00-naiwa-20261109.png",   27.6, 36.24, "奶蛙"),
    ("01", "naifen",  "v3-show3-01-naifen-20261109.png",  26.2, 35.44, "奶粉"),
    ("02", "naimao",  "v3-show3-02-naimao-20261109.png",  31.0, 38.40, "奶猫"),
    ("03", "naishi",  "v3-show3-03-naishi-20261109.png",  28.9, 36.64, "奶屎"),
    ("04", "naiyu",   "v3-show3-04-naiyu-20261109.png",   17.5, 29.44, "奶鱼"),
    ("05", "xigema",  "v3-show3-05-xigema-20261109.png",  25.8, 33.76, "西格玛"),
]
FOOT_CROP_Y0, FOOT_CROP_Y1 = 1140, 1250  # 任务指定诊断裁剪带


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


def get_font(size):
    for p in ("C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeui.ttf"):
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    try:
        return ImageFont.load_default(size=size)
    except Exception:
        return ImageFont.load_default()


def load_metrics():
    with open(os.path.join(EV, "v3-show3-metrics.json"), "r", encoding="utf-8") as f:
        return json.load(f)


def make_family_sheet(rows):
    """3×2 主图拼版，供视觉复核。"""
    cell_w, cell_h = 640, 400
    label_h = 30
    gap = 8
    sheet = Image.new("RGB", (3 * cell_w + 4 * gap, 2 * (cell_h + label_h) + 3 * gap), (22, 22, 28))
    draw = ImageDraw.Draw(sheet)
    font = get_font(20)
    for i, r in enumerate(rows):
        col, row = i % 3, i // 3
        x = gap + col * (cell_w + gap)
        y = gap + row * (cell_h + label_h + gap)
        im = Image.open(os.path.join(EV, r["file"])).convert("RGB").resize((cell_w, cell_h), Image.LANCZOS)
        sheet.paste(im, (x, y))
        label = "%s %s  #%d  body=%s%%" % (r["tag"], r["key"], r["expectIndex"], r["bodyHeightPct"])
        draw.text((x + 4, y + cell_h + 4), label, fill=(232, 232, 240), font=font)
    out = os.path.join(EV, "v3-show3-family-sheet-20261109.png")
    sheet.save(out)
    return out


def make_foot_diagnostic(rows):
    """
    6 行 × 底部 y=1140–1250 裁剪放大。
    每行：左 = 主图裁剪（含 HUD 按键条），右 = iso 隔离帧裁剪（无 HUD，只有角色），
    两列都画同一条红色 HUD 顶边线（hudTopCanvas）；脚底 footY 若落在带内则画绿线。
    左侧标签给出 footY / topY / hudTop / 判据结果，避免目视误读。
    """
    band_h = FOOT_CROP_Y1 - FOOT_CROP_Y0
    col_w = 900
    scale = col_w / W                      # 2000 → 900
    crop_h = int(round(band_h * scale))    # 110 * 0.45 = 50
    row_h = 96
    label_w = 300
    left_pad = 8
    gap = 10
    margin = 8
    head_h = 46
    canvas_w = margin + label_w + col_w + gap + col_w + margin
    canvas_h = margin + head_h + len(rows) * row_h + margin
    diag = Image.new("RGB", (canvas_w, canvas_h), (18, 18, 24))
    draw = ImageDraw.Draw(diag)
    font = get_font(18)
    font_small = get_font(14)
    title = "v3-show3 foot diagnostic | band y=%d-%d (canvas %dx%d) | red = HUD keys top (DOM rect -> canvas)" % (
        FOOT_CROP_Y0, FOOT_CROP_Y1, W, H)
    draw.text((margin, margin), title, fill=(240, 220, 120), font=font_small)
    x0 = margin
    x1 = margin + label_w
    x2 = x1 + col_w + gap
    draw.text((x1, margin + 24), "MAIN (with HUD)", fill=(200, 200, 210), font=font_small)
    draw.text((x2, margin + 24), "ISO frame (no HUD)", fill=(200, 200, 210), font=font_small)
    y = margin + head_h
    for r in rows:
        main_im = Image.open(os.path.join(EV, r["file"])).convert("RGB")
        iso_im = Image.open(os.path.join(EV, r["isoFile"])).convert("RGB")
        mc = main_im.crop((0, FOOT_CROP_Y0, W, FOOT_CROP_Y1)).resize((col_w, crop_h), Image.LANCZOS)
        ic = iso_im.crop((0, FOOT_CROP_Y0, W, FOOT_CROP_Y1)).resize((col_w, crop_h), Image.LANCZOS)
        img_y = y + (row_h - crop_h) // 2
        diag.paste(mc, (x1, img_y))
        diag.paste(ic, (x2, img_y))
        # HUD 顶边红线：hudTop 在 1140–1250 带内的相对位置
        hud_top = r["hudTopCanvas"]
        line_y = img_y + int(round((hud_top - FOOT_CROP_Y0) * scale))
        if img_y <= line_y <= img_y + crop_h:
            draw.line([(x1, line_y), (x1 + col_w, line_y)], fill=(255, 48, 48), width=2)
            draw.line([(x2, line_y), (x2 + col_w, line_y)], fill=(255, 48, 48), width=2)
            draw.text((x2 + col_w - 150, line_y - 16), "HUD top", fill=(255, 120, 120), font=font_small)
        # 脚底线（footY）：只有落在带内才画得到
        foot_y = img_y + int(round((r["footY"] - FOOT_CROP_Y0) * scale))
        if img_y <= foot_y <= img_y + crop_h:
            draw.line([(x1, foot_y), (x1 + col_w, foot_y)], fill=(80, 230, 140), width=1)
            draw.line([(x2, foot_y), (x2 + col_w, foot_y)], fill=(80, 230, 140), width=1)
        verdict = "PASS" if r["footPass"] else "FAIL"
        color = (120, 240, 150) if r["footPass"] else (255, 90, 90)
        draw.text((x0, y), "%s %s" % (r["tag"], r["key"]), fill=(232, 232, 240), font=font)
        draw.text((x0, y + 24), "footY=%d  topY=%d" % (r["footY"], r["topY"]), fill=(200, 200, 210), font=font_small)
        draw.text((x0, y + 42), "hudTop=%.1f  margin=%+.1f" % (hud_top, r["footMarginPx"]),
                  fill=(200, 200, 210), font=font_small)
        band_note = "foot in band" if FOOT_CROP_Y0 <= r["footY"] <= FOOT_CROP_Y1 else "foot above band"
        draw.text((x0, y + 60), band_note, fill=(150, 150, 165), font=font_small)
        draw.text((x0, y + 76), verdict, fill=color, font=font)
        draw.line([(margin, y + row_h - 2), (canvas_w - margin, y + row_h - 2)], fill=(48, 48, 60), width=1)
        y += row_h
    out = os.path.join(EV, "v3-show3-foot-diagnostic.png")
    diag.save(out)
    return out


def main():
    metrics = load_metrics()
    shots_meta = {s["file"]: s for s in metrics.get("shots", [])}

    data, rows = {}, []
    for tag, key, fname, prev1, prev2, label in SHOTS:
        main_arr, size = load_rgb(fname)
        assert size[0] == W and size[1] == H, (key, "尺寸异常", size)
        clean, _ = load_rgb("v3-show3-clean-%s.png" % tag)
        bg, _ = load_rgb("v3-show3-bg-%s.png" % tag)
        iso, _ = load_rgb("v3-show3-iso-%s.png" % tag)
        iso_empty, _ = load_rgb("v3-show3-iso-empty-%s.png" % tag)

        li = lum(iso)
        d_iso = np.max(np.abs(iso - iso_empty), axis=2)
        sil = d_iso > 12
        body = sil & (li > 55)                       # 主口径：隔离帧差分 ∩ 亮部（无地面阴影）
        ld = np.max(np.abs(clean - bg), axis=2)
        scene = ld > 12                              # 辅助：完整场景差分（关 bloom 冻结帧）
        lc = lum(clean)
        scene_body = scene & (lc > 55)
        shadow = scene & (lc <= 55)
        bb_sil, bb_body = bbox_of(sil), bbox_of(body)
        bb_scene, bb_scene_body, bb_shadow = bbox_of(scene), bbox_of(scene_body), bbox_of(shadow)

        # DOM HUD 按键条矩形（capture-show3.mjs 已换算到 canvas px）
        meta = shots_meta.get(fname) or {}
        hud = (meta.get("hudBefore") or {}).get("hudKeysRect") or {}
        hud_top = hud.get("topCanvas")
        hud_bottom = hud.get("bottomCanvas")
        hud_height = hud.get("heightCanvas")
        if hud_top is None:
            raise SystemExit("v3-show3-metrics.json 缺少 %s 的 hudKeysRect.topCanvas" % fname)

        foot_y = bb_sil["y1"] if bb_sil else H
        top_y = bb_sil["y0"] if bb_sil else H
        foot_pass = (foot_y < hud_top - 6) and (top_y > 0)

        rec = {
            "tag": tag, "key": key, "label": label, "file": fname, "expectIndex": meta.get("expectIndex"),
            "prevRound1BodyHeightPct": prev1, "prevRound2BodyHeightPct": prev2,
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
            "hudKeysSelector": (meta.get("hudBefore") or {}).get("hudKeysSelector"),
            "hudKeysRect": hud,
            "hudTopCanvas": hud_top,
            "hudBottomCanvas": hud_bottom,
            "hudHeightCanvas": hud_height,
            "footY": foot_y,
            "topY": top_y,
            "footMarginPx": round(hud_top - foot_y, 2),
            "topMarginPx": top_y,
            "footPass": foot_pass,
            "isoFile": "v3-show3-iso-%s.png" % tag,
            "hudMatch": meta.get("hudMatch"),
            "hudShot": (meta.get("hudBefore") or {}).get("hudName"),
            "activeIndex": (meta.get("hudBefore") or {}).get("activeIndex"),
            "bloomAtMain": (meta.get("hudBefore") or {}).get("bloom"),
        }
        rows.append(rec)
        data[key] = {"fixed": sil, "shape": shape_norm(sil)}

    keys = [k for _, k, _, _, _, _ in SHOTS]
    fixed, shape = [], []
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            a, b = keys[i], keys[j]
            fixed.append(["%s-%s" % (SHOTS[i][0], a), "%s-%s" % (SHOTS[j][0], b),
                          round(iou(data[a]["fixed"], data[b]["fixed"]), 3)])
            shape.append(["%s-%s" % (SHOTS[i][0], a), "%s-%s" % (SHOTS[j][0], b),
                          round(iou(data[a]["shape"], data[b]["shape"]), 3)])

    by_key = {r["key"]: r for r in rows}
    ge30 = [k for k in keys if by_key[k]["bodyHeightPct"] >= 30.0]
    foot_ok = [k for k in keys if by_key[k]["footPass"]]
    max_fixed = max(x[2] for x in fixed)
    max_shape = max(x[2] for x in shape)

    iou_out = {
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "primaryMetric": "body = (iso − iso_empty，diff>12) ∩ lum(iso)>55；隔离帧无地面投影阴影",
        "iouMaskSource": "iso 帧 − iso-empty 帧（纯剪影）",
        "prevSource": "任务给定对照表（第一轮/第二轮），不使用 v3-show2-metrics.json 的 prevBodyHeightPct",
        "fixed": fixed, "shape": shape,
        "maxFixed": max_fixed, "maxShape": max_shape,
        "rows": rows,
        "acceptance": {
            "bodyHeightGe30Count": len(ge30),
            "bodyHeightGe30Keys": ge30,
            "bodyHeightTarget5of6": len(ge30) >= 5,
            "iouAllBelow090": max(max_fixed, max_shape) < 0.90,
        },
    }
    foot_out = {
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "criterion": "footY < hudTopCanvas - 6 且 topY > 0（6 只全部满足）",
        "hudSelector": "#ui .hud-keys",
        "hudRectSource": "v3-show3-metrics.json → shots[].hudBefore.hudKeysRect（getBoundingClientRect）",
        "rows": [{k: r[k] for k in ("tag", "key", "label", "hudKeysSelector", "hudKeysRect",
                                     "hudTopCanvas", "hudBottomCanvas", "hudHeightCanvas",
                                     "footY", "topY", "footMarginPx", "topMarginPx", "footPass")} for r in rows],
        "footPassCount": len(foot_ok),
        "allFootPass": len(foot_ok) == len(keys),
    }

    with open(os.path.join(EV, "v3-show3-iou.json"), "w", encoding="utf-8") as f:
        json.dump(iou_out, f, ensure_ascii=False, indent=1)
    with open(os.path.join(EV, "v3-show3-pixel-metrics.json"), "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    with open(os.path.join(EV, "v3-show3-foot-check.json"), "w", encoding="utf-8") as f:
        json.dump(foot_out, f, ensure_ascii=False, indent=1)

    sheet = make_family_sheet(rows)
    diag = make_foot_diagnostic(rows)

    print("== 脚底 vs HUD 按键条（DOM getBoundingClientRect → canvas px；选择器 %s）==" % foot_out["hudSelector"])
    for k in keys:
        r = by_key[k]
        print("%-6s %-8s hudTop=%7.2f hudH=%5.2f footY=%4d topY=%4d margin=%+7.2f  %s"
              % (r["tag"], r["key"], r["hudTopCanvas"], r["hudHeightCanvas"],
                 r["footY"], r["topY"], r["footMarginPx"], "PASS" if r["footPass"] else "FAIL"))
    print("脚底全部脱离 HUD（含 6px 余量）: %d/6 → %s" % (len(foot_ok), foot_out["allFootPass"]))
    print("== 剪影 IoU（fixed / shape，剪影来源 iso−iso_empty）==")
    for a, b, v in fixed:
        print("fixed %-10s %-10s %.3f" % (a, b, v))
    for a, b, v in shape:
        print("shape %-10s %-10s %.3f" % (a, b, v))
    print("maxFixed=%.3f maxShape=%.3f  (需 <0.90)" % (max_fixed, max_shape))
    print("== 角色本体占屏高（body=iso差分∩lum>55）==")
    for k in keys:
        r = by_key[k]
        print("%-8s body=%6.2f%%  (第一轮 %4.1f%%, 第二轮 %5.2f%%, Δ二轮=%+5.2f)  sil=%6.2f%%  scene=%6.2f%%  shadow=%5.2f%%"
              % (k, r["bodyHeightPct"], r["prevRound1BodyHeightPct"], r["prevRound2BodyHeightPct"],
                 r["bodyHeightPct"] - r["prevRound2BodyHeightPct"], r["silHeightPct"],
                 r["sceneDiffHeightPct"], r["shadowHeightPct"]))
    print("== 验收 ==")
    print("body>=30%%: %d/6 %s  → 5/6 达标=%s" % (len(ge30), ge30, iou_out["acceptance"]["bodyHeightTarget5of6"]))
    print("IoU 全部 <0.90: %s" % iou_out["acceptance"]["iouAllBelow090"])
    print("[out] %s" % sheet)
    print("[out] %s" % diag)


if __name__ == "__main__":
    main()