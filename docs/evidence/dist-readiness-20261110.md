# dist 交付确认单：能否直接录 32s 视频

- 生成：2026-11-10（交付演练M / team task 20）
- 验证对象：`E:\naiwa-zzz\dist`（**只读**：未重建、未改 `src/`、`public/`、`dist/`）
- 浏览器：Chrome 154.0.8037.93（headless=new 与 headful 都跑过）
- 视口：1600×1000 CSS @ dpr 1.25 → 画布/截图 **2000×1250**
- 驱动方式：静态服务 + CDP **同一 node 进程**（根路径 `/`，端口 5292，占用则 5293/5294）；全部动作走 **真实** `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`（+40px 目标准备、真实光标坐标）

---

## 0. 一页结论

### ⛔ **当前 dist 不能直接录：角色模型根本没渲染出来。**

| 判定项 | 结论 | 证据 |
|---|---|---|
| 功能链路 | ✅ 全通（title→select→battle→拖拽→弹反→三段终结→计时，全部真实输入） | 5 步读数见 §2 |
| **画面** | ❌ **FAIL：3D 角色不可见**（只剩暗色轮廓/阴影，街道与 HUD 正常） | 截图 01/04 + `analyzeImage` 复核："角色呈现深暗色/半透明阴影色块，未渲染出正常材质" |
| **根因（已定位到行）** | ❌ NPR 片元着色器**缺 `uniform vec3 uKeyDir;` 声明**，却在 `vec3 keyDir = normalize(uKeyDir);` 使用 → 编译失败 → `useProgram: program not valid` | 8 条 `THREE.WebGLProgram: Shader Error ... 'uKeyDir' : undeclared identifier`；**256 条** `WebGL: INVALID_OPERATION: useProgram: program not valid`；随后 `too many errors, no more errors will be reported`。源码：`src/render/npr.mjs` L89 注入 `shader.uniforms.uKeyDir`、L137 使用，但 L116–126 的 uniform 声明块里**没有** `uKeyDir` |
| 帧率 | ⚠️ 同一构建实测 `avgFps 32.55 / p50 39.84 / p5 14.99`，**但这个数字不可用于验收**：角色程序无效被跳过，渲染负担变轻 | 反证：上一构建（角色正常）同流程只有 **8.19fps** |
| 计时器（历史缺陷） | ✅ **活的，但口径是正计时** | 第 1 步 `00:00` → 第 5 步 `00:13`；`battle.timer` 为 `undefined`（不是 90、也不递减） |

**给收口线的一句话**：**先修 `uKeyDir` 未声明（npr.mjs），重建后重跑本单**；修好之前录出来是"有街景、无角色"的空镜。修好后仍需按 §4 的参数（`--use-angle=d3d11 --use-gl=angle` + 降分辨率）才能到 30fps。

---

## 1. 产物绑定（dist 在本次工作期间被外部重建 5 次）

| # | 构建时间 | JS 产物 | 大小 | sha256(前12) | 本单结论 |
|---|---|---|---|---|---|
| A | 00:09（任务书声称） | `index-C4445zkB.js` | 758.69 kB | — | **磁盘上已不存在**，未验证 |
| B | 00:14:59 | `index-Dv9w8Cud.js` | 759,886 B | `fc0df2b7…` | 5 步全通、角色可见、**console error 0**；证据留档 `v3-run-*-build001459.png` |
| C | 00:38:31 → 00:44:22 | `index-iKSx0O26.js` | 762,250 B | `91841e94…` | 5 步全通、角色可见、**console error 0**；`distBefore==distAfter`；证据留档 `v3-run-*-build004422.png` |
| D | 00:51:23 | `index-wlWr8wbF.js` | 762,252 B | `a24227cf…` | 功能跑通但**连段只到第 1 段**（低帧率下盲按落在段外）；`distBefore==distAfter` |
| E | 00:53:30 / 00:56:32（内容相同） | **`index-B3F5S2WL.js`** | **762,184 B** | **`a5261974…`** | **本单绑定版本：5 步功能全通，但角色不可见（shader 编译失败）** |
| — | `dist/index.html` | — | 4,499 B | `ecfd2bdd…` | 与 E 配套；`index-C7Q5dz7d.css` 16,172 B `40bd1b82…` |

