# -*- coding: utf-8 -*-
"""
GLB 内嵌贴图提取 + 主色统计（只读审计）：回答「资产贴图本身是什么色」，
与渲染帧掩膜中位色对照，区分资产缺陷 vs 展示层（NPR/ACES/光照）染色。

GLB images[].bufferView → BIN chunk 里的 PNG bytes → PIL 解码 →
排除 alpha<32 的透明像素后取中位 RGB（贴图是 1024 或 2048 级全身 UV 展开图，
包含眼/嘴/腮红等小面积高饱和区域；中位数代表主体色）。
另输出分位数（P25/P75）与面积前 5 的量化色簇（粗聚类，供人工复核）。

用法：python -X utf8 scripts/extract-roster-glb-textures.py
输出：docs/evidence/roster-glb-texture-colors-20261110.json + docs/evidence/glb-tex/<name>.png
"""
import json
import os
import struct
import io

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET = os.path.join(ROOT, "public", "asset")
TEXDIR = os.path.join(ROOT, "docs", "evidence", "glb-tex")
OUT = os.path.join(ROOT, "docs", "evidence", "roster-glb-texture-colors-20261110.json")

GLBS = [
    ("奶蛙", "naiwa_laugh_g1_runtime.glb"), ("奶豆", "naiwa_naidou_runtime.glb"),
    ("小奶蛙", "naiwa_xiaonaiwa_runtime.glb"), ("奶蛋", "naiwa_naidan_runtime.glb"),
    ("奶鼠", "naiwa_nashu_runtime.glb"), ("奶狗", "naiwa_naigou_runtime.glb"),
    ("奶粉", "naiwa_naifen_runtime.glb"), ("奶鸡", "naiwa_naiji_runtime.glb"),
    ("奶猫", "naiwa_naimao_runtime.glb"), ("奶屎", "naiwa_naishi_runtime.glb"),
    ("豆奶", "naiwa_dounai_runtime.glb"), ("奶兔", "naiwa_naitu_runtime.glb"),
    ("奶鱼", "naiwa_naiyu_runtime.glb"), ("奶茶", "naiwa_naicha_runtime.glb"),
    ("奶瓶", "naiwa_naiping_runtime.glb"), ("西格玛奶蛙", "naiwa_xigema_runtime.glb"),
]


def parse_glb(path):
    with open(path, "rb") as fh:
        data = fh.read()
    total = struct.unpack_from("<I", data, 8)[0]
    off, js, binchunk = 12, None, None
    while off + 8 <= total:
        clen, ctype = struct.unpack_from("<II", data, off)
        body = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(body.decode("utf-8"))
        elif ctype == 0x004E4942:
            binchunk = body
        off += 8 + clen
    return js, binchunk


def view_bytes(g, binchunk, bv):
    off = bv.get("byteOffset", 0)
    ln = bv["byteLength"]
    return binchunk[off: off + ln]


def tex_color(png_bytes):
    im = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    a = np.asarray(im).astype(np.int32)
    opaque = a[..., 3] >= 32
    rgb = a[opaque][:, :3]
    if len(rgb) < 100:
        return None, im.size, 0
    med = np.median(rgb, axis=0)
    # 粗聚类：RGB 每通道量化 32 级，取像素数前 5 簇
    q = (rgb // 32).astype(np.int32)
    key = (q[:, 0] << 10) | (q[:, 1] << 5) | q[:, 2]
    uniq, cnt = np.unique(key, return_counts=True)
    order = np.argsort(-cnt)[:5]
    clusters = []
    for oi in order:
        k = uniq[oi]
        sel = key == k
        c = rgb[sel].mean(axis=0).round().astype(int).tolist()
        clusters.append({"rgb": c, "frac": round(float(cnt[oi]) / len(key), 3)})
    return [round(float(c), 1) for c in med], im.size, len(rgb), clusters


def main():
    os.makedirs(TEXDIR, exist_ok=True)
    rows = []
    for cn, name in GLBS:
        p = os.path.join(ASSET, name)
        g, binchunk = parse_glb(p)
        imgs = g.get("images", [])
        bvs = g.get("bufferViews", [])
        texs = g.get("textures", [])
        # 材质 baseColorTexture → texture index → source(image index)
        # 注意本仓 GLB 用 EXT_texture_webp 扩展，source 藏在 extensions 里
        def tex_source(t):
            if not isinstance(t, dict):
                return None
            return t.get("source") or t.get("extensions", {}).get("EXT_texture_webp", {}).get("source")
        base_sources = set()
        for m in g.get("materials", []):
            bct = m.get("pbrMetallicRoughness", {}).get("baseColorTexture")
            if bct is not None and bct.get("index", -1) < len(texs):
                s = tex_source(texs[bct["index"]])
                if s is not None:
                    base_sources.add(s)
        entry = {"name": cn, "glb": name, "textures": []}
        for i, im in enumerate(imgs):
            bv = bvs[im["bufferView"]]
            b = view_bytes(g, binchunk, bv)
            mime = im.get("mimeType", "image/png")
            ext = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}.get(mime, "bin")
            fn = "%s_%d.%s" % (name.replace(".glb", ""), i, ext)
            with open(os.path.join(TEXDIR, fn), "wb") as fh:
                fh.write(b)
            if ext in ("png", "jpg", "webp"):
                med, size, npix, clusters = tex_color(b)
                entry["textures"].append({
                    "file": fn, "size": list(size), "opaquePx": npix,
                    "medRGB": med, "clusters": clusters,
                    "isBaseColor": i in base_sources,
                })
            else:
                entry["textures"].append({"file": fn, "mime": mime, "bytes": len(b), "note": "未解码格式"})
        rows.append(entry)
        tex_summary = "; ".join("t%d%s med=%s clusters=%s" % (i, "*base" if t.get("isBaseColor") else "",
                             t.get("medRGB"), [(c["rgb"], c["frac"]) for c in (t.get("clusters") or [])][:3])
                             for i, t in enumerate(entry["textures"]))
        print("%-6s %-34s %s" % (cn, name, tex_summary))
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({"source": "GLB BIN chunk 内嵌贴图（只读提取）", "rows": rows}, fh, ensure_ascii=False, indent=2)
    print("[json] " + OUT)
    print("[tex] " + TEXDIR)


if __name__ == "__main__":
    main()