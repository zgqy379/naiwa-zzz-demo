# -*- coding: utf-8 -*-
"""
合成最终审计 JSON（只读审计产出）：
  roster-metrics-20261110.json   掩膜量化（bbox/aspect/fill/中位色/hueΔ）
  v3-roster-capture-20261110.json 采集 HUD 读数 + glb sha1 + meta
  人工判级表（本脚本内置，来自 analyzeImage 双跑一致的证据链）
输出：docs/evidence/roster-audit-20261110.json
"""
import json
from pathlib import Path
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EV = os.path.join(ROOT, "docs", "evidence")

# 判级表（依据：analyzeImage 对 iso/主图帧的双跑一致目检 + 掩膜量化；口径见报告 §阈值）
# silhouette: 三要素计数；colorGrade: 相对 squad.mjs config color
VERDICTS = {
    0:  {"sil": {"elements": ["梨形体型✓", "大圆眼+微笑嘴✓", "直立蛙姿/手置身前✓"], "count": 3, "grade": "还原"},
         "col": {"hueDeltaDeg": 2.1, "grade": "还原"}, "final": "还原"},
    1:  {"sil": {"elements": ["最圆润水滴/球状✓", "黑点眼✓", "无四肢✓"], "count": 3, "grade": "还原"},
         "col": {"hueDeltaDeg": 1.0, "grade": "还原"}, "final": "还原"},
    2:  {"sil": {"elements": ["幼态小只✓", "四肢张开✓", "蛙形✓"], "count": 3, "grade": "还原"},
         "col": {"hueDeltaDeg": 6.1, "grade": "还原"}, "final": "还原"},
    3:  {"sil": {"elements": ["完美蛋形✓", "表面光滑✓", "无四肢✓"], "count": 3, "grade": "还原"},
         "col": {"hueDeltaDeg": 5.2, "grade": "还原"}, "final": "还原"},
    4:  {"sil": {"elements": ["两只巨大圆耳✓", "小身✓", "细长卷尾✓"], "count": 3, "grade": "还原"},
         "col": {"hueDeltaDeg": 4.3, "grade": "还原"}, "final": "还原"},
    5:  {"sil": {"elements": ["两只下垂狗耳✓", "张嘴笑✓", "有尾(上卷)✓"], "count": 3, "grade": "还原"},
         "col": {"hueDeltaDeg": 4.0, "grade": "还原"}, "final": "还原"},
    6:  {"sil": {"elements": ["族谱精灵/鸟形✗(罐壶形)", "提手/奶嘴阀配件△", "无耳无脸△"], "count": 1, "grade": "部分"},
         "col": {"hueDeltaDeg": 55.1, "grade": "缺失"}, "final": "缺失"},
    7:  {"sil": {"elements": ["红色锯齿鸡冠✓", "尖喙✓", "翅膀纹理+尾羽✓"], "count": 3, "grade": "还原"},
         "col": {"hueDeltaDeg": 6.7, "grade": "还原"}, "final": "还原"},
    8:  {"sil": {"elements": ["两只尖猫耳✓", "蹲坐猫姿✓", "胡须刻线✓"], "count": 3, "grade": "还原"},
         "col": {"hueDeltaDeg": 174.3, "grade": "缺失(灰→金铜,hue对灰色config无意义,目检判定)"}, "final": "部分"},
    9:  {"sil": {"elements": ["盘旋便便造型?(AI复核2次空返回,像素法aspect=1.00/fill=0.60无法确认盘旋)", "黑点眼△", "棕色△"], "count": 1, "grade": "部分(口径受限)"},
         "col": {"hueDeltaDeg": 3.1, "grade": "还原"}, "final": "部分"},
    10: {"sil": {"elements": ["人类少女发(深褐波波头+刘海)✓", "人类少女脸(大圆眼+腮红)✓", "裙子+人形躯干✗(圆球蛙形身体)"], "count": 2, "grade": "还原(机械口径2/3)"},
         "col": {"hueDeltaDeg": 3.1, "grade": "还原"}, "final": "部分"},
    11: {"sil": {"elements": ["两只长兔耳✓(一前一后)", "底部短脚✓", "圆润兔形✓"], "count": 3, "grade": "还原"},
         "col": {"hueDeltaDeg": 5.1, "grade": "还原"}, "final": "还原"},
    12: {"sil": {"elements": ["流线型✓", "胸鳍+尾鳍✓", "无腿✓"], "count": 3, "grade": "还原"},
         "col": {"hueDeltaDeg": 152.3, "grade": "缺失"}, "final": "部分"},
    13: {"sil": {"elements": ["杯形(上窄下宽)✓", "杯把手✓", "笑脸✗(正面无五官)"], "count": 2, "grade": "还原"},
         "col": {"hueDeltaDeg": 3.9, "grade": "还原"}, "final": "还原"},
    14: {"sil": {"elements": ["上窄下宽梨形✓", "顶部奶嘴配件✓", "大圆眼✓"], "count": 3, "grade": "还原"},
         "col": {"hueDeltaDeg": 0.5, "grade": "还原"}, "final": "还原"},
    15: {"sil": {"elements": ["极胖体型✓", "深沉表情/深色✓", "盘腿打坐抱胸✗(站立双臂下垂)"], "count": 2, "grade": "还原"},
         "col": {"hueDeltaDeg": 0.4, "grade": "还原"}, "final": "还原"},
}


