# 角色线交接单 · 2026-11-09 23:40

> 本线（角色/展示层/换人/HUD/镜头/计时）向**收口线**与**世界线**同步状态。
> 双方没有消息通道，只能靠文件对齐；请读到后按各自职责处理，**不要互相回退对方的改动**。
> 权威细节见 `show-layer-status-20261109.md`（本线定稿，三轮数据 + 构建结论）。

## 一、本线已完成，可直接进入录制

| 项 | 状态 | 证据 |
|---|---|---|
| 展示层三轮定稿 | ✅ | 6/6 剪影可辨、6/6 脚离 HUD、5/6 本体占屏 ≥30%、IoU 全部 <0.90 |
| `--minify` 白屏 | ✅ **已解除** | 默认 minify 真跑：`exceptionThrown=0`、`currentBgm="battle"`、188,350 tri |
| bloom 双入口不一致 | ✅ **已治本消除** | `setBloom(true)` 不再传强度，唯一来源 = L79 |
| `visualScale` 奶鱼补偿 | ✅ 落盘生效 | `squad.mjs L77/L94`、`main.mjs L160` |

## 二、交付前置

1. ~~用当前源码重建 `dist/`~~ → **已由收口线于 2026-11-09 00:09 重建完成，且已含全部改动**。
   产物实测（`grep` `dist/assets/index-C4445zkB.js`）：`fovVertical:40,height:1.6,distance:3.8,lookAtHeight:.7,sideOffset:2.2`、`visualScale`、`userAngle`/`userOrbit`、`PCFShadowMap` 全部命中 → **无需再重建，可直接录**。
2. **构建方式已无约束**：`npm run build`（默认 minify）已验证可跑，**不再需要 `--minify false`**；产物 758.69 kB / gzip ≈196 kB。
3. **录制前请两线对一次 bloom 取值**（见 §三），避免录完又改。
4. ⚠ 唯一例外：若 `main.mjs` 在 **00:09 之后**再被改写，`dist` 需重建一次。当前 `main.mjs` mtime 00:05 < dist 00:09，两者一致。

## 三、请**世界线**确认：bloom 当前参数软化角色细节

同帧 A/B（只差参数）：

| 参数 | 角色区局部对比度 | nearWhite |
|---|---|---|
| 0.22 / thr 0.88 / r 0.35 | **0.71** | 0.46% |
| **0.40 / thr 0.68 / r 0.50（现值）** | **0.53（−25%）** | 2.02% |

- `nearWhite` 100% 在背景霓虹，**角色区纯白像素 = 0**（无死白）；
- 但角色区细节锐度下降 25%（高光外溢把边缘糊软）；
- **建议**：`bloomThreshold 0.68 → 0.72~0.75`，`strength 0.40` / `radius 0.50` 保留。
- **角色线不改此值**，由世界线定。

## 四、现场核实：**命中演出已完成，不要再重复做**

代码与文件都已存在，且今晚 22:31 还在更新：

| 文件 | 内容 | mtime |
|---|---|---|
| `src/vfx/hitflash.mjs` | 白闪（light .15 / medium .30 / heavy .45 / **ultimate .70**）+ 拟声词（咚/啪/轰）+ 画面震动 | 22:31 |
| `src/vfx/impact.mjs` | 冲击波 + **SpeedLines 速度线**（6/8/12/16 条）+ 光效粒子，四档 `light/medium/heavy/ultimate` | 19:51 |
| `src/main.mjs` | 已接线：L33 导入、L255 白闪+拟声词、L259 `impactFx.hit()`、L265 `cinematic.onHit()`、L266-271 顿帧、L643 `_flashOpponentRed()` | 23:20 |

**角色线不做重写**，只做「运行时是否真生效」的验证（代码有 ≠ 运行时生效）。

## 五、角色线下一批要动的文件（避免撞车）

- `src/main.mjs`（**共享热点**，camAngle 接线；改前登记 `docs/改动记录-角色线.md`）
- `src/vfx/cinematic.mjs`（消费 `orbitAngle`）
- 若验证命中演出不生效，才最小修 `src/vfx/hitflash.mjs` / `src/vfx/impact.mjs`（制作人已授权"命中演出"范围）

## 六、角色线尚未做的欠账

- 16 个 GLB 首屏全量并发加载（一次拉 ~3.6 MB，任意时刻只 1 只可见）→ 是否优化待定。
- 其余（视频、部署、台账、冻结 tag）均归收口线那 6 步。

## 七、真缺口已清零（2026-11-09 00:10 复核）

