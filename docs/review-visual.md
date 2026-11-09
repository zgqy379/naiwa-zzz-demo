# 奶蛙零 · 视觉/渲染/美术质量审查报告

> 审查人：资深 TA（视觉质量视角）
> 范围：NPR 渲染 / 后处理 / 场景 / 光照 / 特效 / 角色 / 氛围
> 依据：`src/render/npr.mjs`、`src/render/postfx.mjs`、`src/world/*`、`src/vfx/*` + `docs/test-shots/` 与 `docs/evidence/` 实测截图

---

## 问题清单（按严重度排序）

### 🔴 严重（视觉灾难）

**1. 主光方向被写死在材质里，场景三点光全部失效**
`npr.mjs:126-129` 把主光方向硬编码为 `normalize(vec3(0.5,0.8,0.6))`，半兰伯特 ndl、果冻高光 h、rim 全用它。结果：`main.mjs:51` 的 `key`（0xfff2d0）、`rim`、`AmbientLight` 以及 `streetdetail.mjs:131-169` 的整套黄昏主光/冷补光/正面补光**对 NPR 材质完全无效**。所有物体受同一个假方向光，场景光比、冷暖对比、阴影方向全部丢失。截图 `04-battle.png`/`09-attack.png` 里角色受光与背景光源方向不一致（背景亮带来自自发光，角色高光来自假光），是「假」。
改法：在 `onBeforeCompile` 里注入 `#include <lights_fragment_begin>` 改写，用 `directionalLights[0].direction` 与真实 `directionalLights` 累加，或直接改 `MeshToonMaterial` 走真实灯光（three 内建已支持），把 ndl 与 toon 梯度绑定真实主光。

**2. 色调分离把画面压成「糊成一片的硬色块」，细节全丢**
`npr.mjs:136-139` 对 `outgoingLight` 做 `floor(lum*steps)/steps` 量化，且 `steps` 只有 3。截图 `09-attack.png`/`10-attack.png`：角色身体被切成大色块，原本 GLB 贴图上的奶渍、渐变、纹理全部被量化抹平，看起来像塑料玩具而非「赛璐璐+贴图」。`v3-16-closeup-sheet-20261109.png` 更明显——6 只角色全是均质黄，毫无贴图细节。绝区零的赛璐璐分层是**在贴图之上做明暗分档**，不是把贴图量化掉。
改法：量化对象改为「光照强度」而非最终颜色，即 `outgoingLight = albedo * quantize(light)`；同时 `steps` 提到 4–5，并对皮肤/金属等不同材质分别给档数。

**3. 描边壳在角色上几乎不可见 / 或与高光冲突**
`npr.mjs:180-201` 的描边是「法线外扩 + BackSide + 固定宽度 0.022」，但 `main.mjs:168` 传的 `width: 0.022` 是**模型局部单位**，而角色 wrapper 被 `wrapper.scale` 归一化（`main.mjs:160-161`，s 常为 1.0–1.6），最终屏幕宽度随模型缩放漂移。截图 `13-move-a.png`/`09-attack.png` 角色边缘只有若有若无的一圈灰边，剪影不清晰。绝区零的描边是**屏幕空间等宽**、深色、粗细随景别稳定。
改法：改用屏幕空间描边（后处理 Sobel 边缘检测或 `OutlinePass`），或把顶点外扩宽度改为**世界空间定宽**（在 `makeOutlineMaterial` 里按 `length(viewPos)` 补偿），并加深到 `0x0a0a0a`、宽度 `0.03–0.04`（世界单位）。

**4. Bloom 阈值过高 + 强度过低，霓虹「该发光的不发光」**
`postfx.mjs:104-106` 默认 `strength 0.55 / threshold 0.72`，但 `main.mjs:78-82` 覆盖成 `strength 0.22 / threshold 0.88`。`threshold 0.88` 意味着只有接近纯白的像素才泛光。截图 `04-battle.png` 里满屏霓虹招牌（自发光 0.55–0.7）**完全不泛光**，霓虹是「死色块」而非绝区零那种带光晕的灯管。`03-select-switch.png`/`13-move-a.png` 里亮片是硬边色块，没有光晕扩散。
改法：`threshold` 降到 **0.65–0.72**，`strength` 提到 **0.35–0.45**，`radius` 0.35→**0.5**；让自发光招牌产生可见光晕。同时给自发光材质加「分层强度」，招牌核心 0.9、光晕区 0.4，避免整体过曝。

