# 展示层重染验收报告（tint-audit-20261110）

> 执行人：重染色P　· task id=23
> 依据：`docs/evidence/roster-audit-20261110.md` 差距#1（奶猫/奶鱼/奶粉三只族谱核心辨识色在 GLB 贴图层不存在）
> 方案：展示层重染三只（squad.mjs COLOR_OVERRIDE + npr.mjs USE_TINT_NPR + main.mjs 传参），不动 GLB、不动其余 13 只、不碰 `dist/`、`src/world/*`、`public/asset`

---

## 1. 改动清单（文件:行号）

| 文件 | 行号 | 内容 |
|---|---|---|
| `src/game/squad.mjs` | L79–93 | `COLOR_OVERRIDE = { shell_naimao: 0xbfc4cc, shell_naiyu: 0xa8d8ea, shell_naifen: 0xf2d8de }`（同 visualScale 模式，注释说明与 FAMILY.color 解耦理由） |
| `src/game/squad.mjs` | L108–110 | SQUAD map 新增 `tintColor: COLOR_OVERRIDE[shell.id] ?? null` |
| `src/render/npr.mjs` | L75–80 | makeNprMaterial 解析 `p.tintColor / p.tintMix(默认1.0) / p.tintGain(默认1.0)` |
| `src/render/npr.mjs` | L98 | 仅 tint 材质注入 `mat.defines.USE_TINT_NPR` |
| `src/render/npr.mjs` | L119–127 | onBeforeCompile 注入 `uTintColor/uTintMix/uTintGain` uniforms（仅 tint 材质） |
| `src/render/npr.mjs` | L158–163 | fragmentShader `#include <map_fragment>` 后注入亮度守恒重染块（仅 USE_TINT_NPR） |
| `src/render/npr.mjs` | L183–186 | fragmentShader 声明区 `#ifdef USE_TINT_NPR` 内声明三个 uniform |
| `src/render/npr.mjs` | L201–219 | opaque_fragment 注入块：tint 材质加性光颜色同色化（specC/rimC/keyC/fillC/ambC），无 tint 材质 = uniform 原值 |
| `src/render/npr.mjs` | L257–258 | customProgramCacheKey 加 `_tint` 后缀（无 tint 材质 key 与改前逐字节一致） |
| `src/render/npr.mjs` | L290–296 | applyNpr 读 `outlineOpts.tintColor/tintMix/tintGain` 拼 preset（不新增第四参） |
| `src/main.mjs` | L183–185 | 玩家载入 applyNpr 传 `tintColor: member.tintColor` |
| `src/main.mjs` | L466 | restyleAll 玩家侧 applyNpr 传 `tintColor: m.tintColor`（换壳路径） |
| `src/main.mjs` | L252 / L459 | **对手两处调用点未改**（保持无 tint），符合「对手不加」 |

**「注入与声明成对」自证**（grep `src/render/npr.mjs`）：
- 注入：L124–126 `shader.uniforms.uTintColor/uTintMix/uTintGain = {...}`
- 声明：L184–186 `uniform vec3 uTintColor; uniform float uTintMix; uniform float uTintGain;`（`#ifdef USE_TINT_NPR` 内，L183/187 成对）
- 使用：L161（albedo 重染）、L210–215（加性光同色化）全部在 `#ifdef USE_TINT_NPR` 块内
- 无 tint 的 13 只：defines 不注入（L98 条件成立才加）、uniform 不注入（L121 条件）、GLSL 注入块被预处理器移除、cache key 无 `_tint` 后缀与改前逐字节一致——shader 路径零行为变化（材质取证实证见 §4）

## 2. 配方一轮实测修正（披露）

任务书初版公式 `uTintColor * lumaNpr * 1.15`（gain=1.15）第一轮构建+采集实测**不适用**，两项超标：

| 指标 | 初版公式实测 | 根因 |
|---|---|---|
| 奶猫 lumaΔ(on−off) | **−23.2**（>15 超标） | 公式把 `luma(tint)` 二次乘入：奶猫 tint 0xbfc4cc 的 linear luma 仅 0.531，重染 albedo 明度只剩原来 61%×1.15≈70% |
| 奶猫 hueΔ | **179.1°**（>25 超标） | NPR 加性暖光（key 0xffe8c8/fill 0xffdf9e/rim 0xffe2a0/spec 0xfff8e0）把低饱和重染 albedo（S=0.064）冲成暖橙 [142,135,127] |
| 奶粉 hueΔ | **51.5°**（>25 超标） | 同上，albedo 已换粉但渲染输出仍暖橙（hue 37.7°），实证加性光统治色相 |
| 奶鱼 | 3.3° / −12.9 达标 | tint S=0.282 蓝意够强，暖光冲不掉 |

