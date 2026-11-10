# 正式版收口清单 · 2026-11-09

制作人拍板：**`E:/naiwa-zzz`（霓虹箱庭街道版）= 唯一正式提交版本**。
`E:/naiwaling` 只作 Lux3D 资产、生成证据链与历史留档，不再对外提交，**不删、只读封存**。哪些能搬、哪些别碰，见同目录 `reuse-from-legacy-20261109.md`。

## 交之前必须做完（按顺序）

| # | 事 | 谁 | 算完成 |
|---|---|---|---|
| 1 | 姓名与赛事名（已核实完成） | — | 见下节；报告书抬头已改 |
| 2 | 修报告书 | 接手 agent | 名字 / 赛事名对；「11.10 计划」不再写成已实现 |
| 3 | 重录视频（已完成 · 二度重录） | — | `docs/demo-video-32s.mp4`：**44.4s / 30fps / 1920×1186 / 1333 帧**，录于 Aholo 街区层接入之后；逐秒 44 帧无废帧 |
| 4 | 换发布通道（已解决） | — | **提交填 https://www.modelscope.cn/studios/zgqy379/naiwa-zero-demo**（魔搭 Static 创空间，Running，资源全 200 实测正常）；备用直达 https://naiwa-zero-demo.app.workbuddy.host/?sharecode=NCT5AQ25MJ ；gh-pages 旧地址已废弃 |
| 5 | 回填提交台账（已回填 demo_url） | 接手 agent | `docs/submission.json` 已填魔搭链接与新视频指纹；`video_url` / `frozen_tag` / `submit_at` / `receipt` 留空——对外视频链接等发帖、冻结 tag 未打、官网未提交，**不许预填完成式** |
| 5b | **冻结前统一重发（2026-11-10 已做一轮）** | — | 美术升级后已重建 → 魔搭 git push + deploy → 重录 52.4s 视频 → 重拍 §十 9 张游戏内插图 → 同步台账与报告书。**若后续再有代码改动，需再走一轮同样的流程** |
| 5c | **统一提交 + 冻结 tag（待办）** | 设计助手（等各 agent 收工后执行） | 2026-11-09 23:5x 制作人拍板由我做。先确认无人仍在改 → 按文件归属分批 commit（不用 `git add -A`）→ 打 `freeze-2026-11-xx-final` → 回填台账 `frozen_tag` / `frozen_commit` 与构建、视频指纹 |
| 6 | 本人三件事 | 制作人 | 真人冷启动录屏 / 小红书发帖 / 官网提交 |

> **截至 2026-11-09 22:52**：第 **1–3 步已完成**——官网核实、报告书（声明 / 配图 13 张 / 弹反口径 / 版本与资产清单 / Aholo World 街区接入）、Demo 视频重录（44.4s / 30fps）均落地。第 **4–6 步待办**：闸门放行后重新部署、提交台账回填、制作人本人三件事。
>
> **22:47–22:52 制作人拍板并已完成**：视觉强度「再明显一点」（遮罩 0.18/0.56/0.60），视频与插图「都重做」——视频已二度重录（含街区层），§十 9 张游戏内插图已全部换成 22:44–22:51 的新实拍，13 张路径与编号复核通过。材料与当前构建一致。
>
> **23:09 已解决**：gh-pages 构建连续失败（20 次连续 commit 触发的 `Page build failed`、站点 `status=errored`），补 `.nojekyll`、单独触发干净构建均无效。制作人拍板换发布通道，已用站点发布能力把同一份 `dist/` 发成新链接并验证通过。**提交填新链接，别再填 gh-pages 那个旧地址。** 闸门脚本已补 `world/` 与 `.nojekyll` 上传、末尾主动触发构建，将来若 gh-pages 恢复可直接重跑。

## 现在不能填的

`demo_url` 现在可以填第 4 步那个已验证的新链接。`video_url` 与 `frozen_tag` 一律留空——视频仍是本地文件（对外视频链接要等制作人发帖）、冻结 tag 还没打，填了就是编的。
主仓库 `submission.json` 工作区仍错指着 `freeze-2026-11-07-final`，等第 5 步统一回填，别单独改。

## 已核实（2026-11-09，官网 `https://www.aholo3d.cn/hackathon`）