**5. 场景在 PBR 模式下几乎全黑，仅 NPR 模式能看**
`12-mode-switch.png`（PBR 模式）整条街死黑，只有一道巨大黄色光柱；`07-swap.png` 的角色是 PBR 材质但环境光明显不足。原因是 `stage.mjs` 的店铺/街道全是 `MeshStandardMaterial`（`storefront.mjs:66-73`、`streetdetail.mjs:22-27`），依赖 `makeAtmosphereLights` 的 `AmbientLight 2.6` + 多个方向光，但 `main.mjs:59` 又叠了一个 `AmbientLight 1.4`——两套环境光叠加后 PBR 下仍黑，说明灯光强度/衰减没调好。PBR 模式作为「NPR/PBR 对比」卖点，目前不可用。
改法：统一灯光——`makeAtmosphereLights` 只在无外部主光时启用，或把 PBR 模式的环境光强度提到 `3.5–4.0`、给街道加 `RectAreaLight`/`PointLight` 阵列；`12-mode-switch.png` 里那道光柱（`atmosphere.mjs` 体积光锥，opacity 0.03）实际渲染成实心黄锥，需降到 **0.008–0.012** 并改 `AdditiveBlending` + 渐变贴图。

### 🟡 中等（影响观感）

**6. 色彩分级过猛，暗部被「冷蓝」污染**
`postfx.mjs:26-29`：`uLift 0.12` + `uCoolShadows 0x4a6aff * 0.15` + `uContrast 1.08` + `uSaturation 1.25`。截图 `04-battle.png` 阴影区泛蓝紫，`13-move-a.png` 地面暗部是脏蓝灰。绝区零的阴影是**低饱和暖灰/中性灰**，不是冷蓝。`uLift 0.12` 把暗部抬平，导致剪影糊掉（代码注释自己都写了「0.25→0.12 避免暗部被抬平」，但 0.12 仍偏高）。
改法：`uLift 0.12→0.06`，`uCoolShadows` 改为 `0x3a3f55`（降饱和）或系数 0.15→0.08，`uSaturation 1.25→1.12`。

**7. 暗角过重且形状单一**
`postfx.mjs:72-73`：`smoothstep(0.4,0.95,d) * 0.28` 的圆形暗角。截图 `04-battle.png`/`09-attack.png` 四角死黑，画面像「望远镜」。绝区零的暗角是**很轻的椭圆 + 上重下轻**，不会让四角失细节。
改法：`uVignette 0.28→0.12`，并把遮罩改成椭圆（`vUv` 乘 aspect）+ 偏上（中心从 0.5 移到 0.47）。

**8. 速度线/冲击波形态廉价，粒子是「球」不是「光点」**
`impact.mjs:22-38` 冲击波是 `RingGeometry` + `AdditiveBlending`，`update` 只做线性放大+淡出；`impact.mjs:120-147` 粒子是 `SphereGeometry(6,4)` 低面球 + 加色。截图 `11-combo.png`/`10-attack.png` 命中点只有几根细线和小亮点，没有绝区零那种**放射状集中线 + 径向模糊 + 多层冲击环**。且 `spawn` 每次 `new THREE.SphereGeometry`/`new RingGeometry` 并 `dispose`（`impact.mjs:50-56`），高频连段下 GC 压力与画面卡顿风险高。
改法：冲击波改**双层环**（内环快、外环慢）+ 径向渐隐贴图；速度线改用**相机空间 billboard 条带**（面向相机）+ 头部粗尾部细；粒子换 `Sprite` + 径向渐变贴图，并做对象池（预建 200 个复用，避免每帧 new/dispose）。

**9. 店铺立面细节密度不足，招牌是「纯色块 + 白色小方块」**
`storefront.mjs:104-149`：横向招牌是纯色 `BoxGeometry` + 2–4 个白色小方块示意文字（`textMat` 无贴图），竖招牌是纯色块，空调外机是纯色块，没有灯管、边框、发光字、LED 滚动条。截图 `hd-03-left-shops.png`/`v3-16-family-sheet` 里店铺是「色带」，没有绝区零那种**多层招牌叠加、灯管勾勒、发光字、广告海报**的繁华感。`textures.mjs:102-125` 的 `makeSignTexture` 定义了但**从未被调用**（死代码）。
改法：招牌用 `makeSignTexture` 生成「发光字」贴图（或直接 Canvas 画中文字），加灯管边框（细 `BoxGeometry` + 高自发光），竖招牌加竖排文字块；橱窗加内透光渐变；空调外机加散热格栅贴图。