修正（保持 NPR 分层结构、无 tint 路径零变化）：
1. **亮度守恒重染**：`uTintColor * (lumaNpr / lumaTintNpr) * uTintGain`，重染后 albedo 明度 = 原明度 × gain，与 tint 自身明度无关（npr.mjs L158–163）；
2. **加性光颜色同色化**：tint 材质的 spec/rim/key/fill/ambient 五个加性色按 `uTintMix` mix 到「单位亮度 tint 色」（只换色相，各层强度/几何结构不变；无 tint 材质此块被预处理器移除，编译器内联后与改前等价）（npr.mjs L201–219）；
3. `tintGain` 默认 1.15→**1.0**（亮度守恒语义下无需增益）。

初版数据留存：`docs/evidence/v3-tint-capture-20261110.json` 已被第二轮覆盖，第一轮数值以上表为准（第一轮 build 产物 `index-DzydP8ld.js` 781.35 kB，第二轮 `index-BD1LMdHN.js` 783,646 B）。

## 3. 采集与测量口径

- 隔离构建：`npx vite build --outDir .tmp-dist-tint --emptyOutDir`（默认 minify，vite 8.3.6，55 modules，886ms，产物 `assets/index-BD1LMdHN.js` 783,646 B + `index-CyRGowVo.css` 26,307 B）
- 采集：`scripts/capture-tint.mjs`——静态服务+CDP 同进程（端口 **5320**），viewport 1600×1000/dpr 1.25 → canvas 2000×1250；真实点击 `#screen-title [data-action="start"]` → `#screen-select [data-action="confirm"]` 进战斗，`window.__npr.startBattle(i)` 逐只切换
- 就位：5/5 `hudMatch=true`（HUD 壳名=预期、visibleGroups 恰好 1 个、activeIndex 一致；HUD 前后读数在 `v3-tint-capture-20261110.json`）
- 机位：与 roster-audit 完全同参数（读 `move.facing`，forward 方向 distance 3.8 / height 1.6 / lookAt 0.7 / fov 40；四只 facing=0 正前，奶蛙 facing=−1.02 与旧审计同为斜侧）
- 掩膜：`|iso − isoEmpty|` 三通道差分和 >30 → 5×5 中值滤波（同 measure-roster.py）；量化脚本 `scripts/measure-tint.py`
- 采集对象指纹：5 只目标 GLB sha1 + 三文件 mtime 落 `v3-tint-capture-20261110.json` meta

## 4. 材质取证（tint 真实接线证明）

运行时读取当前角色 NPR 材质 `userData.shader.uniforms`：

| idx | 名 | hasTint | uTintRGB（linear） | uTintMix/Gain | defines |
|---|---|---|---|---|---|
| 8 | 奶猫 | ✓ | [0.521, 0.552, 0.6038] | 1 / 1 | STANDARD, **USE_TINT_NPR** |
| 12 | 奶鱼 | ✓ | [0.3916, 0.6867, 0.8228] | 1 / 1 | STANDARD, **USE_TINT_NPR** |
| 6 | 奶粉 | ✓ | [0.8879, 0.6867, 0.7305] | 1 / 1 | STANDARD, **USE_TINT_NPR** |
| 0 | 奶蛙（抽查） | ✗ | null | null | STANDARD（无 tint） |
| 15 | 西格玛（抽查） | ✗ | null | null | STANDARD（无 tint） |

三个 uTintRGB 均精确等于对应 hex 的 sRGB→linear 转换值（ColorManagement 路径与 sRGB 贴图解码同一工作空间）；SQUAD meta 里 idx6/8/12 的 `tintColor` 与 `color` 同值（0xF2D8DE/0xBFC4CC/0xA8D8EA）。

## 5. 色相前后对照（判据：掩膜中位色 vs tint 目标色 hueΔ < 25° = 还原）

