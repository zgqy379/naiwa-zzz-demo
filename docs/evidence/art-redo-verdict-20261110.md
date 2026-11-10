# 美术重做线对照报告 · 2026-11-10（收口书记员）

> 落盘人/时点：重做线（动态工作流产线）收口书记员，2026-11-10 03:10。
> 输入：产线门禁最终结果 **未通过（exit=1）**；视觉验收 **未进入（门禁未过）**；备份目录 `E:/naiwa-art-redo-backup-20261110`；圣经 `docs/美术圣经-重做线-20261110.md`。
> 本文只做记录与核对，不代任何线重写代码；本书记员全程未改 `src/`、未改 `dist/` 内文件、未执行 git 提交。

---

## 1. 门禁结果与各轮 exit 码

**门禁定义**（实读工作流定义脚本 `.zcode/workflow-runs/dwfrun-f6e052e3-a0a8-4fc6-9ee3-d05808115a79.mjs:9`，该文件为脚本而非运行日志）：门禁 = `node tests/run-e2e.mjs`（vite build + ego-browser 25 例 E2E），脚本直读 `docs/test-report.json` 机器报告判定，不信任转述。

**构建去向**：`tests/run-e2e.mjs:5-6,18,71-73` 明确构建进临时目录 `.tmp-dist-e2e`（`vite build --outDir .tmp-dist-e2e`），**不写交付物 `dist/`**（AGENTS.md §4 构建唯一权）。

| 项 | 结果 | 依据 |
| --- | --- | --- |
| 门禁最终结果 | **未通过，exit=1** | 产线给定输入；与工作流脚本产出模板 `门禁未通过（exit=${gate.exitCode}）` 核对一致（同脚本 ：9） |
| 视觉验收 | **未进入**（门禁未过） | 产线给定输入；工作流脚本模板 `门禁未过，未进入视觉验收` |
| 各轮 exit 码 | **无留存可查** | `.zcode/workflow-runs/` 仅存工作流定义脚本（6 个 `dwfrun/dwfeval-*.mjs`），无运行日志、无轮次记录；本报告不编造各轮码，仅如实记录最终 exit=1 |
| E2E 判定文件 | `docs/test-report.json`（**正被并行 E2E 循环持续重写，读数是移动靶**） | 本书记员 python 直读两次：03:05 读得 `summary 25/24/1（passRate 96）`；03:08:37 读得 `summary 25/22/3（passRate 88，at=2026-11-09T19:08:37Z）`。03:08 版失败用例含「动画·攻击动画触发」（"攻击动作未触发，实际 action=idle, stage=-1"，截图 `docs/test-shots/攻击动画触发-FAIL.png`）与「交互·空格攻击生效」（"攻击未生效（连段=false, hp 0→0）"，截图 `docs/test-shots/空格攻击生效-FAIL.png`）。门禁自身时刻的判定读数以门禁运行为准，本表仅留档 |

---

## 2. 圣经 §10 验收条款逐条（①–⑦）

**全部未执行（not run）。** 依据：门禁未通过 → 视觉验收未进入（§1）。本书记员未运行任何视觉验收比对，以下如实标注，不填 pass/fail：

| 条款 | 内容（圣经 §10，`docs/美术圣经-重做线-20261110.md:207-215`） | 状态 | 证据 |
| --- | --- | --- | --- |
| ① | 角色哑光可读不烧平 | **未执行** | 无验收比对记录 |
| ② | 敌我一眼可辨（暖 vs 冷） | **未执行** | 无验收比对记录 |
| ③ | 无死黑区、路面可读 | **未执行** | 无验收比对记录 |
| ④ | 立面真实图文招牌、无七彩纸屑感 | **未执行** | 无验收比对记录 |
| ⑤ | 命中特效为火花+弧光 | **未执行** | 无验收比对记录 |
| ⑥ | 玻璃拟态 HUD 轻盈通透 | **未执行** | 无验收比对记录 |
| ⑦ | 与改前对照无回归 | **未执行** | E2E 链路本身 exit=1，且 test-report.json 读数存在红灯（§1），不能宣称「不降级」 |

---

## 3. dist 产物 hash（按任务口径执行的结果）

**要求**：取 `E:\naiwa-zzz\dist\assets\index-*.js` 文件名，sha256 前 16 位。**实跑结果：磁盘上不存在该文件。**

