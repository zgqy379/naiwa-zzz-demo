# 奶蛙零 · 第三方声明（THIRD_PARTY_NOTICES.md）

> 状态：**已建账（模板）／实施期接线项**。制作人 2026-11-07 裁定建立，归属主程序 `tools/pack` 门禁。
> ⚠️ **2026-11-11 复核**：本文件成稿于 2026-11-07 规划态，其中 `tools/pack` 门禁与 `docs/round2/` `docs/round3/` 等路径在本仓**并不存在**（见 §5「本仓现状说明」）。本仓实际门禁为 `npm run lint` / `npm test` / `npm run test:moves` + 两个只读自检脚本。本文件保留其**选型决策与许可核验结论**，删除不存在的门禁引用。
> 依据：官网 IP 条款原文「参赛者应保留其原创作品依法享有的权利，并确保所使用的代码、模型、图片、音乐、数据及其他第三方内容具有合法授权」；`arch_naiwa0_toolchain_v1.md` §7.3；`qa_v2_acceptance.md` G-V2-06／M8；`ASSET-LICENSES.md` §1 的 12 列字段。
> **权威分工**：素材授权逐条登记在 `ASSET-LICENSES.md` §1 的 12 列主表（唯一载体）；本文件只做「第三方代码／组件许可汇总 + 署名文本汇总 + 排除清单」，**不另立列、不重造列名**。
> ⚠️ 本文件存在 ≠ 素材已授权。门禁通过 ≠ 已授权。判定只认台账实际记录与 `tools/pack verify` 退出码。

---

## 1. 第三方代码／组件许可汇总（2026-11-07 实测回填：均读 node_modules 内 LICENSE 原文）

| 组件 | 用途 | 许可证 | 版本 | 是否随源码包分发 | 署名文本 | 核验状态 |
|---|---|---|---|---|---|---|
| `three` | Web 3D 引擎（渲染承载；动态 import） | **MIT**（node_modules/three/LICENSE 原文「The MIT License」） | 0.187.0 | 是（package.json 声明，使用者 npm install 自取） | 见 §3 汇总 | **已核验 2026-11-07** |
| `vite` | 构建/预览工具链（devDependency） | **MIT**（node_modules/vite/LICENSE.md「Vite is released under the MIT license」） | 8.3.6 | 是（devDependencies 声明） | 见 §3 | **已核验 2026-11-07** |
| `@gltf-transform/core` | GLB 读写（压缩管线） | **MIT**（LICENSE 原文「The MIT License (MIT) Copyright (c) 2024 Don McCurdy」） | 4.5.1 | 是（tools/optimize 依赖声明） | 见 §3 | **已核验 2026-11-07** |
| `@gltf-transform/functions` | weld/simplify/textureCompress/quantize/meshopt | **MIT**（同上 LICENSE） | 4.5.1 | 是（同上） | 见 §3 | **已核验 2026-11-07** |
| `@gltf-transform/extensions` | EXT_meshopt_compression / EXT_texture_webP | **MIT**（同上 LICENSE） | 4.5.1 | 是（同上） | 见 §3 | **已核验 2026-11-07** |
| `meshoptimizer` | meshopt 编解码 wasm（运行时解码） | **MIT**（LICENSE「MIT License Copyright (c) 2016-2026 Arseny Kapoulkine」） | **1.3.0**（package.json `^1.3.0`；2026-11-11 复核更正，v1 表记的 1.2.0 为旧值） | 是（MIT 允许再分发） | 见 §3 | **已核验 2026-11-11** |
| `camera-controls` | 相机控制器（`src/vfx/camerarig.mjs` 跟随/碰撞） | **MIT**（node_modules/camera-controls/package.json license 字段） | 3.1.2 | **是（运行时 production dependency）** | 见 §3 | **已核验 2026-11-11**（2026-11-11 补登，v1 表漏项） |
| `sharp` | 贴图压缩编码器（构建期，随 @gltf-transform 传递依赖引入） | **Apache-2.0**（node_modules/sharp/package.json license 字段） | 0.35.5 | 是（仅构建期依赖，不进运行时包） | 见 §3 | **已核验 2026-11-11**（注：package.json **未直接声明** sharp，随 @gltf-transform 传递引入） |
| `ffmpeg` | 录屏工具链（`scripts/capture-demo-video.mjs`，系统级二进制） | LGPL/GPL（按发行构建；本机使用，不随源码包分发二进制） | 9.0.2 | **否**（README 注明需自装） | — | 已核验 2026-11-07（winget 安装） |
| `ZCOOL KuaiLe`（站酷快乐体） | 首页标题字（`NaiwaKuaiLe`，默认） | **SIL Open Font License 1.1**（Copyright 2018 The ZCOOL KuaiLe Project Authors） | 见上游 | **是**（子集 woff2 1,072 B 随包） | 见 §3 | **已核验 2026-11-11**；许可全文随包 `public/fonts/LICENSES.txt` |
| `ZCOOL QingKe HuangYou`（站酷庆科黄油体） | 首页标题字备选（`?logo=qingke` 对比入口） | **SIL Open Font License 1.1**（Copyright 2018 The ZCOOL QingKe HuangYou Project Authors） | 见上游 | **是**（子集 woff2 3,768 B 随包） | 见 §3 | **已核验 2026-11-11**；许可全文随包 `public/fonts/LICENSES.txt` |