| idx | 名 | tint 目标 | 旧 hueΔ（roster-audit，vs config） | 新 hueΔ（vs tint 目标） | 判级变化 | 新 medRGB / medHSV |
|---|---|---|---|---|---|---|
| 8 | 奶猫 | 0xBFC4CC（hue 216.9°, S 0.064） | **174.3°**（灰→金铜，缺失） | **0.6°** | 缺失 → **还原** | [178,176,176] / [217.5°, 0.022, 0.702] |
| 12 | 奶鱼 | 0xA8D8EA（hue 196.4°, S 0.282） | **152.3°**（浅蓝→米黄，缺失） | **3.3°** | 缺失 → **还原** | [133,161,169] / [193.1°, 0.184, 0.667] |
| 6 | 奶粉 | 0xF2D8DE（hue 346.2°, S 0.107） | **55.1°**（粉→卡其，缺失） | **21.2°** | 缺失 → **还原** | [147,130,133] / [325.0°, 0.107, 0.584] |

同帧不重染对照（uTintMix=0，同 GLB 同光照）hueΔ：奶猫 175.1°、奶鱼 155.2°、奶粉 51.8°——与 roster 旧审计量级一致，证明变色来自 tint 路径本身。

**口径说明**：奶猫（S 目标 0.064）与奶粉（S 目标 0.107）为低饱和判色，hue 数值在近中性区灵敏度有限（roster-audit 口径亦注明）；本报告按任务书要求给出数值判级，同时给出 medRGB 三通道关系佐证——奶猫 [178,176,176] 中性灰（B≥G≈R，与 0xBFC4CC 的灰一致，旧帧为 R≫B 金铜 [162,142,85]）；奶粉 [147,130,133] R>B>G 的灰粉（旧帧卡其 [75,64,57]）；奶鱼 [133,161,169] B 通道优势 36（旧帧 R≫B）。AI 视觉复核三张主图：三只均清晰可见、非暗色块（低饱和下 AI 主观描述颗粒度粗，以掩膜数值为准）。

## 6. 未误伤抽查（判据：新旧帧掩膜中位色 hueΔ < 8° = 零漂移）

| idx | 名 | 旧 medRGB/medHSV（roster） | 新 medRGB/medHSV | 新旧 hueΔ | 结论 |
|---|---|---|---|---|---|
| 0 | 奶蛙 | [103,87,55] / [41.8°, 0.354, 0.404] | [140,129,88] / [46.8°, 0.187, 0.553] | **5.0°** | 零漂移通过 |
| 15 | 西格玛 | [88,75,61] / [38.4°, 0.212, 0.345] | [142,127,87] / [38.5°, 0.184, 0.569] | **0.1°** | 零漂移通过 |

材质侧双证：两只 defines 无 USE_TINT_NPR、无 tint uniforms（§4）。S/V 有整体漂移（奶蛙 S 0.354→0.187、V 0.404→0.553；西格玛同向变亮）——hue 相对量不受影响，且该漂移在无 tint 角色上同样出现，归因于基础渲染基线随外部线改动整体变亮（roster 采集 02:05–02:15 后 main.mjs/scene 等仍在他线迭代），**非 tint 路径引入**（tint 未注入这两只，defines 实证）。

## 7. 明度对照（判据：重染 3 只同帧 uTintMix=1 vs 0 掩膜 meanLuma 差 < 15）

主判据（同帧对照，同 GLB 同光照，唯一公平口径）：

| idx | 名 | tint on | tint off (uTintMix=0) | Δ | 结论 |
|---|---|---|---|---|---|
| 8 | 奶猫 | 166.2 | 166.2 | **0.0** | 通过 |
| 12 | 奶鱼 | 151.1 | 156.0 | **−4.9** | 通过 |
| 6 | 奶粉 | 134.7 | 134.8 | **−0.1** | 通过 |

参考项（vs roster 旧帧，含构建版本差异 + 奶粉 GLB 02:22 重导出噪声，不作判据）：奶猫 +43.1、奶鱼 +20.3、奶粉 +38.4——方向均为**变亮**，结合 AI 目检「清晰可见非暗色块」，「染黑/染闷」风险不成立。

## 8. 稳定性与错误采集

