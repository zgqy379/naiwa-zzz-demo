# -*- coding: utf-8 -*-
"""
GLB 材质/贴图解包（只读审计，roster 专项）：区分「资产本身颜色」与「展示层染色」。

对 public/asset/ 下 16 只 runtime GLB 解析 JSON chunk，输出每只：
  - materials[]: name / baseColorFactor / alphaMode / doubleSided
  - baseColorTexture 有无、images(贴图) 数量
  - mesh/node 名称（找 ring/torus/halo 等疑似指示环几何）
  -skins/animations 数量
  - 顶点数（POSITION accessor count 合计，确认 19k 定稿版量级）

用法：python -X utf8 scripts/diag-roster-glb.py
输出：docs/evidence/roster-glb-materials-20261110.json + 控制台表
"""
import json
from pathlib import Path
import os
import struct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET = os.path.join(ROOT, "public", "asset")
OUT = os.path.join(ROOT, "docs", "evidence", "roster-glb-materials-20261110.json")

GLBS = [
    "naiwa_laugh_g1_runtime.glb", "naiwa_naidou_runtime.glb", "naiwa_xiaonaiwa_runtime.glb",
    "naiwa_naidan_runtime.glb", "naiwa_nashu_runtime.glb", "naiwa_naigou_runtime.glb",
    "naiwa_naifen_runtime.glb", "naiwa_naiji_runtime.glb", "naiwa_naimao_runtime.glb",
    "naiwa_naishi_runtime.glb", "naiwa_dounai_runtime.glb", "naiwa_naitu_runtime.glb",
    "naiwa_naiyu_runtime.glb", "naiwa_naicha_runtime.glb", "naiwa_naiping_runtime.glb",
    "naiwa_xigema_runtime.glb",
]

NAMES = ["奶蛙", "奶豆", "小奶蛙", "奶蛋", "奶鼠", "奶狗", "奶粉", "奶鸡",
         "奶猫", "奶屎", "豆奶", "奶兔", "奶鱼", "奶茶", "奶瓶", "西格玛奶蛙"]


def parse_glb_json(path):
    with open(path, "rb") as fh:
        data = fh.read()
    magic, ver, total = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        raise ValueError("not glb: " + path)
    off = 12
    while off + 8 <= total:
        clen, ctype = struct.unpack_from("<II", data, off)
        if ctype == 0x4E4F534A:  # JSON
            return json.loads(data[off + 8: off + 8 + clen].decode("utf-8"))
        off += 8 + clen
    raise ValueError("no JSON chunk: " + path)


def main():
    rows = []
    for name, cn in zip(GLBS, NAMES):
        p = os.path.join(ASSET, name)
        g = parse_glb_json(p)
        mats = []
        for m in g.get("materials", []):
            pbr = m.get("pbrMetallicRoughness", {})
            bcf = pbr.get("baseColorFactor", [1, 1, 1, 1])
            mats.append({
                "name": m.get("name"),
                "baseColorFactor": [round(float(x), 4) for x in bcf],
                "baseColorRGB": [round(float(x) * 255) for x in bcf[:3]],
                "hasBaseColorTex": "baseColorTexture" in pbr,
                "alphaMode": m.get("alphaMode", "OPAQUE"),
                "doubleSided": bool(m.get("doubleSided", False)),
            })
        mesh_names = [m.get("name") for m in g.get("meshes", [])]
        node_names = [n.get("name") for n in g.get("nodes", [])]
        ring_like = [s for s in (mesh_names + node_names)
                     if s and any(k in s.lower() for k in ("ring", "torus", "halo", "circle", "hoop", "band"))]
        # 顶点数合计
        acc = g.get("accessors", [])
        verts = 0
        for mesh in g.get("meshes", []):
            for prim in mesh.get("primitives", []):
                pa = prim.get("attributes", {}).get("POSITION")
                if pa is not None and pa < len(acc):
                    verts += int(acc[pa].get("count", 0))
        imgs = g.get("images", [])
        texs = g.get("textures", [])
        anims = g.get("animations", [])
        rows.append({
            "name": cn, "glb": name, "bytes": os.path.getsize(p),
            "materials": mats, "images": len(imgs), "textures": len(texs),
            "skins": len(g.get("skins", [])), "animations": len(anims),
            "vertices": verts, "meshCount": len(mesh_names),
            "ringLikeNames": ring_like,
            "meshNames": mesh_names[:20], "nodeNames": node_names[:24],
        })
        base = "; ".join("m%d=%s%s" % (i, m["baseColorRGB"], "×tex" if m["hasBaseColorTex"] else "")
                         for i, m in enumerate(mats))
        print("%-6s %-34s verts=%6d mats=%d img=%d tex=%d skin=%d anim=%d ring=%s | %s"
              % (cn, name, verts, len(mats), len(imgs), len(texs),
                 rows[-1]["skins"], rows[-1]["animations"], ring_like or "-", base[:120]))
    Path(OUT).write_text(json.dumps({"source": "public/asset/*.glb JSON chunk（只读）", "rows": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
    print("[json] " + OUT)


if __name__ == "__main__":
    main()