> **纪律**：未实际安装、未读 LICENSE 原文、未记录版本前，不得填「已核验」。禁止把「MIT」当默认结论。**上表 2026-11-07 各行已逐项读 LICENSE 原文核实；2026-11-11 复核更正 meshoptimizer 版本、补登 camera-controls 与两个 OFL 字体；Mixamo/第三方动作库与 @manycore/aholo-sdk-lux3d、aholo-viewer 本项目未引入（网页端操作 + three.js 承载），不列行。**
>
> ⚠️ **本表只覆盖「第三方代码／组件」。素材（图片 / 视频 / 字体 / 音频 / 3D 资产）的授权逐条登记在 `ASSET-LICENSES.md` §2 主表**——本文件 §1 的字体行只登记「随包的字体文件」这一项代码侧的依赖事实，素材侧的登记仍以 `ASSET-LICENSES.md` 为唯一载体。

> **纪律**：未实际安装、未读 LICENSE 原文、未记录版本前，不得填「已核验」。禁止把「MIT」当默认结论——上表均为第三方资料口径的**候选**，不是核实结果。
> **红线**：任何第三方 3D 生成（Meshy／Tripo／fal／Atlas Cloud 图生 3D／Dioramas `gen.mjs`）一律拒绝接入核心 3D 内容生产，否则 AC-T1「资产移除对拍」失效（摆件一票否决 + 70 分封顶 + 参赛资格风险）。详见 `tech_v1.md` §2 绝不接清单。

---

## 2. 内部核验参考图（**不进对外素材包／源码包**）

| 类别 | 数量 | 逐张登记位置 | 处置 |
|---|---|---|---|
| `docs/round2/_verify/` 核验截图 | **31 张** | `round2/art_v1.md` 附 A「31 张核验截图逐张权属登记」（含 NW／XHS／BILI／S1／NWH 五类权属标签） | 全部仅内部核验；权属未核；不进对外包 |
| 单角色输入图 URL 清单 | 16 张 | `round2/art_v1.md` §2.2（其中**仅 4 张**满足 Lux3D「单主体／完整轮廓／干净背景／均匀光照」） | 全部权属未核；仅作造型参考与过程证据 |
| 48 款奶蛙头像库 | 48 张 | `round2/art_v1.md` §2.1 | 均为半身扁平图、缺完整轮廓，不作 3D 生成输入；仅作配色／配件变体库 |

**处置规则**：`tools/pack` 排除 `assets/ref/`、`docs/round2/_verify/`、`docs/round3/_verify3/`；**只有 Lux3D 自生成的 Mesh + PBR 可随包分发**。
**⚠️ 这些图不是实际渲染帧**，绝不能充当报告书「关键效果截图 ≥5 张」或 M2「真实运行画面」——后者唯一合法来源是 `tools/capture/record` 打开已部署的冻结 tag 产物录 30–60 秒真实交互。

---

## 3. 署名文本汇总（CC BY 等需署名时）

> 当前为空。启用 CC BY 素材时，从 `ASSET-LICENSES.md` 12 列主表的「署名文本」列逐条抄入，不改列名、不合并条目。

---

## 4. `tools/pack` 门禁接线（实施期）

1. 校验本文件存在且非仅格式示例；
2. 校验 `ASSET-LICENSES.md` 12 列**实际授权记录数 > 0**，且不是格式示例行（**2026-11-11 实测：主表实际登记 27 行**，见该文件 §2）；
3. 列名逐字一致（第 5 列准确名「授权(全名+版本)」、第 9 列「是否随源码包分发」），不一致即打包失败；
4. 排除清单校验：`assets/ref/`、`docs/round2/_verify/`、`docs/round3/_verify3/` 不得进入对外包与源码包；
5. 门禁须接进实际执行的 `npm test`／打包命令，并带一个预期失败的自检用例；写过但没接进执行链 = 没有守卫。

---

## 5. 当前状态（如实标注，占位不是完成）

- 本文件**已建账**：解决了 QA G-V2-06 的「`THIRD_PARTY_NOTICES.md` 不存在」缺口。
- 31 张核验截图的逐张权属登记**已由美术总监落在 `round2/art_v1.md` 附 A**，可复算。
- **2026-11-11 复核更正**：`ASSET-LICENSES.md` 主表实际登记 **27 行**（不是 v1 记录的「10 行」，更不是「0 行／仅 5 行格式示例」——那两处口径互相矛盾且均已过期）；第三方组件许可已逐项读 LICENSE 原文核实（见 §1）；2026-11-11 补登此前漏项：`camera-controls`（运行时依赖）、两个 OFL 1.1 字体（随包）、更正 `meshoptimizer` 版本 1.2.0→1.3.0。
- **仍未闭合**：首页背景视频 `public/bg/title.mp4`（第三方短视频素材，含平台水印）的原始链接与授权凭证**待制作人补齐**（已登记为 `VIDEO_BG_Title`，授权状态如实标「待验证」）。
- **M8 是否可判通过，由独立验收组按 G-V2-06 独立复现后判定，制作人不代判、不提前改写结论。**
- **项目可交付判定仍为「不通过／本轮未验证可玩性」**（无冻结 tag／无 Demo／无真人试玩录屏／无实际渲染帧）。本文件不改变这一条。