- **运行期一致性**：最后一轮 5 步验证的 `distBefore` 与 `distAfter` 哈希**逐项相同**（`index.html ecfd2bdd` + `index-B3F5S2WL a5261974` + css `40bd1b82`）→ 证据期间 dist 未被中途改写；00:56:32 的重建**内容哈希不变**（只是 mtime 变）。
- **口径偏差（如实披露）**：leader 消息要求绑定 `index-BE_0vuUu.js` / `097c4147…`，**该文件从未在磁盘上出现过**（本机 5 次重建里没有这个哈希）；任务书所述 `index-C4445zkB.js`（00:09）也已被覆盖。
- src 快照：`src/main.mjs` 00:51:08（26,843 B）／`src/render/npr.mjs` 00:53:29／`src/game/tuning.mjs` 22:44:33（2,134 B）／`src/vfx/cinematic.mjs` 23:51:48（6,410 B）。

---

## 2. 五步通过表（数值全部来自 `v3-run-20261110.json`，当前构建 E）

| # | 步骤 | 功能 | 画面 | 支撑数值 | 截图 |
|---|---|---|---|---|---|
| 1 | 开局 battle | ✅ PASS | ❌ **FAIL（角色不可见）** | `activeName=奶蛙`（`shell_naiwa`，0/16），`visibleGroups=1`（16 个 group 仅 1 个 visible，`allMemberNames` 16 只齐全），对手 `visible=true` HP 200/200；`renderer.info`（`autoReset=false`+`reset()`+双 rAF）tri **375,512** / calls **608**，主场景单渲 tri **187,740** / calls **288**；canvas **2000×1250**，`pixelRatio 1.25`，`fov 40`，`exposure 0.85`，`shadowMapType 1 (PCFShadowMap)`，bloom 0.4；HUD `00:00` | `v3-run-01-start-20261110.png`（角色=暗色轮廓） |
| 2 | 拖拽绕行 | ✅ PASS | ✅（背景/机位变化清晰） | 真实鼠标拖 **600 CSS px**：`camera.position` 拖前 `(6.200,1.600,2.200)` → 拖后 `(5.848,1.600,-2.677)`，**位移 4.890**；拖回后残差 **0.001**（4s 内多点采样直到收敛） | `v3-run-02-drag-20261110.png` |
| 3 | 弹反（Shift） | ✅ PASS | ✅（拟声词可见） | 轮询 `counter.isWarning=true` 瞬间真实按 Shift：`state=success`、`perfect=true`、`damage=23`、`gridGain=2`、`punishS=1.56`；`.hit-flash` 峰值 **0.45**（heavy 理论值 0.45）；`.sfx-word` 1 个 = `咚——`（heavy） | `v3-run-03-parry-20261110.png` |
| 4 | 终结（空格连打） | ✅ PASS | ⚠️（白闪/拟声词正常，但角色仍不可见） | 连打 3 个 burst 推到 stage 2，第三段内再按 → **FINISHER 分支**：`stage=-1`、`freezeT=0.301`；`.hit-flash` 峰值 **0.700**（ultimate 理论值 0.7）；拟声词 6 条（含 `碎！`、`终结！` ultimate）；冲击波 `userData.maxRadius **3.5**`，实测最大 `scale.x **3.293**`；对手 HP 200→63 | `v3-run-04-finisher-20261110.png` |
| 5 | 计时器 | ✅ PASS | ✅ | HUD `#hud-elapsed`（标签 `ELAPSED`）：第 1 步 **`00:00`** → 第 5 步 **`00:13`**；`battle.timer = undefined`、`battleStats.elapsed = 13.80` | `v3-run-05-timer-20261110.png` |