**10. 地面/街道缺乏细节与反射，生活感弱**
`streetdetail.mjs:22-27` 地面是 `0x16181e` + 256px 程序化纹理，`repeat(8,2)`；`textures.mjs:65-99` 的地面纹理只有噪点+4×4 网格，无柏油颗粒、无油渍、无积水反射。`atmosphere.mjs:79-92` 的「湿反射」只是 `PlaneGeometry + additive opacity 0.05`，截图里完全不可见。绝区零街道有**湿地面反光、油渍、裂缝、井盖、排水口**。
改法：地面纹理加柏油颗粒（2–4px 亮点）+ 随机油渍（深色椭圆）+ 裂缝（暗线）；湿反射改「镜面贴图 + 法线扰动」或用 `Reflector` 低分辨率；增加排水口、路缘污渍、墙面涂鸦。

**11. 体积光柱渲染成实心锥，破坏画面**
`atmosphere.mjs:14-34` 用 `ConeGeometry(openEnded) + AdditiveBlending` 做体积光，但 `stage.mjs:39-49` 只放了 4 个、opacity 0.03，**实际截图 `12-mode-switch.png`/`13-move-a.png` 里是一根巨大实心黄锥**，极其突兀。原因是 `ConeGeometry` 的侧面是连续面，additive 下中心亮度叠加过高。
改法：改用**渐变贴图 + 双面billboard**（软边），或直接把 opacity 降到 0.008 并加 `depthWrite:false` + 径向 alpha 贴图；更稳妥是删掉锥体，改用「光斑贴图」贴在店铺门口。

**12. 角色脚下假阴影是「黑色圆片」，与 NPR 风格冲突**
`shadowblob.mjs:29-36` 是 `CircleGeometry + 黑色 opacity 0.35`。截图 `04-battle.png`/`09-attack.png` 角色脚下是生硬的黑色圆，边缘硬、不随地面光影变化。绝区零角色脚下是**柔和的椭圆接触阴影 + 环境光遮蔽**，边缘虚化。
改法：换**径向渐变贴图**（中心深、边缘透明）+ 椭圆（z 向压缩 0.8）+ opacity 0.25；或启用真实 shadow map（`main.mjs:44-45` 已开 `PCFShadowMap`）并提高 `key.shadow` 强度，让角色在地面投出真实阴影。

### 🟢 轻微（打磨项）

**13. 角色 NPR 材质丢失 GLB 原始贴图细节**
`npr.mjs:61-68` 用 `MeshToonMaterial` + `map`，但 `MeshToonMaterial` 的 toon 梯度会与 `map` 相乘，导致贴图变暗/分层异常。截图 `v3-16-closeup-sheet-20261109.png` 6 只角色贴图细节全无。建议保留 `map`，但用 `MeshStandardMaterial` + `onBeforeCompile` 注入 toon 量化，避免 toon 梯度压暗贴图。

**14. 描边颜色单一，无深浅变化**
`npr.mjs:38` `outlineColor 0x1a1410` 全局统一。绝区零描边会随材质/景别微调（暗部更深、亮部偏暖）。建议按材质给描边色，或至少在暗部材质上加深。

**15. 角色受击/终结缺少「材质级」反馈**
`battle.mjs:208-213` 有 `emissiveIntensity` 白闪，但截图里几乎不可见（被 Bloom 阈值 0.88 挡住）。建议受击白闪同时抬 `toneMappingExposure` 或加「屏幕空间白闪」pass，并让 Bloom 阈值在闪光帧临时降低。

**16. 电线是「折线盒子」而非弧线**
`streetdetail.mjs:104-125` 用 6 段 `BoxGeometry` 近似电线弧，`wire.lookAt(p1)` 只对齐一端，段间有折角。截图 `hd-03-left-shops.png` 电线呈明显折线。建议改用 `CatmullRomCurve3` + `TubeGeometry`。