- `ls /e/naiwa-zzz/dist/assets/index-*.js` → `No such file or directory`（本书记员实跑，exit 2）。
- `find /e/naiwa-zzz/dist -name "index-*.js"` → **无匹配**（实跑）。
- dist/ 工作区现状（`ls` 实跑）：仅 `.git`、`.nojekyll`、`asset/`、`portrait/`、`world/`，**无 `index.html`、无 `assets/`**。
- `git -C dist status --porcelain`（实跑）：` D index.html`、` D assets/index-DXYmkd82.js`、` D assets/index-DJ01gumS.css`（未提交删除），另 4 只 GLB 修改（mtime 02:23）。删除成因未查明；02:20–02:33 有并行线在 dist/ 活动族谱/GLB 重优化。门禁 E2E 构建走 `.tmp-dist-e2e`（§1），不写 dist/，故**非门禁所致**（据 tests/run-e2e.mjs 实读推断）。
- **最近入库产物**（dist 仓库 HEAD，实跑 `git -C dist log -1` / `git show --stat`）：commit `e50a536`（2026-11-10 02:20:46+0800，"deploy: 明亮通透+玻璃UI+性能优化(57FPS)+A1-A4修复"），产物 `assets/index-DXYmkd82.js`（由 `index-Dk8cbfW4.js` 改名而来）。
- 该产物 sha256（实跑 `git -C dist show HEAD:assets/index-DXYmkd82.js | sha256sum`，取自 git 对象，**非磁盘文件**）：
  `f143abf01af8dfb0aaa8171cbf2e59c14576c115ee09747b42bfb698761d802e` → 前 16 位 **`f143abf01af8dfb0`**。

> 结论：本次交接的 distHash 字段只能填 `f143abf01af8dfb0`（git 对象口径），并在交接段声明磁盘缺失。若需「磁盘文件 hash」，须等 dist 恢复 index.html+assets 后重算。

---

## 4. 改前 / 改后截图路径对照

| 侧 | 路径 | 说明 |
| --- | --- | --- |
| 改前基线 | `E:/naiwa-art-redo-backup-20261110/docs/test-shots/`（25 张：01–13 编号图 + 12 张 FAIL 图） | 备份快照 2026-11-10 00:43:02–00:43:09（RESTORE.md），逐字节校验与源一致 |
| 改前（更早正式截图） | `docs/evidence/v3-show3-*.png`、`record-32s-t*.png` 等 | 2026-11-09 系列，git status 显示均为 M（已被后续覆盖重写过，作对照需谨慎） |
| 改后（E2E 过程产物） | `docs/test-shots/01-title.png … 13-move-a.png`（mtime 03:00–03:06）+ `主界面显示/战斗界面显示/攻击动画触发/移动动画触发/结算界面显示-FAIL.png`（03:00）+ 02:05–02:08 的旧 FAIL 图 | 构建自 `.tmp-dist-e2e`（tests/run-e2e.mjs:18），非交付物 dist/ |
| 圣经最高准据图 | `docs/evidence/ref-zzz-20261110/`（ref-01…ref-21，21 张） | 圣经 §「最高准据」指定的验收比对图；**与其比对未执行**（验收未进入） |
| 其他改后参考图（非验收） | `docs/evidence/glass-title.png` / `glass-select.png`（02:17，设计侧玻璃版式）；`v3-roster-*` / `roster-ref-*`（族谱线） | 仅参考，不构成 §10 验收证据 |

> **性质声明**：改后截图是 E2E 过程截图，**不是**圣经 §10 的验收对照截图对；圣经 §10 要求「每条附改前/改后截图对存 docs/evidence/」，该存证因验收未进入而不存在。任何「验收通过」表述均无证据支撑。

---

## 5. 回滚方法

照 `E:/naiwa-art-redo-backup-20261110/RESTORE.md`（实读）执行。要点：

- 快照时刻 2026-11-10 00:43:02–00:43:09，分支 main，HEAD `a2c207cf4aaafc82b1d935ddb985c6046dfeb75a`，未提交改动 118 项（`git-status-before.txt` 全量）。
- 备份仅含 7 项：`src/`（31 文件）、`index.html`、`vite.config.mjs`、`docs/test-shots/`（25 文件）、`docs/test-report.json`、`docs/改动记录-角色线.md`、`AGENTS.md`。
- 命令：RESTORE.md 内 PowerShell `Copy-Item`（推荐）或 Git Bash `cp` 逐项覆盖；**必须用内容级复制**（`src\*` / `src/.`），防嵌套出 `src\src`。
- 注意（RESTORE.md 自述）：覆盖式回滚**不删除**快照后新增的文件，需对照 `git-status-before.txt` 手工清理；回滚后验证 `node --check src/main.mjs` + 构建 + E2E；回滚会连带回滚 `test-report.json` / `test-shots/`。
- **本线改动叠加在 2026-11-09 未提交改动之上**：回滚即全量恢复到 00:43 快照态（含 11-09 的未提交改动、不含其后的任何线改动），不是只撤本线。

---

## 6. 本线改动文件清单（以 `docs/改动记录-角色线.md` 登记为准）

登记出处（本书记员 03:05–03:08 grep -n 实读行号）：v1 场景整改段 `:71-75`、展示线登记段 `:77-93`、v2 黄昏蓝调段 `:95-118`。本线（重做线-工作流 / 重做线-展示线 / 重做线-工作流v2）登记的施工文件 **14 个**：