- `console error` = **0**、`Runtime.exceptionThrown` = **0**、`network error` = **0**（全程采集，`v3-tint-capture-20261110.json` `consoleErrors=[]`；无 shader 编译错误——uTintColor/uTintMix/uTintGain 注入与声明成对，五色同色化变量声明/赋值亦均在 USE_TINT_NPR 守卫内）
- 5/5 就位轮询通过，无 memberReady 超时
- restyleAll 重复应用无叠加/残留：每次 restyle 先恢复 `__origMats` 再重建 NPR 材质，tint 源始终来自 `member.tintColor`（main.mjs L466）；运行时同帧 uTintMix 1→0→1 切换往返验证无残留（tintoff 帧后恢复拍摄正常）

## 9. 判级结论（配色维度是否升「还原」）

按 roster-audit §3 阈值（hueΔ < 25° = 还原）：

- **奶猫（idx8）**：配色 缺失→**还原**（174.3°→0.6°）。综合判级：剪影 3/3 还原 + 配色还原 → 综合「部分」→ **还原**
- **奶鱼（idx12）**：配色 缺失→**还原**（152.3°→3.3°）。综合判级：剪影 3/3 还原 + 配色还原 → 综合「部分」→ **还原**
- **奶粉（idx6）**：配色 缺失→**还原**（55.1°→21.2°，贴近阈值上沿）。综合判级：剪影仍为「部分 1/3」（罐壶形 vs 族谱精灵/鸟形，结构性差异，展示层无法弥补）→ 综合「缺失」→ **部分**（受剪影维度约束）

即：三只配色维度全部升「还原」；奶猫/奶鱼综合判级随之升「还原」，奶粉综合升「部分」（剪影瓶颈，需资产线改形才能到「还原」）。

## 10. 证据文件清单

| 文件 | 说明 |
|---|---|
| `docs/evidence/v3-tint-00-naiwa.png` / `v3-tint-06-naifen.png` / `v3-tint-08-naimao.png` / `v3-tint-12-naiyu.png` / `v3-tint-15-xigema.png` | 5 只战斗主图（2000×1250，HUD 证人图对应） |
| `docs/evidence/v3-tint-iso-XX.png` ×5 / `v3-tint-iso-empty-XX.png` ×5 | 隔离帧 + 纯背景帧（掩膜源） |
| `docs/evidence/v3-tint-iso-tintoff-XX.png` ×3 | 重染 3 只同帧 uTintMix=0 对照帧（明度判据源） |
| `docs/evidence/tint-metrics-20261110.json` | 掩膜量化原始数据（色相/明度/判级） |
| `docs/evidence/v3-tint-capture-20261110.json` | 采集 meta（HUD 前后读数、材质取证、GLB sha1、console errors） |
| `scripts/capture-tint.mjs` / `scripts/measure-tint.py` | 采集与量化脚本（新增） |
| `.tmp-dist-tint/`（保留） | 隔离构建产物 `index-BD1LMdHN.js` 783,646 B |

## 11. 外部并发改写记录（如实披露）

1. 会话中 `squad.mjs` 被外部线改写一次（L85 `glb: /asset/…` → `./asset/…`），Edit 乐观锁拦截后重读重试成功；
2. `main.mjs` 被外部线改写一次（+4 行：L136 `quality` 画质状态跟踪、`getState`；L225 对手 GLB 路径改 `./asset/…`），按新行号（L183/L252/L466/L459→L466）重新定位编辑；
3. **深挖线改动同场确认**：squad.mjs `CHAIN_WINDOW_S`（L120–121）与 `openChainWindow()`（L186–188）在场；main.mjs `squad.openChainWindow()` 调用（L327，GAME-1 修复注释）在场，未被本次改动覆盖；
4. 交付前终验 `node --check` 三文件重跑通过（外部高频写入环境下以交付时点状态为准）。

## 12. 已知风险与回滚

- 单点回滚：还原 `src/game/squad.mjs`（删 L79–93、L108–110）、`src/render/npr.mjs`（tint 相关 8 处）、`src/main.mjs`（L183–185、L466 两处调用点参数）即可全量回退；GLB/`dist/`/`src/world/*` 未动，无资产侧影响。
- 奶粉 hueΔ 21.2° 距 25° 阈值余量有限（低饱和粉 + 暖光残余），若后续调曝光/灯光需复测；
- 奶猫/奶粉低饱和判色的 hue 数值口径灵敏度有限（§5 口径说明），后续如改资产层贴图（真正的修复路径，roster-audit §8 建议），展示层 tint 可整体下线。