### 2.1 计时器：历史"恒 90"缺陷的明确证实/证伪
- HUD 文本来自 `battleStats.elapsed += rawDt`（每帧累加，仅 `inBattle` 时写 HUD）→ **正计时，且实测在走**（00:00 → 00:13）。
- `battle.timer = TUNING.roundTotalS`，而 `TUNING` **没有 `roundTotalS` 键** → 运行时为 `undefined`；全仓无任何代码递减它。**"恒 90 倒计时"已不存在（限时玩法被移除）**，但 `battle.timer` 成为死字段。录制时**不要**把 HUD 当倒计时。
- 注意：低帧率下 `rawDt = min(delta, 0.05)` 会让逻辑时间**慢放**（曾实测 16.1s 逻辑时间 / ~36s 墙钟 ≈ 0.45×）；构建 E 帧率较高，13.80s 逻辑 ≈ 18s 墙钟。

### 2.2 操作口径（录制必读）
**长按空格不蓄力**：`keydown` 里 `if (e.repeat) return;`。要出终结必须**连按**：3 次出第三段（该段命中即为 ultimate 打击反馈），**第 4 次（在第三段内）**才进真终结（`ACTION.FINISHER` + `onFinisher` 慢镜/环绕）。
**低帧率下连按会掉段**：构建 D 上 140ms 盲按 + 每次 CDP 读取，结果 14 次按压都停在 stage 0（缓冲窗口按**逻辑时间** 0.6×段时长计，被 CDP 往返拖到段外）。最终改用「4 连发 × 70ms、中间不 eval」才稳定推进。

---

## 3. 性能三张表

### 表① 后端对照（同机器、同 dist、同流程）
| 轮次 | 启动参数 | 2000×1250 | 1000×625 |
|---|---|---|---|
| default | `--headless=new --enable-gpu --ignore-gpu-blocklist` | **1.34fps**（avgMs 747.7，p5 0.49，worst 3864ms） | **2.56fps**（worst 2103ms） |
| angle-d3d11 | 上 + **`--use-angle=d3d11 --use-gl=angle`** | **15.47fps**（avgMs 64.6，p50 17.12，p5 7.05） | **46.21fps**（avgMs 21.6，p50 59.88，p5 23.92） |

两轮的 `UNMASKED_RENDERER_WEBGL` 相同：`ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11)` → **差距来自启动参数选的 GL/ANGLE 通道，不是换显卡**。

### 表② 分辨率 × bloom（每档预热 80 帧后测 120 帧）
| 档位 | 画布 | headless avg fps | headful avg fps |
|---|---|---|---|
| A 2000×1250 bloom-on | 2000×1250 | 4.15（p50 8.55，p5 1.05，worst 1368ms） | 7.24（p50 7.63） |
| B 2000×1250 bloom-off | 2000×1250 | 11.88 | 8.00 |
| C 2000×1250 无后处理 | 2000×1250 | 15.30 | 8.98 |
| D 1920×1080 bloom-on | 1920×1080 | 6.43 | 7.69 |
| E 1280×800 bloom-on | 实际 1600×1000（见下） | 6.09 | 11.12 |

> **E 档的坑（给录制线的警示）**：`Emulation.setDeviceMetricsOverride` 改了 dpr，但 `renderer.setPixelRatio()` 只在构造期取一次、resize 不重取 → **画布仍是 1600×1000**。"改 dpr ≠ 改渲染分辨率"。

### 表③ JS vs 帧间隔（rAF 回调包裹计时，60 帧，构建 C）
| 指标 | avg | p50 | p95 | max |
|---|---|---|---|---|
| 每帧 **JS** 占主线程 | **13.35ms** | 12.90 | 18.40 | 19.40 |
| 帧 **间隔 gap** | **93.35ms** | 77.20 | 233.70 | 308.40 |

同会话对照：空页 rAF **118.58fps**（headless）/ **119.56fps**（headful）；2000×1250 纯 WebGL 清屏 **100.41fps** / **27.79fps**（headful）；每帧忙等 20ms 仍有 46.6fps。
→ 主线程与 GPU 单帧都解释不了 93ms 帧间隔；瓶颈在"游戏画布（MSAA + HalfFloat composer + 上屏）"的呈现/同步链，且本机有 `GameViewer Virtual Display Adapter`，**同配置多次测得 1.34–15.47fps、反复出现 ~2s 最差帧**。**此类 fps 数字只能按数量级使用。**

---

## 4. 录制参数建议（修好 shader 后照此执行）

