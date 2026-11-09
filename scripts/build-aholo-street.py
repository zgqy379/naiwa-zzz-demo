#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把 Aholo World 导出的连续表面网格（PLY）转成可上屏的轻量 GLB。

背景：`街区全景和点云.zip` 里的 surface PLY 是 721×360 的规则全景网格，
47.3 万三角面，直接在 Web 里用会炸 draw call 和显存。这里做三件事：

1. 降采样：每 STRIDE 个格点取一个，把 47 万面压到约 3 万面。
2. 裁坏面：全景反投影在深度断裂处（屋檐／招牌边缘）本来就有洞，
   降采样后若硬连会拉出长条「拉丝面」。用 3D 边长阈值过滤，顺带裁掉
   飘到几百米外的重建离群点。
3. 风格化：顶点色压暗、降饱和、轻微冷偏，让它退成「写实底」，
   前面那层 NPR 卡通招牌和奶蛙才跳得出来。

产物是标准 glTF 2.0 二进制（GLB），材质带 KHR_materials_unlit，
Three.js 加载后自动变成不受光照影响的顶点色材质。

用法：
    python scripts/build-aholo-street.py
输入默认 .tmp-street-ref/Assets/，输出 public/world/aholo-street.glb。
"""

import json
import os
import struct
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, ".tmp-street-ref", "Assets", "霓虹废弃工业巷_pointcloud_surface.ply")
DST = os.path.join(ROOT, "public", "world", "aholo-street.glb")

# 全景网格的固定宽度：从面索引 (i, i+1, i+722) 反推，row stride = 721
GRID_W = 721
GRID_H = 360
VERTEX_STRIDE = 15  # 3×float32 坐标 + 3×uint8 顶点色
FACE_STRIDE = 13    # uint8 顶点数 + 3×int32 索引

STRIDE = 4          # 每 4 格取 1 → 181×90 格点
MAX_EDGE = 1.2      # 降采样 quad 任一边超过 1.2 米就判定为跨深度断裂，丢弃
MAX_RADIUS = 25.0   # 超过 25 米的顶点视为重建失败的离群点

BRIGHTNESS = 0.82   # 整体压暗，给前景让位
SATURATION = 0.72   # 降饱和，写实底不与卡通霓虹抢色
COOL_BIAS = 0.012   # 极轻微青偏，贴近项目黑底青粉配色


def read_ply(path):
    """读二进制小端 PLY，返回 (坐标 Nx3 float32, 顶点色 Nx3 uint8, 面数)。"""
    with open(path, "rb") as f:
        header = b""
        while True:
            line = f.readline()
            header += line
            if line.strip() == b"end_header":
                break
        text = header.decode("ascii", errors="replace")
        nv = int([l for l in text.splitlines() if l.startswith("element vertex")][0].split()[-1])
        nf = int([l for l in text.splitlines() if l.startswith("element face")][0].split()[-1])
        assert nv == GRID_W * GRID_H, f"顶点数 {nv} 与 {GRID_W}×{GRID_H} 不符"
        dt = np.dtype([("x", "<f4"), ("y", "<f4"), ("z", "<f4"),
                       ("r", "u1"), ("g", "u1"), ("b", "u1")])
        v = np.frombuffer(f.read(nv * VERTEX_STRIDE), dtype=dt)
        xyz = np.stack([v["x"], v["y"], v["z"]], axis=1)
        rgb = np.stack([v["r"], v["g"], v["b"]], axis=1)
    return xyz, rgb, nv, nf


def stylize(rgb):
    """压暗 + 降饱和 + 冷偏，输出符合 glTF 规范的线性顶点色。

    源顶点色是从 JPG 采样的 **sRGB** 值，而 glTF 的 COLOR_0 必须是
    **线性**值；Three.js 加载后还会再做一次 linear→sRGB 输出转换。
    若直接把 sRGB 值塞进去，等于转了两次，画面会整体过曝发白
    （实测：巷子白墙糊成一片，霓虹全丢）。所以在 sRGB 空间先做
    视觉上的压暗降饱和，最后统一转成线性再写入 GLB。
    """
    c = rgb.astype(np.float32) / 255.0
    lum = (0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2])[..., None]
    c = lum + (c - lum) * SATURATION
    c = np.clip(c * BRIGHTNESS, 0, 1)
    c[..., 2] = np.clip(c[..., 2] + COOL_BIAS, 0, 1)
    # sRGB → linear（IEC 61966-2-1 分段公式）
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return (np.clip(c, 0, 1) * 255).astype(np.uint8)


def decimate(xyz, rgb):
    """规则网格降采样 + 坏面过滤，输出 (坐标, 颜色, 三角形索引)。"""
    gxyz = xyz.reshape(GRID_H, GRID_W, 3)
    grgb = rgb.reshape(GRID_H, GRID_W, 3)

    rows = np.arange(0, GRID_H, STRIDE)
    cols = np.arange(0, GRID_W, STRIDE)
    p = gxyz[np.ix_(rows, cols)].astype(np.float64)   # (H', W', 3)
    c = grgb[np.ix_(rows, cols)]

    h, w = p.shape[:2]
    radius = np.linalg.norm(p, axis=2)
    valid = radius <= MAX_RADIUS

    # 四个角的边长：横向、纵向、两条对角线
    e_h = np.linalg.norm(p[:, 1:] - p[:, :-1], axis=2)          # (h, w-1)
    e_v = np.linalg.norm(p[1:] - p[:-1], axis=2)                # (h-1, w)
    e_d = np.linalg.norm(p[1:, 1:] - p[:-1, :-1], axis=2)       # (h-1, w-1)

    triangles = []
    skipped_edge = 0
    skipped_far = 0
    for r in range(h - 1):
        for cc in range(w - 1):
            if not (valid[r, cc] and valid[r, cc + 1] and
                    valid[r + 1, cc] and valid[r + 1, cc + 1]):
                skipped_far += 1
                continue
            # 用该 quad 周边的最大边长判断深度连续性
            if max(e_h[r, cc], e_h[r + 1, cc], e_v[r, cc], e_v[r, cc + 1], e_d[r, cc]) > MAX_EDGE:
                skipped_edge += 1
                continue
            i00 = r * w + cc
            i10 = i00 + 1
            i01 = i00 + w
            i11 = i01 + 1
            # 与原 PLY 保持相同绕序；运行时用 DoubleSide，不依赖朝向
            triangles.append((i00, i10, i11))
            triangles.append((i00, i11, i01))

    idx = np.asarray(triangles, dtype=np.uint32).reshape(-1)
    kept = int(np.count_nonzero(np.bincount(idx, minlength=h * w)))
    # 压缩掉没被任何三角形引用的格点，减小 GLB
    used = np.unique(idx)
    remap = np.full(h * w, -1, dtype=np.int32)
    remap[used] = np.arange(len(used), dtype=np.int32)
    idx = remap[idx].astype(np.uint32)

    out_xyz = p.reshape(-1, 3)[used].astype(np.float32)
    out_rgb = c.reshape(-1, 3)[used]
    print(f"格点 {h}×{w} = {h*w} → 被引用 {kept}")
    print(f"丢弃 quad：离群 {skipped_far} / 深度断裂 {skipped_edge}")
    print(f"输出顶点 {len(out_xyz)}，三角面 {len(idx)//3}")
    return out_xyz, stylize(out_rgb), idx


def pad4(b, fill=b"\x00"):
    """glTF 要求每个 chunk 长度 4 字节对齐。"""
    return b + fill * ((4 - len(b) % 4) % 4)


def write_glb(path, xyz, rgb, idx):
    """手写规范 GLB：POSITION(float32) / COLOR_0(ubyte normalized) / indices(uint32)。"""
    pos = xyz.astype("<f4").tobytes()
    # 用 VEC4 而不是 VEC3：ubyte×3 的顶点色会让每个顶点占 3 字节，
    # bufferView 长度不满足 glTF 的 4 字节对齐要求（validator 会报
    # MESH_PRIMITIVE_ACCESSOR_UNALIGNED）。补一列 alpha=255 最省事。
    col4 = np.concatenate([rgb, np.full((len(rgb), 1), 255, dtype=np.uint8)], axis=1)
    col = col4.astype("u1").tobytes()
    ind = idx.astype("<u4").tobytes()

    off_pos = 0
    off_col = len(pos) + ((4 - len(pos) % 4) % 4)
    off_ind = off_col + len(col) + ((4 - len(col) % 4) % 4)
    bin_blob = pad4(pos) + pad4(col) + pad4(ind)

    doc = {
        "asset": {"version": "2.0", "generator": "naiwa-zzz / build-aholo-street.py"},
        "extensionsUsed": ["KHR_materials_unlit"],
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "AholoWorldSurface"}],
        "meshes": [{"name": "霓虹废弃工业巷（减面）",
                    "primitives": [{"attributes": {"POSITION": 0, "COLOR_0": 1},
                                    "indices": 2, "material": 0, "mode": 4}]}],
        "materials": [{
            "name": "AholoVertexColorUnlit",
            "doubleSided": True,
            "pbrMetallicRoughness": {
                "baseColorFactor": [1, 1, 1, 1],
                "metallicFactor": 0.0,
                "roughnessFactor": 1.0,
            },
            "extensions": {"KHR_materials_unlit": {}},
        }],
        "buffers": [{"byteLength": len(bin_blob)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": off_pos, "byteLength": len(pos), "target": 34962},
            {"buffer": 0, "byteOffset": off_col, "byteLength": len(col), "target": 34962},
            {"buffer": 0, "byteOffset": off_ind, "byteLength": len(ind), "target": 34963},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(xyz), "type": "VEC3",
             "min": xyz.min(axis=0).tolist(), "max": xyz.max(axis=0).tolist()},
            {"bufferView": 1, "componentType": 5121, "normalized": True,
             "count": len(rgb), "type": "VEC4"},
            {"bufferView": 2, "componentType": 5125, "count": len(idx), "type": "SCALAR",
             "min": [0], "max": [int(len(xyz) - 1)]},
        ],
    }

    json_blob = pad4(json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), b" ")
    total = 12 + 8 + len(json_blob) + 8 + len(bin_blob)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(json_blob), b"JSON"))
        f.write(json_blob)
        f.write(struct.pack("<I4s", len(bin_blob), b"BIN\0"))
        f.write(bin_blob)


def main():
    if not os.path.isfile(SRC):
        raise SystemExit(f"找不到源 PLY：{SRC}")
    xyz, rgb, nv, nf = read_ply(SRC)
    print(f"源：{nv} 顶点 / {nf} 三角面")
    out_xyz, out_rgb, idx = decimate(xyz, rgb)
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    write_glb(DST, out_xyz, out_rgb, idx)
    print(f"GLB：{DST}  {os.path.getsize(DST)/1024:.1f} KB")
    print(f"减面比：{len(idx)//3/nf*100:.1f}%（保留）")


if __name__ == "__main__":
    main()
