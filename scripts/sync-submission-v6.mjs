import { readFileSync, writeFileSync } from "node:fs";

// 回填提交台账（第 6 版真实回执）
const F = "docs/submission.json";
const j = JSON.parse(readFileSync(F, "utf8"));

j.$comment = j.$comment
  .replace("【2026-11-12 第六次更新】", "【2026-11-12 第七次更新：第 6 版已提交】")
  .replace("frozen_tag / frozen_commit 随每次重录回填（最近一次 2026-11-12：tag 指向 0f032ef，待第六版重指）",
    "frozen_tag / frozen_commit 随每次重录回填（2026-11-12 第六版已重指：freeze-2026-11-11-final → ba2f342）");

j.submit_at = "2026-11-12T21:10:00+08:00";
j.frozen_commit = "ba2f3427edbe6e61a975077f61286396a212dcd0";
j.receipt = "第 6 版 · 提交于 2026-11-12 21:10（赛事站 https://www.aholo3d.cn/hackathon/my →「我的参赛 → 我的作品」→ 修改提交 → 提交新版本，团队编号 3FO4K4VY3D07）；平台状态「已提交 · 作品已进入资格与完整性审核」；平台提示「作品已进入资格与完整性审核。请确保 Demo、视频和其他链接在结果公布前持续有效」与「截止前可多次提交，评审以 11 月 19 日 19:00 前最后一次成功提交的版本为准」。提交项：Demo = https://www.modelscope.cn/studios/zgqy379/naiwa-zero-demo ；项目报告书 = 上传文件 report.pdf（17.8 MB / 18,698,927 B，sha256 537b0a556cc11a38df1d850b2c921ba9b64725c890fa15dc9c44a9045474fe1a，与本仓 docs/report.pdf 逐字节一致）；生态合作设备/技术使用情况 = 无；应用赛道 = 游戏应用奖、空间设计应用奖；项目源代码 = https://github.com/zgqy379/naiwa-zzz-demo/tree/main ；社交媒体发布链接 = 空（加分项，见下）。提交后卡片实拍 docs/evidence/v3-hackathon-submit-v6-20261112.png，提交前表单实拍 docs/evidence/v3-hackathon-submit-v6-form-20261112.png，前后状态快照 docs/evidence/v3-hackathon-submit-v6-result-20261112.json。前一版为第 5 版（2026-11-12 13:31）。";
j.report_pdf_note = "2026-11-12 第六版报告书 PDF（已上传为第 6 版附件）：docs/report.pdf，36 页 / 18,698,927 B，sha256 537b0a556cc11a38df1d850b2c921ba9b64725c890fa15dc9c44a9045474fe1a（中文可检索，内嵌图 14–17 骨骼与武器证据）。平台第 6 版卡片显示「report.pdf · 17.8 MB」。";
j.demo_url_note = "提交填魔搭 Static 创空间 https://www.modelscope.cn/studios/zgqy379/naiwa-zero-demo （2026-11-12 部署第六版定版构建 index-CP5WV8oE.js，dist 44 个交付文件 / 21.33 MB）：**44/44 文件 GET 全部 200**，五项关键文件与本仓 dist/ **逐字节一致**（入口 index.html 93FBBF3F2CFA5AB8、主 JS assets/index-CP5WV8oE.js 8F8836D0AE2B55D5、CSS assets/index-BnIDec0l.css E9056643B6D1168B、bg/title.mp4 DA18AB01B02C594A、fonts/LICENSES.txt 18A6B716E5A31801），旧构建 assets/index-C6e6LaWv.js 已 404 下线；含 bg/title.mp4 8.33 MiB 与 fonts/LICENSES.txt（OFL 1.1 字体许可全文，随包分发）。备用直连（gh-pages，commit eeb1697）：https://zgqy379.github.io/naiwa-zzz-demo/ （五项关键文件 200，旧构建同样 404）。原 workbuddy 地址已失效（只返回引用旧构建 index-iKSx0O26.js 的壳页、静态资源全部 403），不再使用。本构建已并入「绝区零对标深度改造」阶段 A-G 八个系统（失衡 / 极限闪避+支援点 / 连携技 QTE / 喧响值终结技 / 属性异常+紊乱+弱点 / 结算首领狂暴 / 鸣徽三选一）与「骨骼与动作重做」（16 只角色官方 Lux3D 自动绑骨 52 关节 Mixamo 骨架 + 官方动作库 20 段经两个共享动画库驱动 + 8 件官方武器挂右手骨骼 + 命中帧金属相撞特效与金属撞击音）。Demo 视频已于 2026-11-12 第六次重录：docs/demo-video-20261111.mp4（83.2 秒 / 2496 帧，全页含 DOM HUD / 液态玻璃 / 实时 3D 选人 / 3D 光标 / 视频背景，片中角色为官方骨骼动作驱动、武器相撞可见）；报告书 §十图 3-图 5 重拍（v3-show4）、图 6 为 NPR-PBR 同机位对照（像素差分 2.35%）、图 13 为 Aholo 视差层开/关 A/B 对照（像素差分 2.94%），图 7-图 11 随 E2E 33/33 复跑刷新（docs/test-shots），新增图 14-17（16 只花名册 / 旧新资产对比 / 官方武器道具）。";

writeFileSync(F, JSON.stringify(j, null, 2) + "\n", "utf8");
console.log("submission.json 已回填第 6 版回执");
console.log("  submit_at   =", j.submit_at);
console.log("  frozen_commit =", j.frozen_commit);