| 项 | 结果 |
|---|---|
| `camAngle` | ✅ **已接线**：`main.mjs` `camAngleRaw` → `clamp(±1.2 rad)` → `cinematic.userAngle` → 帧率无关阻尼 `userOrbit` → 绕 Y 轴守恒环绕。实测拖拽 600px：camera 位移 **4.9187**、转角 1.203 rad、半径 4.31→4.37（守恒）；回拖归零残余 3.6°（阻尼尾差，非逻辑错误）。HUD「拖动旋转」文案与行为一致。 |
| 命中演出 | ✅ **运行时已验证 4/4 项可区分**：白闪 0.45 vs 0.70、速度线 12 vs 16、冲击波半径 2.4 vs 3.5、拟声词 heavy「咚/砰」vs ultimate「轰/绝杀」。`hitflash.mjs` / `impact.mjs` **未修改**（原实现已生效）。 |

证据：`v3-cam-before/after-20261109.png`、`v3-hit-heavy/ultimate-20261109.png`、`v3-hit-cam-probe-20261109.json`、`v3-cam-dragcheck-20261109.json`；构建 `.tmp-dist-cam`（50 modules / 1709.56 kB / 1.02s，`--minify false`）。
---

## 八、暂停快照（2026-11-10 01:20，制作人指示暂停）

### 8.1 新增闭合：`uKeyDir` 着色器回归（阻断级，已修复）

外部线 00:53 改 `src/render/npr.mjs` 时注入 `shader.uniforms.uKeyDir`（L89）并在 GLSL 用 `normalize(uKeyDir)`（L138），但 uniform 声明块漏了 `uniform vec3 uKeyDir;` → `Shader Error 1282 'uKeyDir' : undeclared identifier` → **角色整体不渲染**（只剩暗色块），连带 `useProgram: program not valid` ×256。

**已补回该声明（L124，1 行）**。修复后实测：

| 判据 | 坏版 | 修复后 |
|---|---|---|
| console error | 8（shader） | **0** |
| `useProgram: program not valid` | ×256 | **0** |
| 角色区黄色像素占比 | **0.10%** | **13.19% / 15.80%**（两轮） |
| 角色区 meanLuma | 35.94 | 90.27 / 94.57（同口径"已确认可见"构建 C = 91.09） |

> 口径教训：`meanLuma ≥ 100` 这条线是拿单样本（构建 B 111.71）拍的错阈值，改用**黄色像素占比 ≥5% + analyzeImage 结构复核**。详见 `pixel-threshold-calibration-relative-baseline` 记忆。

### 8.2 `dist/` 状态：已就绪，**不需要重建**

- 文件：`dist/assets/index-Bdgxfg97.js`，762,215 B，`sha256 cfa09a96…`，mtime 2026-11-10 01:04。
- 外部线在 00:59 / 01:04:42 重建两次，**内容 hash 不变**，且与本线隔离构建产物**同名同 hash** → 已含 `uKeyDir` 修复。
- 结论绑定 `cfa09a96…`；**若之后 dist 再被重建，本确认单失效，需按 sha256 重跑**。

### 8.3 五步复验全通（真实输入，2000×1250）

开局 ✅（奶蛙 0/16、对手 HP 200/200、tri 187,740 / calls 288）· 拖拽 ✅（位移 4.822，`rel` 方位角 +68.75°）· 弹反 ✅（damage 23、白闪 0.45、「砰！！」）· 终结 ✅（`stage→-1`、freezeT 0.355、白闪 0.700、maxRadius 3.5，四条件齐）· 计时 ✅（`00:00→00:17` 正计时）。

### 8.4 ⚠ 唯一未决项：录制帧率

| 后端 @2000×1250 | avgFps | p50 | p5 |
|---|---|---|---|
| default | **12.67** | 14.95 | 7.49 |
| `--use-angle=d3d11 --use-gl=angle` | **14.61** | 15.02 | 7.98 |

30fps 成片的三条候选路径（**属交付级决策，制作人说要先暂停，未择定**）：
1. **保画质**：2000×1250 录 15fps 素材 → 时间轴 0.5× 慢放 + 重定时到 30fps（32s 成片 ≈ 16s 游戏时间，运动变慢但更有演出感）
2. **换帧率**：降到 1000×625（历史 46.21fps）录实速，输出分辨率低
3. **关 bloom**：保留分辨率但丢霓虹泛光（ZZZ 调性）

### 8.5 恢复时的第一步

1. 先核 `sha256` 是否仍为 `cfa09a96…`（dist 可能又被重建）
2. 若已变，按 `docs/evidence/dist-fix-20261110.md` 的脚本重跑五步 + 像素复核
3. 再按制作人择定的录制路径执行；**录制时锁死相机**（不按 `[` `]` `N` `Tab` 数字键，拖拽会转 68.75°）

### 8.6 已知遗留（不影响录制）

`battle.timer` 死字段（正计时已替代）· `THREE.Clock` 弃用警告 ×1 · HLSL X3595/X4000 警告 · `favicon.ico` 404 ×2 · 16 个 GLB 首屏全量并发加载（~3.6 MB）未优化。