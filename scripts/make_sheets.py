# -*- coding: utf-8 -*-
"""把 6 张 19k 截图拼成 family sheet / closeup sheet（标签取 HUD 读数 + GLB 几何指标）。"""
import json
import os
import struct
from PIL import Image, ImageDraw, ImageFont

EV = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "evidence")
EV = os.path.normpath(EV)
META = json.load(open(os.path.join(EV, "v3-20k-metrics-20261109.json"), encoding="utf-8"))

ORDER = [
    ("v3-20k-00-naiwa-20261109.png", "naiwa_laugh_g1"),
    ("v3-20k-01-naishu-20261109.png", "naiwa_nashu"),
    ("v3-20k-02-naifen-20261109.png", "naiwa_naifen"),
    ("v3-20k-03-naimao-20261109.png", "naiwa_naimao"),
    ("v3-20k-04-naishi-20261109.png", "naiwa_naishi"),
    ("v3-20k-05-xigema-20261109.png", "naiwa_xigema"),
]

FONT_PATHS = ["C:/Windows/Fonts/msyhbd.ttc", "C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/simhei.ttf"]
FONT = None
for fp in FONT_PATHS:
    if os.path.exists(fp):
        FONT = ImageFont.truetype(fp, 26)
        FONT_S = ImageFont.truetype(fp, 22)
        break
assert FONT, "no CJK font"


def read_glb(path):
    b = open(path, "rb").read()
    off, j = 12, None
    while off < len(b):
        ln, ty = struct.unpack_from("<II", b, off)
        if ty == 0x4E4F534A:
            j = json.loads(b[off + 8:off + 8 + ln].decode("utf-8"))
        off += 8 + ln + ((4 - ln % 4) % 4)
    return j, len(b)


def glb_metrics(name):
    j, size = read_glb(os.path.join(EV, "..", "..", "public", "asset", name + "_runtime.glb"))
    node = (j.get("nodes") or [{}])[0]
    scale = (node.get("scale") or [1, 1, 1])[0]
    verts = tris = 0
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for m in j.get("meshes", []):
        for p in m.get("primitives", []):
            a = j["accessors"][p["attributes"]["POSITION"]]
            verts += a["count"]
            n = j["accessors"][p["indices"]]["count"] if p.get("indices") is not None else a["count"]
            tris += n // 3
            if a.get("min") and a.get("max"):
                for k in range(3):
                    mn[k] = min(mn[k], a["min"][k])
                    mx[k] = max(mx[k], a["max"][k])
    ext = [(mx[k] - mn[k]) / 32767.0 * scale for k in range(3)]
    my = max(ext) or 1
    return {
        "verts": verts, "tris": tris, "kb": round(size / 1024),
        "bbox": " × ".join(f"{v / my:.2f}" for v in ext),
    }


shots = {s["file"]: s for s in META["shots"]}
cells = []
for f, glb in ORDER:
    s = shots[f]
    h = s["hudBefore"]
    cells.append({"file": f, "hud": h, "m": glb_metrics(glb)})


def sheet(images, out, cols, rows, cell, label_h, titles, font, font_small=None):
    W = cols * cell[0]
    H = rows * (cell[1] + label_h)
    canvas = Image.new("RGB", (W, H), (10, 10, 14))
    d = ImageDraw.Draw(canvas)
    for i, im in enumerate(images):
        cx, cy = i % cols, i // cols
        x, y = cx * cell[0], cy * (cell[1] + label_h)
        canvas.paste(im, (x, y + label_h))
        d.rectangle([x, y, x + cell[0] - 1, y + label_h - 1], fill=(18, 18, 24))
        d.rectangle([x, y, x + cell[0] - 1, y + label_h - 1], outline=(245, 197, 66), width=2)
        d.text((x + 10, y + (label_h - 26) // 2 - 2), titles[i], fill=(235, 235, 245), font=font)
        d.rectangle([x, y + label_h + cell[1] - 1, x + cell[0] - 1, y + label_h + cell[1] - 1], fill=(40, 40, 50))
    canvas.save(out)


# ---- family sheet：整帧 1000×625，标签 = HUD 读数 + tri/KB ----
full = []
titles = []
for c in cells:
    im = Image.open(os.path.join(EV, c["file"])).convert("RGB")
    assert im.size == (2000, 1250), im.size
    full.append(im.resize((1000, 625), Image.LANCZOS))
    titles.append(f"{c['hud']['hudName']} {c['hud']['hudIdx']} · {c['m']['tris']:,} tri · {c['m']['kb']}KB")
sheet(full, os.path.join(EV, "v3-20k-family-sheet-20261109.png"), 3, 2, (1000, 625), 40, titles, FONT)

# ---- closeup sheet：中心 420×420 CSS @1.25dpr → 525px，再 ×2 放大到 1050 ----
CX, CY, CS = 800, 554, 420  # CSS
dpr = 1.25
left, top = round((CX - CS / 2) * dpr), round((CY - CS / 2) * dpr)
side = round(CS * dpr)
crops = []
ctitles = []
for c in cells:
    im = Image.open(os.path.join(EV, c["file"])).convert("RGB")
    crop = im.crop((left, top, left + side, top + side)).resize((1050, 1050), Image.LANCZOS)
    crops.append(crop)
    ctitles.append(f"{c['hud']['hudName']} {c['hud']['hudIdx']} · verts {c['m']['verts']:,} · bbox {c['m']['bbox']}")
sheet(crops, os.path.join(EV, "v3-20k-closeup-sheet-20261109.png"), 3, 2, (1050, 1050), 40, ctitles, FONT)

for c in cells:
    print(c["file"], c["hud"]["hudName"], c["hud"]["hudIdx"], c["m"])
print("crop px rect:", (left, top, left + side, top + side))