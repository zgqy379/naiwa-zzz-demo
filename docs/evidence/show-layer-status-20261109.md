# 展示层（角色线）状态同步 · 2026-11-09 定稿（第三轮）

> 供收口线 / 视频重录 / 部署线读取。本文只陈述**已核验事实**与**产物位置**，不含推测。
> 与 `final-alignment-20261109.md` 配合阅读：那份定全局 6 步，本文只覆盖其中**第 3 步（重录视频）的前置条件**。
> 本文件取代 21:50 版本；三轮结论以本文为准。

## 一、口径位置

- 工作仓库：`E:/naiwa-zzz`（唯一正式提交版）。主仓 `E:/naiwaling` 只读封存。
- 本线职责：角色 / 换人 / HUD / 镜头 / 计时。
- 不归本线：`src/world/stage|storefront|streetdetail`（世界线）。
- 共享热点 `src/main.mjs` 每次改动前登记到 `docs/改动记录-角色线.md`（第一/二/三轮均已登记）。
- 本线**从不写共用 `dist/`**；三轮截图分别出自隔离目录 `.tmp-dist-show` / `-show2` / `-show3`。

## 二、三轮参数演进（最终值在第三轮）

| 参数 | 第一轮 | 第二轮 | **第三轮（定稿）** |
|---|---|---|---|
| `fovVertical` | 42 | 40 | **40** |
| `distance` | 4.5 | 3.8 | **3.8** |
| `height` | 1.6 | 1.6 | **1.6** |
| `lookAtHeight` | 0.9 | 0.9 | **0.7** |
| `sideOffset` | 2.2 | 2.2 | **2.2**（侧角 ≈30.1°） |
| `toneMappingExposure` | 0.85 | 0.85 | **0.85** |
| 玩家/对手站位 | ±2.4 | ±2.4 | **±2.4** |
| 描边宽度 | 0.022 | 0.022 | **0.022** |
| 奶鱼 `visualScale` | — | 1.2 | **1.2** |
| `npr` spec / rim / shadowLift | 0.35 / 0.22 / 0.12 | 同左 | **同左** |

## 三、第三轮验收结果（6 只，2000×1250，`__npr.startBattle(index)`）

**本体占屏高**（iso − iso-empty 差分，掩膜已由叠加图确认只覆盖角色本体、不含地面阴影）：

| 角色 | 第一轮 | 第二轮 | **第三轮** |
|---|---|---|---|
| 奶猫 | 31.0 | 38.40 | **37.76%** |
| 奶屎 | 28.9 | 36.64 | **35.20%** |
| 奶蛙 | 27.6 | 36.24 | **35.12%** |
| 奶粉 | 26.2 | 35.44 | **34.64%** |
| 西格玛 | 25.8 | 33.76 | **32.56%** |
| 奶鱼 | 17.5 | 29.44 | **29.28%** |

**结论：5/6 ≥ 30%**（奶鱼 29.28% 唯一未过，在 28–30% 目标带内，且仍小于队友）。

**HUD 遮挡（第三轮新修，客观判据）**
- HUD 键位条选择器 `#ui .hud-keys`，`getBoundingClientRect().top = 942` CSS px → `topCanvas = 1177.5`（×1.25）。
- 判据 `footY < topCanvas − 6` 且 `topY > 0`：

| 角色 | footY | topY | 距 HUD 顶边 | 结果 |
|---|---|---|---|---|
| 奶蛙 | 1101 | 663 | +76.5px | PASS |
| 奶粉 | 1105 | 673 | +72.5px | PASS |
| 奶猫 | 1156 | 685 | **+21.5px（最紧）** | PASS |
| 奶屎 | 1132 | 693 | +45.5px | PASS |
| 奶鱼 | 1061 | 696 | +116.5px | PASS |
| 西格玛 | 1100 | 694 | +77.5px | PASS |

**6/6 PASS**，头顶不出界。证据 `v3-show3-foot-check.json`（含完整 rect 与逐只判据，可复现）。

**剪影 IoU**（iso 差分掩膜，15 对）：`maxFixed = 0.765`（奶猫-奶屎）、`maxShape = 0.787`（奶蛙-奶屎），**全部 < 0.90**。

**渲染质量**
- 纯白过曝 `nearWhite(>240) = 0.41%`、`blown(>250) = 0.07%`、`mean ≈ 110–112.5`；相比第二轮（1.25% / 0.143% / 116.0）**进一步下降**。
- 控制台 error = 0（`favicon.ico 404` 未出现）。
- 主图与 iso/bg/clean 帧 `stateSame=FULL`（camPos/camQuat/fov/groupPos/wrapperScale 逐项相同），人图对应 `hudMatch 6/6`，`visibleGroups` 恒单元素。

## 四、dist 一致性（对视频重录/部署线最重要）

- 共用 `dist/` 最近一次构建为 **2026-11-09 21:49（压缩版 746 KB）**，只包含**第一轮**展示层改动。
- **不包含第二、三轮**（distance 3.8 / fov 40 / lookAtHeight 0.7 / 奶鱼 visualScale 1.2）。
- **录视频前必须用当前源码重建 `dist/`**，否则录出来的是"角色偏小 + 脚被 HUD 压住"的旧版本。
- 本线不写 `dist/`，重建由收口线执行。

## 五、`--minify` 白屏风险：已降级为"待实测"

此前记录"`--minify` 把 `this.currentBgm` 压成裸变量导致白屏、构建必须 `--minify false`"。**当前 vite 8.3.6 + 当前源码不复现**：
- `package.json` 的 build 就是 `vite build`（无 `--minify false`）；
- 21:49 压缩产物内 `this.currentBgm` 完整保留（`this.currentBgm=null` / `!==e` / `=e`），无裸标识符。
- 本轮截图仍统一用 `--minify false` 以保证证据链稳定，但**该缺陷不再构成"构建必须关压缩"的硬约束**；正式发布前仍需一次真实加载验证。