> ⚠️ **本仓现状说明（2026-11-11 核对）**：本文件 §2/§4/§5/§6 中引用的 `tools/pack`、`tools/capture`、`tools/optimize`、`docs/round2/`、`docs/round3/`、`assets/ref/` 等路径**在本仓库并不存在**——它们来自 2026-11-07 的早期规划态（工作底稿），非本仓实际结构。**本仓实际的交付门禁是**：`npm run lint`（eslint src tests）、`npm test`（`tests/run-e2e.mjs`，构建到 `.tmp-dist-e2e`、不动 `dist/`）、`npm run test:moves`（`tests/moves-test.mjs`），以及 `scripts/verify-glb.mjs` / `scripts/measure-runtime.mjs` 两个只读自检脚本。§6 表中 GSAP / bitECS / postprocessing / img2threejs / rapier / playwright 等库**本仓一个都没有引入**（`package.json` 运行时依赖仅 `three@0.187.0` 与 `camera-controls@^3.1.2`），该表保留仅作历史决策留档，**不构成本项目的依赖声明**。

---

## 6. 许可实测反例（2026-11-07 架构总监 GitHub API 逐仓实测，制作人 D3-6 裁定采信）

> 来源：`docs/round3/tech_capability_scan_v1.md` §4.2 / §4.4。**禁止把「常见开源库一律 MIT」当默认结论**；下表为已实测项，其余仍待实施期读 LICENSE 原文核实。
>
> ⚠️ **本表为 2026-11-07 早期规划态的选型留档，本仓并未引入其中任何库**（`package.json` 运行时依赖仅 `three@0.187.0` + `camera-controls@^3.1.2`；`three.js` / `glTF-Transform` / `meshoptimizer` 确已引入且许可已登记于 §1）。**本表不构成本项目的依赖声明**，保留仅为记录「为什么没选它们」的决策依据。

| 组件 | 实测许可 | 特别义务 | `tools/pack` 门禁动作 |
|---|---|---|---|
| `greensock/GSAP` | **`license: null` → Webflow 自定义「Standard No Charge GSAP License」（2025-04-30 生效，非 OSI SPDX）** | 商用免费但含 Prohibited Uses；**不得移除专有声明** | **最高优先级单列 NOTICE + 许可全文**；**严禁写 MIT** |
| `NateTheGreatt/bitECS` | **MPL-2.0**（文件级弱 copyleft） | 未修改源码可按依赖使用；**若修改过 MPL 文件须保持开源** | 单列 NOTICE + MPL 全文；实施期记录是否改动 |
| `pmndrs/postprocessing` | **Zlib** | 保留许可声明 | 单列登记，不套 MIT 模板 |
| `img2threejs/img2threejs` | **Apache-2.0** | NOTICE 文件 + 变更标记 | **仅占位回退时登记**；不得进内容生成路径（裁定 D3-5） |
| `dimforge/rapier` / `microsoft/playwright` | **Apache-2.0** | NOTICE 文件 + 变更标记 | 登记；Playwright `recordVideo` 是 M2 真实运行录屏唯一合法来源 |
| `mrdoob/three.js` / `donmccurdy/glTF-Transform` / `zeux/meshoptimizer` / `manycoretech/aholo-viewer` / `manycoretech/aholo-spatial-sdk` / `goldfire/howler.js` / `pixijs/pixijs` / `statelyai/xstate` / `blendi-remade/dioramas` | **MIT**（逐仓实测） | 版权头 + 许可全文 | 登记；⚠ `aholo-viewer` 的 `external/splat-transform` 疑似专有、不可再分发【待验证】 |

**排除清单补充**：`docs/round3/_verify3/`（第三轮 egolite 素材核验截图）与 `assets/ref/` 一并进 `tools/pack` 排除项；采集原图一律不进对外素材包与源码包，**只有 Lux3D 自生成的 Mesh + PBR 可随包分发**。

**Dioramas 特别项**：仓库 MIT，但示例生成资产为 CC BY 4.0 且非本项目产物，`scripts/gen.mjs` 走 Meshy 7.1 on fal → **`gen.mjs` 绝不接**；仅 `optimize*.mjs` 与 `src/core/` 后处理栈可复用，20 个示例模型（约 330MB）进排除清单。

**第三方目录包级裁剪**（裁定 D3-4）：`threejs-game-skills` 9-skill 含走 Tripo API 的 `threejs-3d-generator`、LobeHub `add-3d-assets` 会引入第三方 GLB → 禁止整包装；安装前须做「名称 → 真实包 → 许可 → 是否含 3D 生成能力」四步核名。
