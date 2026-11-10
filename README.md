# 奶蛙零 · 正式版（唯一提交载体）

> **2026-11-09 制作人拍板**：本仓库 `E:/naiwa-zzz`（霓虹箱庭街道版）是**唯一正式提交版本**。
> `E:/naiwaling` 是旧仓库，**不删、只读封存**：只作 Lux3D 资产、生成证据链与历史留档，不再改代码 / 提交 / 部署。

## 开工前先读

1. `E:/naiwaling/BRIEF.md` —— 创作方向唯一依据（融合怎么判、家族 16 只、参考图可借 / 必删）。
2. `docs/evidence/reuse-from-legacy-20261109.md` —— 旧仓库哪些能搬、哪些别碰（已搬第一批见文首）。
3. `docs/evidence/final-alignment-20261109.md` —— 交材料前的收口顺序与待办。

## 当前硬规矩

- **提交用在线 Demo**：https://www.modelscope.cn/studios/zgqy379/naiwa-zero-demo —— 魔搭 **Static** 创空间，2026-11-09 23:41 起 Running；站点读远端 **`master` 分支**（保留 `README.md` 平台元数据），部署版本口径见 `docs/submission.json` 的 `demo_url_note`。当前首页已改版为视频背景 + WebGL 液态玻璃，不再是静态 3D 立绘。
- **备用直达链接**：https://naiwa-zero-demo.app.workbuddy.host/?sharecode=NCT5AQ25MJ —— 同一份构建，直连 Demo 无 iframe 壳。
- gh-pages 旧地址因 GitHub Pages 构建连续失败仍停在旧构建，**不再使用**；`deploy-api.ps1` 闸门保留（放行需 `NAIWA_DEPLOY_OK=1`，别用 `gh api` / `git push` 绕过），若 Pages 恢复可重跑。
- Demo 视频 `docs/demo-video-32s.mp4` **已重录达标**（52.4 秒 / 5,509,596 B / 30fps / 1920×1186），且录于 Aholo 街区层接入之后；镜头脚本 `docs/evidence/record-shotlist-20261109.md`。旧 `demo-video-hd.mp4`（8.1s / 10fps）只作迭代对比，不再交付。（数值与 `docs/submission.json` 的 `rec_duration/rec_bytes/rec_sha256` 一致）
- HUD 脏玻璃参数 `docs/evidence/hud-glass-spec-20261109.md`；搬玻璃代码时连 `keepStandardBackdropFilter()` 插件一起带过去。
- 共享热点 `src/main.mjs` 改动先登记 `docs/改动记录-角色线.md`（展示线已有此约定）。
- 报告书 `docs/报告书.md` 里标「未完成」的功能不许写成已实现（官网完成度分要求「材料与成果匹配」）。

官网：`https://www.aholo3d.cn/hackathon` · 截止 **2026-11-19 19:00**。