| # | 文件 | 登记轮次 |
| --- | --- | --- |
| 1 | `src/main.mjs` | 展示线（01:27/01:31/01:46）+ 工作流v2（03:05） |
| 2 | `src/render/npr.mjs` | 展示线（01:27/01:31）+ 工作流v2（03:05） |
| 3 | `src/render/postfx.mjs` | 展示线（01:27）+ 工作流v2（03:05） |
| 4 | `src/ui/portrait.mjs` | 展示线（01:27）+ 工作流v2（03:05） |
| 5 | `src/ui/hud.mjs` | 展示线（01:27 移除调参信息块）；另有当日「深挖修复工作流」UI-2/UI-4 登记（:114），归属非本线 |
| 6 | `src/ui/style.css` | 工作流v2（03:05） |
| 7 | `src/vfx/impact.mjs` | 展示线（01:27）+ 工作流v2（03:05） |
| 8 | `src/world/storefront.mjs` | 工作流 v1（:75）+ v2（:99） |
| 9 | `src/world/streetdetail.mjs` | 工作流 v1（:75）+ v2（:101）+ 笔误修正（:118） |
| 10 | `src/world/textures.mjs` | 工作流 v1（:75）+ v2（:100） |
| 11 | `src/world/stage.mjs` | 工作流 v1（:75）+ v2（:104）+ 笔误修正（:118） |
| 12 | `src/world/atmosphere.mjs` | 工作流 v1（:75）+ v2（:102） |
| 13 | `src/world/props.mjs` | 工作流 v1（:75）+ v2（:103） |
| 14 | `src/world/aholo-street.mjs` | v2 §5.8 裁决「**零改动，登记备查**」（:105）；当前 git status 为 M，属并行/更早改动，**非本线** |

交叉核对：`comm -13 <(sort 备份git-status-before.txt) <(git status --porcelain | sort)`（实跑）——备份 118 项 vs 当前 284 项，差集含全部并行线改动；上表 1–13 全部呈 M 状态、与登记一致。**登记行是归属依据，差集本身不能区分是哪条线改的。**

当日其他线登记（不属于本线清单）：收口线（audio.mjs/movement.mjs/interactive.mjs/main.mjs 接线、tests/game-test.mjs）、team-leader（npr.mjs uKeyDir 修复 :19）、深挖修复工作流（hud.mjs/scripts/verify-minify.mjs/package.json）、设计侧（glass.css/贴图清洗/族谱，见 `docs/evidence/handoff-art-20261110.md`）。

---

## 7. 已知残留（对照圣经未覆盖项）

| 项 | 状态 | 依据 |
| --- | --- | --- |
| `src/ui/glass.css` 变量值（:26-32） | **未覆盖**，属并行展示线文件（本线白名单外），HUD 底透最终效果待其落地 | 改动记录 03:05 style.css 行（:111） |
| `src/ui/screens.css`（拟声词色 ：399-402、弹反预警、结算/设置玻璃、标题渐变等 §8/§9 项） | **未覆盖**，留展示线 | 改动记录 03:05 impact.mjs 行（:112） |
| `src/ui/titlefx.mjs` 粒子色（§9：`#f0c060/#fff2d8/#c8d4e4/#ff7ab0` 且洋红 ≤2 枚/20） | **无本线登记行**；当前 git status 为 M，属并行线改动 | 圣经 §9（:201）+ 改动记录无对应行 |
| `src/game/tuning.mjs` | 圣经无构图/手感修正条款，登记「不动」 | 改动记录 03:05（:113） |
| 圣经 §10 验收①–⑦ 存证（改前/改后截图对） | **未产生**（§2） | 本报告 §2 |
| 构建阻断史 | 设计侧 02:40 交接记录 `npm run build` 失败（MISSING_EXPORT `makeWetReflection`，stage.mjs:18 ← atmosphere.mjs，`docs/evidence/handoff-art-20261110.md` 三-①）；本书记员 03:07 静态 grep 复核：当前 `stage.mjs` 已无该引用（仅 atmosphere.mjs 注释命中）——**静态核对显示阻断已消，但本线未跑构建**（AGENTS.md §4 多线并发禁构建），构建可行性未验证 | 实跑 grep |
| dist/ 工作区 | 缺 `index.html` + `assets/*`（未提交删除态，成因未查明），线上与交付状态待恢复（§3） | 实跑 `git -C dist status` |
| Demo 视频 / 台账 | Demo 视频重录（旧录像证据已过期）、screens 版式重排（7 天包）、GLB 本体未动、`video_url/frozen_tag/submit_at` 留空 | 产线给定待办 |

---

## 8. 风险与处置

1. 本线改动**未经视觉验收、未经制作人过目**，是否采纳由制作人裁决（产线给定口径）。
2. `docs/test-report.json` 与 `docs/test-shots/` 正被并行 E2E 循环持续重写——本报告引用的读数/截图仅代表标注时刻，勿当终值。
3. 两施工线并发追加登记文件存在竞态（改动记录内 01:31/01:33 两条「冲突记录」即实证），**登记行以实际文件为准**。
4. 本次改动叠加在 2026-11-09 未提交改动之上；回滚按 RESTORE.md **全量恢复**（§5）。
