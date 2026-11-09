# 脏玻璃 HUD 规范 · 2026-11-09

给接 HUD 的会话。**底子硬、玻璃脏、文字实**——玻璃只装信息（计时 / 失衡条 / 接力提示），不抢画面。
基线来自主仓库 `src/ui/style.css` 的 T0–T4 配方与 `src/ui/hud.mjs` 的 `applyGlassBudget()`，都是实测过的值，别另起一套。

## 1. 可直接抄的面板样式

```css
.plate {
  background: var(--tier-plate-bg);           /* 实底，见 §4 */
  backdrop-filter: var(--tier-glass);          /* 只写标准形式，见 §7 */
  border: 1px solid var(--tier-plate-edge);
  border-radius: calc(var(--u)*12px) calc(var(--u)*4px) calc(var(--u)*12px) calc(var(--u)*4px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08),
              inset 0 -1px 0 rgba(0,0,0,.4),
              0 calc(var(--u)*3px) calc(var(--u)*12px) rgba(0,0,0,.45);
}
.plate::before {                               /* 顶部黄黑警戒条 */
  content: ""; display: block; height: 3px;
  background: repeating-linear-gradient(135deg,#f5c542 0 8px,#101018 8px 16px);
}
.plate::after {                                /* 脏层：扫描线 + Ben-Day 网点 */
  content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .3;
  background: repeating-linear-gradient(180deg,rgba(0,0,0,.22) 0 1px,transparent 1px 3px),
              radial-gradient(circle,rgba(0,0,0,.18) 1px,transparent 1.2px);
  background-size: auto, 4px 4px;
}
```
`.plate` 需 `position: relative`。若项目已有 `.amb-scanline` / `.amb-benday` 全屏层，面板内 `::after` 可省；但 F-06 预算关掉那些层时，**面板内这层必须留着**，否则玻璃就变干净了。

## 2. 参数

| 项 | 值 | 备注 |
|---|---|---|
| 实底 | `rgba(4,6,12,.62)` | T0；实测 ≥4.5:1，别改回 `.55` |
| 模糊 | T0 `blur(18px) saturate(1.35)` · T1 `blur(10px) saturate(1.2)` · ≥T2 `none` | 别超 18px，糊了会吃掉街头细节 |
| 描边 | `1px solid rgba(245,197,66,.28)` | 奶黄，与警戒带同色 |
| 圆角 | 非对称 `12 / 4 / 12 / 4 px × --u` | 四角全圆 = iOS 玻璃，不是这套 |
| 内高光 | `rgba(255,255,255,.08)` | 压低；`.12` 以上就太干净 |
| 脏层 | 扫描线 1px/3px、网点 4px 网格、整层 `opacity:.3` | 像录像带上的玻璃 |
| 警戒条 | 3px、45° 黄黑 8/8px | 硬边，压住软玻璃 |

## 3. 色板

| 用途 | 值 |
|---|---|
| 面板实底 | `rgba(4,6,12,.62)` |
| 边缘 / 警戒黄 | `#F5C542` |
| 主文字 | `#F5F5F0` |
| 强调（失衡 / 连携） | `#F5C542` |
| 危险 / 白闪 | `#FF4D6D` |
| 冷补光（呼应青 rim） | `#7FE3FF` |

## 4. 对比度（WCAG 2.1 AA，不可协商）

- 正常文字 **≥4.5:1**，大字与控件边界 **≥3:1**。
- **按最坏口径测**：叠在最亮霓虹 / 白底上，不是叠在黑底上。历史翻车：`--plate` 从 `.55` 改到 `.62`，就因为最坏白底 `cream-hi` 只有 3.52:1（证据 `E:/naiwaling/docs/evidence/c-contrast-20261109.json`）。
- 文字用纯色坐在不透明实底上，**不许直接坐在 `backdrop-filter` 层上**——对比度会随背后 3D 画面飘。
- 玻璃降级到 T2 及以上时，实底 alpha 随档提高（见 §5），保证零模糊仍可读。

## 5. 五档预算（照抄 `hud.mjs:175`，别改阈值）

| 画布像素 | `data-fx-glass` | 真玻璃 | 伴随降级 |
|---|---|---|---|
| ≤2.5 MP | `all` | 全开 | 无 |
| ≤4.1 MP | `3` | ≤3 块 | 无 |
| ≤6.4 MP | `1` | 1 块 | 关电视墙、Ben-Day |
| >6.4 MP | `0` | 0 | 再关扫描线 / 涂鸦 / 仪式面板 |

`pointer: coarse`（移动端）一律走 T2 伪玻璃、**0 真玻璃**，用 C-05 四层配方（高 alpha 底 + 顶高光 + 内侧厚度线 + 外投影）就够了。

| 档 | `--tier-glass` | 实底 | 描边 | 动效比例 |
|---|---|---|---|---|
| T0 | `blur(18px) saturate(1.35)` | `.62` | `.28` | 1 |
| T1 | `blur(10px) saturate(1.2)` | `.66` | `.22` | 1 |
| T2 | `none` | `.78` | `.18` | 1 |
| T3 | `none` | `.92` | `.12` | .5 |
| T4 | `none` | `.96` | `.08` | 0（实底禁动效） |

## 6. 动效与光敏

- 高光、白闪 **≤3 次/秒**（`FLASH_LIMIT_PER_S = 3`，WCAG 2.3.1）。
- 面板进场 `0.3s × --tier-motion-scale`，缓动 `--ease-snap`；T4 全禁。
- 玻璃本身**不做逐帧动画**（blur 值、位移都别动），静态合成层才不烧帧。

## 7. 工程护栏（不做就静默失效）

- 源码**只写标准** `backdrop-filter`。标准 + `-webkit-` 同值声明会被 Vite/lightningcss 合并成只留前缀版，而 Chrome 154 不认这个别名 → 玻璃失效、控制台无报错。
- 搬 `E:/naiwaling/vite.config.mjs` 的 `keepStandardBackdropFilter()` 插件，或给 `build.cssTarget` 加上 `safari16.4` 让工具补前缀。
- **验收**：`grep -o 'backdrop-filter' dist/assets/*.css` 与 `-webkit-backdrop-filter` 各 ≥1 处。主仓库实测两种写法并存，修复生效。

## 8. 禁止

干净 iOS 玻璃（大圆角 / 高白高光 / 低 alpha）、文字坐模糊背景、全屏真玻璃、移动端真玻璃、任何具体游戏 UI（小地图 / 按键提示 / 任务条）、任何权属字标。

## 9. 交接自检

1. 最亮背景上量文字对比度 ≥4.5:1，留截图证据。
2. 构建产物里标准与前缀 `backdrop-filter` 都在。
3. 逐档切 T0→T4，每档文字仍可读、玻璃层数符合 §5。
4. 1080p 常用档（≈4.1MP）实测帧率不因玻璃掉档。
5. 每 3 秒抽一帧，确认脏层在、街头硬边在、没有任何游戏截图式 UI。
