# 旧仓库复用清单 · 2026-11-09

**结论：不删，封存为只读资产 / 证据库。** 旧仓库 `E:/naiwaling` 不再是提交载体，但里面有两样东西新仓库补不回来：**Lux3D 生成过程证据**和**素材授权台账**。删掉等于必交材料缺件、合规断链。

> **2026-11-09 21:04 已搬第一批**（复制，旧仓库未动）：8 组证据链 + `manifest.json` → `docs/evidence/lux3d/`；`ASSET-LICENSES.md` / `THIRD_PARTY_NOTICES.md` → `docs/`；非官方声明四段已补进报告书 §5.2。下表「必须搬」里这几项不用再重复拿。仍缺：报告书配图（过程截图 / 迭代对比 / 关键效果截图）。

官网已核原文（2026-11-09）：报告书「需要完整记录从创意到成果的过程，包含过程截图、关键资产迭代对比或一些关键效果截图」；「参赛者应保留其原创作品依法享有的权利，并确保所使用的代码、模型、图片、音乐、数据及其他第三方内容具有合法授权」。

## 一、必须搬（不搬交不了）

| 东西 | 旧仓库位置 | 新仓库落点 | 说明 |
|---|---|---|---|
| 资产证据链 8 组 | `docs/round3/资产证据链_第1组.md` … `第8组.md` | `docs/evidence/lux3d/` | 16 只逐只的生成参数、输入图 / 母版 / runtime sha256、积分记录。报告书「关键资产迭代对比」靠它 |
| 资产总台账 | `assets/final/manifest.json`（38KB） | 同上 | 16 只逐只登记，含 Lux3D asset_id 与管线 |
| 过程 / 效果截图 | `docs/evidence/`（245 个文件） | 按报告书需要挑，别整包倒 | 旧模板参考量：迭代对比 ≥3 组、关键效果 ≥5 张；官网只要求「包含」三类截图 |
| 非官方致敬声明 | `README.md` §6 **整段四行，不得删改** | 报告书「授权与合规」章 + 对外页面 | 新仓库报告书目前只有一句，不够 |
| 素材授权台账 | `docs/ASSET-LICENSES.md`、`docs/THIRD_PARTY_NOTICES.md` | `docs/` | three / vite 等第三方许可，官网 IP 条款靠它 |
| 报告书 / 提交清单模板 | `docs/项目报告书模板.md`、`docs/提交清单.md` | 对照补齐 | 必交 = 报告书 + Demo 链接或视频；加分 = 源码、小红书 |
| 母版 GLB（18 个） | `assets/final/*_100k.glb` | 不必进 Demo，留作迭代对比 | 16 只 runtime 已在新仓库 `public/asset/`，别重复搬 |

## 二、可直接抄的轮子（别重写）

| 轮子 | 旧仓库位置 | 怎么用 |
|---|---|---|
| 玻璃 HUD 五档配方 | `src/ui/style.css` T0–T4、`src/ui/hud.mjs` 的 `applyGlassBudget()` | 参数见 `hud-glass-spec-20261109.md`，连公式一起搬 |
| backdrop-filter 修复插件 | `vite.config.mjs` 的 `keepStandardBackdropFilter()` | 不搬玻璃会静默失效，Chrome 154 无报错 |
| 程序化音频（零素材） | `src/audio/sfx.mjs`、`music.mjs` | 整段复用，授权零风险 |
| 性能降级状态机 | `src/core/perf_monitor.mjs` | L0–L3 按帧率变档 |
| 录制模式 | `src/core/captureMode.mjs` | 能出 32s / 30fps 视频；重录见 `record-shotlist-20261109.md` |
| 触屏控件 + 手势守卫 | `src/ui/touchControls.mjs` | ≥48px 可点下限、掌心 / 多指拒收 |
| 遥测 | `src/core/telemetry.mjs`（`window.__naiwa`） | 验收断言用 |
| 演出层 | `src/vfx/`（impactfx / ritual / finisher / screenshake / chainedcam） | 冲击帧、仪式感、终结技运镜，按新玩法接线 |
| GLB 压缩管线 | `tools/optimize/build_runtime.mjs` | weld→simplify→resize→webp→quantize→meshopt |
| 源码包 + 排除清单 | `tools/pack/` | 加分项「项目源代码」用它打，排除 `assets/ref/work/raw` 与 Key |
| 门禁结构 | `tests/run_all.mjs`（94 项） | 别直接搬断言（测的是旧契约），借结构重写 |

## 三、别拿（拿了就污染新版本）

- 玩法代码 `src/game/battle.mjs` / `player.mjs` / `opponent.mjs`：旧的是 90 秒横版连携，新的是 3D 全向 + 弹反，两套东西。
- 旧 HUD 版式、旧冻结 tag `freeze-2026-11-07-final`、`docs/submission.json` 的旧基准、`demo_20261107.mp4` 当交付（只能当迭代对比基线）。
- `docs/` 下 54 份历史 md 当需求读——按 `BRIEF.md`，它们只是工程记录与历史留档，不是需求。

## 四、怎么拿

1. **旧仓库只读封存**：不再改代码、不提交、不部署、不再更新 `zgqy379.github.io/naiwaling-demo/`。
2. **复制，不移动**到新仓库对应位置；搬完在本表打勾。别删旧仓库本地目录——git 历史、冻结 tag、Lux3D 生成时间线都在里面，删了补不回来。
3. 要个封存标记的话，在旧仓库打 `archive-2026-11-09` tag 就够，不用删任何文件。