- **赛事只有全球赛**：全称「群核科技 Aholo 全球 3D AI 黑客松」，线上参赛 · 全球开放，无分赛区。「深圳 / 北京 / 上海站」是赛前线下 Workshop 的三站活动，不是独立比赛。报告书抬头已改。
- **报名不要求真名**：官网公开规则与 FAQ 均无「真实姓名 / 实名认证 / 身份证」条款，只有 1–3 人组队、成员 2026-11-19 19:00 锁定等约定。按制作人口径（不实名写账号名），报告书统一写「诸葛青云」（团队 `3FO4K4VY3D07` / 必胜客的汉堡最好吃），已改。
- **边界**：报名表单需登录才可见，公开页面查不到表单字段；获奖 / 领奖阶段的身份核验官网未写，只注明「以最终赛事规则和报名授权条款为准」。若之后要用真名「董青云」，须先在官网「编辑团队」改显示名，报告书再跟着改，否则材料与官网对不上（完成度 20% 要求「材料与成果匹配」）。

## 部署闸门（2026-11-09 20:47 启用；gh-pages 通道 23:09 起停用）

- **已经上线过一次**：`https://zgqy379.github.io/naiwa-zzz-demo/` 当前可访问，但 **serve 的是旧构建**（`index-DQSF8Zod.js`），22:57 之后的部署因 Pages 构建连续失败未生效。**该链接不再作为提交地址**；正式链接见第 4 步。
- **闸门已装**：`deploy-api.ps1` 开头加了 preflight，默认打印 `DEPLOY-BLOCKED` 并 `exit 1`，不向 gh-pages 提交任何文件。放行需在同一会话显式设 `NAIWA_DEPLOY_OK=1`；闸门还会复查报告书抬头是否残留「深圳站 / 董青云」。
- **当前不要走这条通道**：GitHub Pages 站点 `status=errored`，20 次连续 commit 触发的构建全部 `Page build failed`，补 `.nojekyll` 与主动触发均无效。脚本已补 `world/` / `.nojekyll` 上传和末尾主动触发构建，等 Pages 恢复再考虑重跑。别用 `gh api` / `git push` 绕过闸门。

## 魔搭创空间（已发布，2026-11-09 23:41）

- **官方核实**：魔搭社区是本届**联合办赛方**，有活动页 `modelscope.cn/events/386` 与八节官方学习内容；但页面只写「报名截止 2026-11-19 23:59」，**没有**「作品须/可发到魔搭创空间」或提交链接字段。报名与作品提交仍在 Aholo 官网（作品提交截止 **19:00**，两个时间口径不同，以官网为准）。
- **已发布并验证**：创空间 `zgqy379/naiwa-zero-demo`（Static SDK / `platform/2v-cpu-8g-mem` free / base image `ubuntu22.04-py312-torch2.10.0-modelscope1.37.0`），状态 **Running**。链接 https://www.modelscope.cn/studios/zgqy379/naiwa-zero-demo 。直连静态地址 `https://zgqy379-naiwa-zero-demo.ms.show/index.html`（会 302 到魔搭壳页，应用跑在 iframe 里）。
- **实测**：`index.html` / `assets/index-DlNwcUlO.js` / 16 只角色 GLB / `world/aholo-street.glb`（603,544 字节）全部 HTTP 200；真实浏览器打开后主界面、3D 奶蛙立绘、按钮与配色均正常（截图 `docs/evidence/modelscope-live-check.png`）。
- **推送方式（可复现）**：魔搭 OpenAPI `https://modelscope.cn/openapi/v1`；创空间代码用 git 同步，地址 `https://oauth2:<token>@www.modelscope.cn/studios/<owner>/<repo>.git`，token 取自本机 `~/.modelscope/credentials/git_token`（它**不能**当 OpenAPI Bearer 用）；触发部署 `POST /openapi/v1/studios/<owner>/<repo>/deploy`。魔搭默认 `.gitattributes` 不含 `*.glb`，GLB 走普通 git、不需 LFS；默认 `README.md` 是平台 YAML 头元数据，必须保留并加 `sdk: static` / `app_file: index.html`。
- **留档包**：`docs/naiwa-zero-modelscope-static.zip`（22 文件 / 3.61MB），供网页端「上传文件夹」方式备用。

截止 2026-11-19 19:00。