1. **启动参数必带**（默认后端 1.34fps 不可用）：
   ```
   --use-angle=d3d11 --use-gl=angle
   --enable-gpu --ignore-gpu-blocklist --enable-gpu-rasterization
   --disable-background-timer-throttling --disable-renderer-backgrounding
   --disable-backgrounding-occluded-windows
   ```
2. **画布尺寸 / dpr 档位**（实测值，未实测的组合不臆造）：
   | 档位 | 画布像素 | 实测 fps | 备注 |
   |---|---|---|---|
   | 高画质 | 2000×1250（1600×1000@1.25） | 15.47（d3d11） | 最锐，只够 15fps |
   | 中画质 | 1000×625（800×500@1.25） | 46.21（d3d11） | 能过 30fps，画质明显降 |
   | 备选**未实测** | 1920×1080 / 1280×800 @dpr1.0 | — | 需先实测；改 dpr 时确认画布真的变了 |
3. **帧率上限**：显示器 120Hz、空页 120fps → **不要追 60/120fps**，容器按 **30fps** 即可。
4. **锁死相机（录制纪律）**：不拖拽鼠标（拖 600px → 相机位移 4.89）；不按 `[` `]`、`N`（走 `restyleAll()` 重编译材质，掉帧尖峰）；不进设置改画质（`onSetQuality('low')` 会关 bloom）；不按 `Tab/Q/E/数字键`（换壳即换招，节奏与机位演出都变）。
5. **若目标 30fps 而只有 15fps**：
   - 首选降档到 1000×625（46fps）录制，后期放大到 2000×1250；
   - 次选 15fps 实录 → **0.5× 慢放 + 重定时 30fps**；**32s 成片需 ~64s 素材**，且低帧率下逻辑时间本就慢放（≈0.45×），再慢放会让顿帧/慢镜演出显得拖沓；
   - 不建议"补帧"：200ms 的冲击波/速度线残影会被插成拖尾。

---

## 5. 录制期内已知噪声（原样列出）

| 类型 | 内容 | 判定 |
|---|---|---|
| **console error（阻断）** | `THREE.WebGLProgram: Shader Error 0/1282 - VALIDATE_STATUS false … 'uKeyDir' : undeclared identifier`（8 条，含 dimension mismatch / normalize undefined） | **不是噪声：NPR 材质程序无效，角色不可见**。根因见 §0；修复点 `src/render/npr.mjs` L116–126 缺 `uniform vec3 uKeyDir;` |
| **warning（阻断关联）** | `WebGL: INVALID_OPERATION: useProgram: program not valid` **×256**，末尾 `WebGL: too many errors, no more errors will be reported` | 同上，程序未编译成功 |
| HTTP | `GET /favicon.ico` → **404 ×2** | 不影响画面；可在静态服务给 favicon 兜底 |
| warning | `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.` | 不影响画面；**待办**：`main.mjs` 换 `THREE.Timer` |
| warning | `THREE.WebGLProgram: Program Info Log:` HLSL `X3595`（gradient in loop）×2 + `X4000`（f_ApplyFXAA 未初始化） | 驱动编译警告，画面正常 |
| 运行期异常 | `Runtime.exceptionThrown` **0**；`Log.entryAdded(level=error)` **0**；`Network.loadingFailed` **0** | minify 产物无 `currentBgm` 类 ReferenceError |
| 对照（构建 B/C） | 同一流程 `console error 0`、警告仅 2 条、角色可见 | 证明 B/C 无此回归 → 回归引入于 00:53 的 `npr.mjs` 改动 |

---

## 6. 可复用命令

```bash
# 0) 五步验证（真实输入；含 distBefore/distAfter 哈希快照）
node docs/evidence/v3-run-driver-20261110.mjs --port 5292 \
  --out-prefix v3-run --date 20261110 \
  --json docs/evidence/v3-run-20261110.json \
  --log  docs/evidence/v3-run-driver-20261110.log

# 1) 后端对照（默认 vs --use-angle=d3d11）
node docs/evidence/v3-run-gpu-diag-20261110.mjs

# 2) 分辨率 × bloom 分档（加 --headful 出真实窗口基准）
node docs/evidence/v3-run-bench-20261110.mjs
node docs/evidence/v3-run-bench-20261110.mjs --headful

# 3) 合成成本（composer vs direct，gl.finish 同步）+ HUD/画布隐藏 A/B
node docs/evidence/v3-run-composer-probe-20261110.mjs

# 4) 每帧 JS vs 帧间隔
node docs/evidence/v3-run-js-profile-20261110.mjs

# 5) 环境 rAF 天花板（空页 / 2000×1250 纯 WebGL 上屏）
node docs/evidence/v3-run-raf-ceiling-20261110.mjs
```

