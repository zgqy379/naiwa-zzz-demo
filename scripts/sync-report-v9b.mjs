/** 报告书 §2.3 补写第 ⑨ 条：rest 姿态校正（本轮自研核心）。 */
import { readFileSync, writeFileSync } from "node:fs";

const F = "docs/报告书.md";
let t = readFileSync(F, "utf8");

const ANCHOR = "**⑤ 武器挂手骨 + 相撞反馈**";
const NEW = `**④-bis 官方动画为什么不能直接共享（2026-11-13 实测推翻了我们上一版的判断）**
上一版结论是「官方绑骨对任何角色都产出同一套骨架 → 动画片段可以做成一个共享库」。本轮实测**推翻**了它：
- 官方「动画重定向」的产出（\`anim.glb\`）**不是**在绑骨产出（\`rigged.glb\`）上做的 —— retarget 会**重新导出模型**（顶点数 18,355 → 19,566），骨架的 rest 姿态也随之改变：**Hips 位移差 0.08、躯干角差 2~5°、手指角差最多 73°**；
- 而且官方把片段**烘焙成源角色骨架的「绝对局部旋转」**（不是相对 rest 的增量）。
→ 直接把一个共享库套到别的角色上：小幅片段（Idle / Walk）勉强站得住，**大幅片段（挥击 / 翻滚 / 倒地）会直接躺倒**；实测截图见 \`docs/evidence/anim-probe/cmp-newlib-vs-oldlib.png\`。

**④-ter 自研 rest 姿态校正（零额外 API 积分）**
按标准的**世界空间 delta 法**把官方片段换算到每只角色自己的骨架上（\`scripts/lux3d/apply-rest-correction.mjs\`）：
\`\`\`
D(b,k)      = W_srcRest(b)⁻¹ · W_srcAnim(b,k)        // 源角色的运动 delta（与目标角色无关）
W_tgt(b,k)  = W_tgtRest(b) · D(b,k)                  // 目标角色自己的 rest + 同样的 delta
A_tgt(b,k)  = W_tgtAnim(parent,k)⁻¹ · W_tgt(b,k)     // 换算回目标骨架的局部旋转
T_tgt       = T_tgtRest + (T_srcAnim − T_srcRest)    // 位移同理（根骨的相对位移）
\`\`\`
关键性质：**在 rest 帧退化为恒等**（网格不被拉扯），且**运动是角色无关的**——因此只需算一次源角色的 delta，就能换算到全部 16 只。
- 代价：**零**官方 API 积分（本轮官方余额已见底，见 §2.3 ⑩）；
- 收益：16 只角色各自带着**按自己骨架校正过的** 10 段官方片段随角色文件交付，游戏侧无需任何改动（\`attachClipDriver\` 本来就优先用角色自带片段）；
- 验证：16 只 × {绑定姿势 / Idle / 挥击 A / 挥击 B} 四组对照渲染，**全部站直**（\`docs/evidence/anim-probe/cmp-corrected-clips.png\`、\`docs/evidence/v3-roster-sheet-20261113.png\`）。

`;

if (!t.includes(ANCHOR)) { console.log("✗ 未找到锚点"); process.exit(1); }
t = t.replace(ANCHOR, NEW + ANCHOR);
writeFileSync(F, t, "utf8");
console.log("✓ §2.3 已补入「共享动画库失效 + 自研 rest 姿态校正」");