## 六、已知风险（交付前需知）

1. **奶猫余量最小（+21.5px）**：判据仅对 viewport 1600×1000 / dpr 1.25 成立；若 HUD 变高、字号放大或换视口/DPR，可能再次压线。
2. **屏占对 idle 动画相位敏感**：同一机位下不同冻结帧之间有 0.16–1.52 点浮动，应视为近似值。
3. **仅测 idle 冻结帧**：走路/攻击前倾时脚底位置会变，未覆盖。
4. **bloom 双入口不一致**（外部线既有问题，非本线）：`main.mjs` L79 `bloomStrength … 0.22` 与 L120 `postBloom(true, 0.16)` 不同；本轮实测截图生效值为 **0.22 + threshold 0.88 + radius 0.35**。切质量档会跳变。
5. **口径坑**：不要用"行宽骤降拐点"或"饱和度/色相分割"去剔阴影——实测会把尾巴/后腿、或深色角色（西格玛）本体误剔，得到错误偏低的数字。本轮掩膜经叠加图确认已干净。

## 七、产物清单

- 截图：`docs/evidence/v3-show3-00..05-*.png`（2000×1250 RGB）
- 伴生帧：`v3-show3-bg-0X.png`、`v3-show3-clean-0X.png`、`v3-show3-iso-0X.png`、`v3-show3-iso-empty-0X.png`
- 读数：`v3-show3-metrics.json`、`v3-show3-foot-check.json`、`v3-show3-iou.json`、`v3-show3-pixel-metrics.json`
- 拼图：`v3-show3-family-sheet-20261109.png`（3×2）、`v3-show3-foot-diagnostic.png`（6 行底边裁剪 + 红/绿判据线）
- 构建：`.tmp-dist-show3`（隔离，`--minify false`，50 modules，1.26s）
- 脚本：`scripts/capture-show3.mjs`、`scripts/measure-show3.py`

## 八、与全局 6 步的衔接

`final-alignment` 第 3 步验收线为"**≥4 只可辨剪影**"。按本文：**6/6 视觉可辨 + 6/6 脚脱离 HUD + 5/6 本体占屏 ≥30% + IoU 全部 <0.90**，**该条件已超额满足**。

剩余动作只有一条：**重建 `dist/` 后录 32s 视频**。
---

## 九、收口补充（2026-11-09 23:30）：minify 已解除 + bloom 归属与建议

### 9.1 `--minify` 白屏**已解除**（交付阻断消除）

用**默认 minify**（不加 `--minify false`）构建 `.tmp-dist-minify`，并做真实浏览器加载：

| 判据 | 结果 |
|---|---|
| `Runtime.exceptionThrown` | **0** |
| console error / assert | **0** |
| HTTP ≥400 | 2 条，均为 `favicon.ico` 404（无 GLB/JS/CSS 404） |
| 运行时 `currentBgm` | **`"battle"`**（audio 模块正常） |
| triangles / mean / uniqueColors | 188,350 / 106.23 / 118,026 |
| 压缩产物 `this.currentBgm` | 6 处全为 `this.currentBgm`，**裸标识符 0 处** |

体积：`50 modules`，JS **757.67 kB（gzip 195.78）** = `--minify false` 版（1713.95 kB）的 **44.2%**。

**结论：不再需要 `--minify false`。** 此前"必须关压缩才能跑"的结论**作废**。
证据：`v3-minify-verify-20261109.png/.json`、`v3-minify-off-verify-20261109.png/.json`、`v3-minify-pixel-metrics-20261109.json`。

### 9.2 bloom 双入口已从机制上消除

- `src/main.mjs` L120 改为 `postfx.setBloom(true)`（**不传强度**），沿用构造期 L79 的 `bloomStrength`。
- 实测切档：`low → {enabled:false, strength:0.4}`、`high → {enabled:true, strength:0.4}`，**不再漂移到 0.16**。
- **唯一强度来源 = L79，归世界线维护**；角色线不再持有第二份 bloom 值。

### 9.3 请世界线确认：当前 bloom 参数显著软化角色细节

| 参数（同帧 A/B，只差参数） | 角色区 p50 | p95 | 动态范围 | **局部对比度** | nearWhite |
|---|---|---|---|---|---|
| 0.22 / thr 0.88 / r 0.35 | 92.0 | 199.3 | 129.0 | **0.71** | 0.46% |
| **0.40 / thr 0.68 / r 0.50（现值）** | 120.3 | 225.7 | 138.0 | **0.53（−25%）** | 2.02% |

- `nearWhite` 像素 **100% 落在背景霓虹区**，**角色区纯白像素 = 0**（没有死白块）；
- 但角色区**局部对比度 0.71 → 0.53（−25%）**：高光外溢把边缘糊软，细节可读性下降；
- **建议（供世界线决策，角色线不改此值）**：把 `bloomThreshold 0.68 → 0.72~0.75`，预计 `nearWhite` 回落到 1% 量级、局部对比度回升；`strength 0.40`、`radius 0.50` 可保留以维持霓虹氛围。
- 若世界线确认"这就是想要的氛围"，角色线不再主张。但**录视频前请两线对一次取值**，避免录完又改。

> 角色线立场：过曝不是"角色被洗白"级缺陷（无纯白块），而是**细节锐度下降 25%**；既然 `main.mjs` 的 bloom 唯一来源已归世界线，是否调整由世界线定。