驱动流程：`Page.navigate` → 轮询 `window.__npr` → 真实点击 `#screen-title [data-action="start"]` → 等 `screens.current==="select"` → 真实点击 `#screen-select [data-action="confirm"]` → 等 `==="battle"` → 等 1.5s → `mousedown/mousemove×12/mouseup` 拖 600px（再拖回并等收敛）→ 轮询 `counter.isWarning` 命中瞬间派发 Shift → 空格 4 连发 × N 轮 → 第三段内再按触发 FINISHER → 读 `#hud-elapsed`。
所有读数只走 DOM 选择器与 `window.__npr`（`battle/squad/opponent/camera/renderer/postfx/counter/combo/screens`），不 grep 压缩产物内部变量名。

---

## 7. 风险与失效条件

1. **本单只对 `index-B3F5S2WL.js`（sha256 `a5261974…`，762,184 B）成立**；`distBefore==distAfter` 已验证，00:56:32 重建内容哈希不变。**若再被重建（工作期间已 5 次），必须重跑。**
2. **shader 回归未闭环**：`uKeyDir` 未声明属**阻断级**缺陷，修好后需重建 + 重跑本单（尤其重看截图 01/04 是否出现完整角色）。
3. **fps 数字的构建依赖性**：构建 E 的 `32.55fps` 是"角色程序无效、渲染变轻"的产物，**不能作为性能验收依据**；可用的是构建 C 的 8.19fps 与表①/表② 的同构建对照。
4. **环境噪声**：`GameViewer Virtual Display Adapter` 使同配置 fps 横跨 1.34–15.47，反复出现 ~2s 最差帧；录制机必须现场做一次"空页 rAF + 游戏 rAF"两点测量。
5. **其他未闭环项（只记录未修复）**：`battle.timer` 死字段；`THREE.Clock` 弃用；改 dpr 不改变渲染分辨率；默认后端 1.34fps 的通道差异未深挖。
6. **端口**：5292–5298、5301–5304 均无 LISTENING；**5299 被另一个 node 进程（PID 33716，00:34:15 启动，非本任务）占用**，未干预。本任务创建的 20 个 `%TEMP%\naiwa-*` Chrome profile 已全部清理。

---

## 8. 附录：产物清单（均在 `docs/evidence/`）

| 文件 | 说明 |
|---|---|
| `v3-run-20261110.json` | 当前构建 E 五步全量读数（distBefore/distAfter 同哈希） |
| `v3-run-01-start` / `02-drag` / `03-parry` / `04-finisher` / `05-timer` `-20261110.png` | 5 张 2000×1250 截图（构建 E，角色不可见） |
| `v3-run-*-20261110-build004422.png` + `v3-run-20261110-build004422.json` | 构建 C 同流程证据（角色可见、console error 0） |
| `v3-run-*-20261110-build001459.png` + `v3-run-20261110-build001459.json` | 构建 B 同流程证据（最早一轮） |
| `v3-run-gpu-diag-20261110.json/.log` | 后端对照 |
| `v3-run-bench-20261110.json` / `-headful.json` | 分辨率×bloom 分档 |
| `v3-run-composer-probe-20261110.json` | composer/direct 帧成本 + HUD/画布隐藏 A/B |
| `v3-run-js-profile-20261110.json` | JS vs 帧间隔 |
| `v3-run-raf-ceiling-20261110.json` | 空页 / 纯 WebGL 上屏天花板 |
| `v3-run-frame-probe-20261110*.json` | 阴影/描边/尺寸单因子探针（结论：均非主因） |
| `v3-run-*.mjs`（6 个） | 可复用驱动与诊断脚本（只读 dist） |