def main():
    metrics = json.load(open(os.path.join(EV, "roster-metrics-20261110.json"), encoding="utf-8"))
    capture = json.load(open(os.path.join(EV, "v3-roster-capture-20261110.json"), encoding="utf-8"))
    tex = json.load(open(os.path.join(EV, "roster-glb-texture-colors-20261110.json"), encoding="utf-8"))
    glbmat = json.load(open(os.path.join(EV, "roster-glb-materials-20261110.json"), encoding="utf-8"))
    recheck_path = os.path.join(EV, "roster-glb-recheck-20261110.json")
    recheck = json.load(open(recheck_path, encoding="utf-8")) if os.path.exists(recheck_path) else None

    mrows = {r["idx"]: r for r in metrics["rows"]}
    glb_info = {g["idx"]: g for g in capture["meta"]["glb"]}
    shots = {s["idx"]: s for s in capture["shots"]}
    texrows = {r["name"]: r for r in tex["rows"]}
    matrows = {r["name"]: r for r in glbmat["rows"]}

    roster = []
    for idx in range(16):
        v = VERDICTS[idx]
        m = mrows.get(idx, {})
        s = shots.get(idx, {})
        name_cn = m.get("name") or s.get("expect")
        t = texrows.get(name_cn, {})
        base_t0 = next((x for x in t.get("textures", []) if x.get("isBaseColor")), None)
        roster.append({
            "idx": idx, "id": s.get("id"), "name": name_cn,
            "glb": glb_info[idx]["glb"], "glbBytes": glb_info[idx]["bytes"], "glbSha1": glb_info[idx]["sha1"],
            "silhouette": {
                "bbox": m.get("bbox"), "bboxSize": m.get("bboxSize"), "aspectWH": m.get("aspectWH"),
                "fill": m.get("fill"), "areaFrac": m.get("areaFrac"), "shapeHint": m.get("shapeHint"),
                "elements": v["sil"]["elements"], "elementCount": v["sil"]["count"], "grade": v["sil"]["grade"],
            },
            "color": {
                "cfgColor": m.get("cfgColor"), "cfgHSV": m.get("cfgHSV"),
                "medRGB": m.get("medRGB"), "medHSV": m.get("medHSV"),
                "hueDeltaDeg": v["col"]["hueDeltaDeg"], "svDelta": m.get("svDelta"), "grade": v["col"]["grade"],
                "glbTextureMedRGB": base_t0.get("medRGB") if base_t0 else None,
                "glbTextureClusters": (base_t0.get("clusters") or [])[:3] if base_t0 else None,
            },
            "features": v["sil"], "finalGrade": v["final"],
            "hud": {"before": s.get("hudBefore"), "after": s.get("hudAfter"), "match": s.get("hudMatch")},
            "shots": {"main": s.get("file"), "iso": s.get("isoFile"), "isoEmpty": s.get("isoEmptyFile")},
        })

    grades = [r["finalGrade"] for r in roster]
    payload = {
        "ok": True,
        "task": "16 只族谱还原度核对（只读审计）",
        "date": "20261110",
        "thresholds": {
            "silhouette": "族谱 signature 特征三要素：≥2 可见=还原 / 1=部分 / 0=缺失",
            "color": "渲染帧掩膜中位色 vs squad.mjs config color 色相差：<25°=还原 / 25–45°=部分 / >45°=缺失；低饱和 config(灰/米白) hue 无意义改目检色差判级；ΔV(NPR/ACES 变暗)不判级",
            "mask": "|iso - isoEmpty| 三通道差分和>30 → 5x5 中值滤波",
        },
        "evidence": {
            "captureJson": "v3-roster-capture-20261110.json",
            "metricsJson": "roster-metrics-20261110.json",
            "glbMaterialsJson": "roster-glb-materials-20261110.json",
            "glbTextureColorsJson": "roster-glb-texture-colors-20261110.json",
            "sheet": "v3-roster-sheet-20261110.png",
        },
        "build": capture.get("meta", {}).get("build"),
        "renderBase": capture.get("meta", {}).get("base"),
        "consoleErrors": capture.get("consoleErrors", []),
        "roster": roster,
        "summary": {
            "restored": grades.count("还原"), "partial": grades.count("部分"), "missing": grades.count("缺失"),
            "special_dounai": {
                "conclusion": "部分还原(偏还原)：人类少女头(深褐波波头+刘海+二次元大眼+腮红+小嘴)高度吻合族谱『棕发人类少女』；身体为圆球/蛙形(非人形躯干)、无裙。三要素 2/3。",
                "evidence": ["v3-roster-closeup-dounai.png + v3-roster-iso-10.png analyzeImage 双跑一致(B类=人类少女头+圆球身)",
                             "GLB baseColor 贴图簇 [235,166,72]棕(发)+[74,52,21]深褐(发暗部)",
                             "注意：腰部白色 attachThemeBand 主题饰带曾被 AI 误读为『白裙』——实际无裙"],
                "verdict": "部分还原（偏还原）：按三要素机械口径 2/3=还原，但缺失项(裙+人形躯干)是身体主体、结构性差异，综合降记为部分还原",
            },
            "special_naike": {
                "conclusion": "族谱共 17 只角色（名牌 17 块）；『奶克』为真实存在的第 17 只（左起第 2，长条水滴状尖端朝上、2 黑点眼、黄色）——落选设计，未进 16 壳清单；非名牌误读。",
                "roster17": ["奶茶", "奶克", "奶狗", "奶豆", "奶鼠", "小奶蛙", "奶蛋", "奶蛙(C位)", "奶瓶", "奶粉", "奶鸡", "奶猫", "奶屎", "豆奶", "奶兔", "奶鱼(前排)", "西格玛奶蛙(前排)"],
                "evidence": ["左4区放大精读(roster-ref-left4.png, 1.5x)双跑一致：第2只名牌『奶克』、长条尖端朝上；第4只『奶豆』椭圆豆状",
                             "名牌条带精读(tagband-0..3, y960-1180, 1.6x)：左7(奶茶/奶克/奶狗/奶豆/奶鼠/小奶蛙/奶蛋)+右7(奶瓶/奶粉/奶鸡/奶猫/奶屎/豆奶/奶兔)=14 后排，跨块重叠正确拼回",
                             "C位奶蛙名牌(center-low 精读)+奶鱼名牌(naiyu-front 精读,展示台前)+西格玛名牌(tile13)=前排与C位 3 块",
                             "16 壳清单 = 族谱17只 − 奶克，一一对应无遗漏",
                             "像素列投影计数不可靠(名牌底色饱和度低/高度不一)，以多裁剪交叉精读为准"],
                "verdict": "族谱 17 只；奶克=真实落选设计",
            },
            "rootCauseColor": {
                "finding": "GLB 全部为单材质 baseColorFactor=[1,1,1]×贴图(EXT_texture_webp)；baseColor 贴图主色全部为黄/卡其/米系（奶粉[213,194,146]、奶猫[219,202,148]、奶鱼[206,181,111]），渲染帧色相与贴图一致 → 配色失真源在资产贴图（资产线），非展示层染色。",
                "implication": "『颜色区分角色』设计失效：族谱核心辨识色（奶粉粉/奶猫灰/奶鱼蓝）在资产层即不存在。",
            },
            "buildRaceNote": "首轮默认 minify 隔离构建产出 NEON_PALETTE 裸残留(白屏,ReferenceError)；与共用 dist 02:09 重建并发所致源码中间态；重跑后 hash=index-DUHnm2xG.js 与 dist 完全一致、grep 残留=0。非源码缺陷，采集使用收敛后产物。",
            "assetDrift": {
                "finding": "采集(02:05-02:15)之后，public/asset 下 4 只 glb 于 02:22:41-02:23:13 被外部替换：dounai/naifen/xiaonaiwa/xigema（sha1 前后见 glbSha1 字段=采集时旧版，recheck=新版）。",
                "recheck": recheck,
                "conclusion": "4 只新版 glb 的 baseColor 贴图主色与旧版完全一致（bytes 变化=重导出），判级结论对当前资产仍有效；逐只判级绑定采集时 sha1。",
            },
        },
    }
    out = os.path.join(EV, "roster-audit-20261110.json")
    Path(out).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print("[json] " + out + " bytes=%d" % os.path.getsize(out))
    print("还原=%d 部分=%d 缺失=%d" % (payload["summary"]["restored"], payload["summary"]["partial"], payload["summary"]["missing"]))


if __name__ == "__main__":
    main()