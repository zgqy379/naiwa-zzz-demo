---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 0318fdbb00196b734d2da6db32d25afd_f186e4b7dc4811f1ba6252540064ee0f
    ReservedCode1: zN74z4ZDHXq0kWIyebGrb3V9P1RS7k5WJUlRcjgo0Bv0vJ0YZoFDZZ61Sm56UGWOToibXhpijFdAdTf0LFNFrVFNkfjlV0khkzKYrRMq9+NYhna/vHcP9XuJ88GpgZTegXKcvn0X7QFkI6GMblnj0W3qfdDzAWjoPN1zUR3p3MW4mG4zub0p/kNy1PA=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 0318fdbb00196b734d2da6db32d25afd_f186e4b7dc4811f1ba6252540064ee0f
    ReservedCode2: zN74z4ZDHXq0kWIyebGrb3V9P1RS7k5WJUlRcjgo0Bv0vJ0YZoFDZZ61Sm56UGWOToibXhpijFdAdTf0LFNFrVFNkfjlV0khkzKYrRMq9+NYhna/vHcP9XuJ88GpgZTegXKcvn0X7QFkI6GMblnj0W3qfdDzAWjoPN1zUR3p3MW4mG4zub0p/kNy1PA=
---

# AGENTS.md · 奶蛙零 v3 多线协作契约

> 本文件是仓库内所有 Agent（人或模型）的强制协作契约。**开工前必读，改共享文件前必登记。**
> 最后更新：2026-11-09

## 1. 项目坐标

| 项 | 值 |
| --- | --- |
| 工作仓库 | `E:\naiwa-zzz`（唯一正式提交版本体） |
| git 历史 | 仅 1 提交 `0fb882e`，工作区存在未提交改动 |
| 只读封存 | `E:\naiwaling`（早期仓库，**禁止任何修改，禁止作为构建源**） |
| 赛事截止 | 2026-11-19 19:00 |
| 技术栈 / 目标 | Three.js + WebGL，静态站点托管 |

## 2. 三条并行线（职责边界，禁止越界）

| 线 | 职责 | 可改范围 | 禁止改 |
| --- | --- | --- | --- |
| 世界线 | 玩法、关卡、敌人、物理、可破坏物 | `src/world/`、`src/game/`（除 tuning.mjs） | `dist/`、报告书 |
| 展示线 | 镜头、材质、UI、演示观感 | `src/render/`、`src/ui/`、`src/vfx/cinematic.mjs`、`src/game/tuning.mjs` | `dist/`、报告书正文 |
| 收口线 | 收口清单、部署、台账、提交物 | `docs/`、`scripts/`、根目录配置 | `src/` 逻辑（须经对应线同意） |

## 3. 共享热点：`src/main.mjs`

`src/main.mjs` 被三条线同时引用，是唯一的写冲突热点。规则：

1. **改前必登记**：先在 `docs/改动记录-角色线.md` 追加一行（日期 / 文件 / 改动 / 负责人），再动代码。
2. **最小改动**：不重排、不整文件格式化、不顺手清理无关代码。
3. **改后即验**：`node --check src/main.mjs` + 一次构建，确认无回归再交回。
4. **发现被覆盖**：登记过的改动若在源码中消失，**不要静默重写**，先在本文 §6 交接状态记一条冲突，再补一行「第 N 轮：补回 xxx」的登记，原登记行不得删改。

## 4. `dist/` 构建产物：唯一构建权

`dist/` 内含独立 `.git`（gh-pages 用途），是线上站点与 Demo 视频的唯一来源。

- **禁止**在任何情况下手改 `dist/` 内文件。
- **禁止**在多线同时写 `src/` 时构建；构建前确认工作区状态干净、无其它 Agent 正在运行。
- 每次构建后在 §6 记录：构建时间、`dist/index-*.js` 的 hash、构建人。
- **Demo 视频/截图只能取自最近一次登记的构建**；构建后未重录即为过期证据，交付说明中必须标注。

## 5. 部署闸门

`scripts/deploy-api.ps1` 默认 `DEPLOY-BLOCKED`，只有显式设置 `NAIWA_DEPLOY_OK=1` 才放行。**任何人不得为「先跑通」而改掉这个默认值。**

已知缺陷：脚本为 UTF-8 无 BOM，在 PowerShell 5.1 下报语法错。处置二选一（改动需登记）：
- 用 PowerShell 7（`pwsh`）执行；
- 或转存为 UTF-8 with BOM（不改逻辑）。

## 6. 交接状态（每次收工必须更新）

```
### 交接 <日期> by <线/人>
- 已做：
- 未做 / 待办：
- 待验证：
- 产物与证据路径：
- 最近构建：dist/index-<hash>.js @ <时间>
- 已知冲突 / 风险：
```

### 交接 2026-11-09 22:22 by 收口线

- 已做：建立 `AGENTS.md`（本文件）；修复 `docs/改动记录-角色线.md` 表格粘连（原 `style.css` 行与 `tuning.mjs` 第二轮行串行成一行），并补「登记与源码不符」段，附 visualScale 缺失证据。
- 未做 / 待办：报告书三处失实修订（§3.1、§3.3、§六）需单独立项，等仓库安静后再做；Demo 视频重录（现视频取自 21:55 前的构建，已落后于 22:20:50 的构建）。
- 待验证：`visualScale` 补回（`src/` 至今 0 命中）。
- 产物与证据路径：`docs/改动记录-角色线.md`、`docs/evidence/v3-show2-metrics.json`。
- 最近构建：`dist/assets/index-CBoCWc7Y.js` @ 22:20:50 —— 由展示线在收口核查期间构建，**非收口线产出，未经收口验收**。
- 已知冲突 / 风险：收口核查期间（22:18–22:21）展示线仍在持续写 `src/main.mjs` 并重建 `dist/`，多线并发写共享热点的情形**正在发生**，本契约 §3、§4 尚未被并行线遵守。

## 7. 已知事实（勿重复排查）

- 弹反系统**已实现**：`src/game/counter.mjs` 为完整逻辑，`src/main.mjs` 已接入 `spawnCrates` / `spawnCover` / `hitTest` / `destroy`；构建产物中含「成功弹反」「spawnCrates」字样。
- 可破坏箱 / 掩体**已实现**，不属于「计划中」。
- 线上站点跑的是旧构建（`index-DQSF8Zod.js`），落后于当前工作区。
- `docs/改动记录-角色线.md` 中 `visualScale` 已登记但源码缺失（疑并行覆盖），详见该文件「登记与源码不符」段。
- `submission.json` 仅存在于 `naiwaling`，且指向旧仓库；正式提交前需在 `naiwa-zzz` 内重建。
- `dist/` 在版本库中以 gitlink 记录，但仓库无 `.gitmodules`，克隆后需单独处理。

## 8. 禁止清单

- 不得修改或删除 `E:\naiwaling` 下任何文件。
- 不得在未登记的情况下修改 `src/main.mjs`。
- 不得手改 `dist/` 内文件。
- 不得在报告书中写入未经代码验证的「未实现 / 已实现」结论；报告书修订须单独立项，不与其他改动混做。
*（内容由AI生成，仅供参考）*