**17. 相机 FOV 与运镜参数偏保守**
`tuning.mjs:38-46`：`fovVertical 40`、`distance 3.8`、`sideOffset 2.2`。截图 `04-battle.png` 角色占屏偏小、街道纵深压缩。绝区零战斗运镜更近、更仰、更动态。建议 `fovVertical 45`、`distance 3.2`、`lookAtHeight 0.9`，并给连携/终结加更明显的 `zoomK` 推近（当前 1.2→2.5）。

**18. 后处理 FXAA 在 NPR 硬边下几乎无效**
`postfx.mjs:114-117` 用 FXAA，但 `renderer.antialias:true`（`main.mjs:38`）已开 MSAA，两者叠加后 FXAA 把硬边色块边缘抹糊。建议关掉 `antialias` 只留 FXAA，或改 TAA/SMAA。

---

## 与绝区零的视觉差距

| 视觉元素 | 绝区零 | 奶蛙零现状 | 差距根因 |
|---|---|---|---|
| **赛璐璐分层** | 贴图之上做 3–4 档明暗，细节保留 | 把最终颜色量化，贴图细节被抹平 | 量化对象错误（应量化光照而非颜色） |
| **描边** | 屏幕空间等宽、深色、随景别稳定 | 顶点外扩、宽度随模型缩放漂移、几乎不可见 | 局部空间外扩 + 无宽度补偿 |
| **果冻高光** | 锐利、集中在凸面、边缘衰减 | 锐利但方向写死、与场景光无关 | 主光方向硬编码 |
| **霓虹光晕** | 灯管 + 光晕扩散 + 色彩渗透 | 自发光色块，无泛光 | Bloom 阈值 0.88 过高 |
| **阴影** | 真实投影 + 柔和接触阴影 | 生硬黑色圆片 | 假阴影未渐变 |
| **地面** | 湿反射 + 油渍 + 颗粒 | 均质深色 + 不可见湿痕 | 纹理分辨率/内容不足 |
| **运镜** | 近、仰、动态推近 | 远、平、保守 | 相机参数偏保守 |
| **色彩** | 高饱和但暗部中性 | 暗部冷蓝、暗角过重 | 分级参数过猛 |

**核心差距**：绝区零的「绝」感来自**贴图细节 + 赛璐璐分层 + 真实光影方向**三者叠加；奶蛙零当前把贴图量化掉、把光影方向写死、把霓虹 Bloom 关掉，等于把「绝区零感」的三个支柱全拆了。

---

## 优先修复建议（Top 5，按性价比排序）

**P0-1｜修主光方向（1 行代码，收益最大）**
`npr.mjs:126-129` 把硬编码 `normalize(vec3(0.5,0.8,0.6))` 改为从 `directionalLights[0].direction` 读取；同时让 `makeNprMaterial` 支持传入 `keyDir` 并由 `main.mjs` 与 `key.position` 同步。这一步让场景三点光全部生效，画面光比立刻成立。

**P0-2｜Bloom 阈值/强度回调（3 个数字）**
`main.mjs:79-81`：`bloomStrength 0.22→0.40`，`bloomThreshold 0.88→0.68`，`bloomRadius 0.35→0.50`。让截图里满屏霓虹真正「发光」，直接拉近与绝区零的质感差距。

**P0-3｜色调分离改「量化光照」而非「量化颜色」（npr.mjs:136-139 重写）**
把 `outgoingLight = mix(outgoingLight, outgoingLight*(q/lum), 0.85)` 改为对**光照项**（ndl/lifted）做量化后再乘 albedo；`steps` 提到 4。保住 GLB 贴图细节，角色不再「塑料玩具化」。

**P1-4｜色彩分级降暗部污染（postfx.mjs:26-29）**
`uLift 0.12→0.06`、`uVignette 0.28→0.12`、`uSaturation 1.25→1.12`、`uCoolShadows 0x4a6aff→0x3a3f55`（系数 0.15→0.08）。去掉「望远镜暗角 + 蓝紫暗部」，画面立刻干净。

**P1-5｜体积光柱 + 假阴影替换（atmosphere.mjs / shadowblob.mjs）**
体积光锥 opacity `0.03→0.008` 并加径向渐变贴图（或直接删除）；假阴影换径向渐变贴图 + 椭圆 + opacity 0.25。消除截图里最突兀的两个「假」元素。

---

*报告完。所有参数建议均基于截图实测与代码静态审查，可直接落地验证。*
