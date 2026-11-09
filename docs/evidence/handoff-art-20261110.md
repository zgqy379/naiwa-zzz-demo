# 交接说明 · 2026-11-10 02:40

> 本轮由设计侧完成的工作已**分三次提交入库**，不与另一 agent 的并发改动冲突。
> 本文说明：做了什么、当前仓库状态、以及**别人接手前必须知道的三件事**。

---

## 一、本轮提交（设计侧）

| commit | 内容 |
|---|---|
| `100ff9b` | 角色贴图清洗脚本 + 官方族谱图 + 16 张重渲立绘 |
| `f07f552` | 液态玻璃体系（glass.css）+ 队伍编成 / 档案卡版式 + vite 插件修复 |
| `b635df1` | HUD 面板玻璃化 |

**这些都已进版本库，不会被别的 agent 覆盖。**

---

## 二、做了什么，为什么

### 1. 角色贴图清洗（`scripts/clean-character-textures.mjs`）

**问题**：Lux3D 生成的 baseColor 贴图是**照片烘焙产物**，里面混了环境光、
阴影、灰褐污渍。直接当 albedo 用，暗部叠出褐色脏色 → 立绘看着像「没擦干净」；
metallicRoughness 的 roughness 只有 ~0.32 → 表面湿塑料感。

**做法**：
- **平涂固有色**：把明暗从贴图里剥掉，只保留色相与饱和度，
  大尺度明暗交给实时光照 + NPR 色调分离表达（卡通渲染的标准做法）。
- **碎片化兜底**：部分资产（如 `naiwa_laugh_g1`）的贴图本身是碎的
  （大量不连续黄/褐/银块），平涂救不回来 → 改走「主体压成纯固有色 +
  保留深色特征（眼睛/嘴）」的路线。判据：低饱和像素占比 > 10%。
- **提哑光**：roughness → 0.72，metallic → 0。

**结果**：16 只立绘表面干净，剪影一眼可分。`glTF 校验 0 error`。
原图备份在 `docs/evidence/reference-20261110/tex-backup/`（16 个 GLB，可回滚）。

### 2. 官方族谱图（`scripts/compose-family-roster.py`）

**没有直接用参考图那张**，原因有三：
1. 右下角带「Miora 生成」水印，不能随包发；
2. 它画了 **19 只**角色，与项目实际的 16 只对不上，名字也不一致；
3. 角色是 AI 生成的圆润 3D 渲染，与游戏内实际模型不是同一套造型。

**改成**：用游戏里真实渲染出来的 16 张透明底立绘合成，版式借参考图的
「环形展台 + 铭牌」思路。产物 `public/portrait/family-roster.png`
（1920×1080），内容与 `src/game/squad.mjs` 逐条对齐。

### 3. 液态玻璃体系（`src/ui/glass.css` 新增）

按制作人拍板「完全照搬参考图的玻璃」——苹果式厚玻璃：
多层高光 + 内描边 + 柔影 + 斜切亮带 + 大圆角。
**背板实底是硬底线**，保证最坏背景上文字对比度仍 ≥ 4.5:1。

版式搬运：
- **队伍编成**：编号（01–16）+ 立绘卡，当前项放大抬起
- **档案卡**：圆形头像 + 名字 + 等级条 + 大立绘 + 属性条 + 标签页（属性/招式/音羽）
- **结算页 / 设置页**：整块厚玻璃
- **HUD**：品牌标、计时、轮次、血条、键位胶囊全部玻璃化

### 4. vite 插件修复（`vite.config.mjs`）

插件正则原来只认 `var(--tier-glass)` 这一种变量名。新增的 `--glass-*`
会被 lightningcss 当重复项合并成只剩 `-webkit-` 前缀版，
而 Chrome 154 已移除该别名 → **玻璃静默失效、控制台不报错**。
已放宽到任意 CSS 变量名。

---

## 三、⚠️ 接手前必须知道的三件事

### ① 当前 `npm run build` 是失败的（不是本轮造成）

```
[MISSING_EXPORT] "makeWetReflection" is not exported by "src/world/atmosphere.mjs".
    ╭─[ src/world/stage.mjs:18:26 ]
```

`atmosphere.mjs` 改动到一半（另一 agent 在 02:15–02:28 同时改了
`npr.mjs` / `postfx.mjs` / `textures.mjs` / `storefront.mjs` / `main.mjs` /
`movement.mjs` / `instanced_storefront.mjs` / `streetdetail.mjs`）。
`stage.mjs` 仍在 import `makeWetReflection`，但该函数已从 `atmosphere.mjs` 移除。

**本轮已验证**：在 dev server（vite --port 5277）下源码完全正常，
`window.__npr` 是 object、16 张卡都在、选人页可正常打开。
**只有 production build 挂在那个缺失导出上。**

### ② 静态服务会缓存旧产物

用 `python -m http.server` 服务 `dist/` 时，**重建后旧端口仍可能 serve 旧产物**。
本轮一度以为页面崩了，实际是 5276 端口缓存了坏构建。
**每次重建后请换端口验证**，或改用 dev server。

### ③ 参考图不能直接当资产用

`docs/evidence/reference-20261110/` 归档了 21 张参考图。已确认的问题：

| 问题 | 处理 |
|---|---|
| 19/21 张带「Miora 生成」水印 | 不能随包发 |
| 街景图左上角写「六分街」 | ZZZ 街区名，必须换掉 |
| 档案卡写「代理人」 | ZZZ 主角称谓，必须换掉 |
| 参考图是「苹果玻璃 + 日系写实」 | 与绝区零语汇冲突，按拍板照搬玻璃但保留项目配色 |
| 族谱全景 19 只、名字不符 | 已改用游戏真实资产合成 |

---

## 四、还没做完的

- [ ] **视频重录**：44.4 秒 / 30fps 那版录于贴图清洗与玻璃化之前，画面不含这两项
- [ ] **9 张游戏内插图重拍**：同上
- [ ] **重新部署**：魔搭创空间 + WorkBuddy 链接都还是旧构建
- [ ] **提交台账回填**：`video_url` / `frozen_tag` / `submit_at` 仍留空
- [ ] **制作人本人三件事**：真人冷启动录屏、小红书发帖、官网提交（11-19 19:00）

---

## 五、复现脚本

```bash
# 角色贴图清洗（幂等，从 tex-backup 重跑）
node scripts/clean-character-textures.mjs

# 合成族谱图（需先渲染 16 张透明底立绘到项目根 .ego-tmp-alpha-<id>.png）
python scripts/compose-family-roster.py
```

---

> 距 2026-11-19 19:00 约剩 9 天。
> 本文不构成法律意见；比赛条款以官网原文为准。
