import { readFileSync, writeFileSync } from "node:fs";
const F = "src/main.mjs";
let c = readFileSync(F, "utf8");

const OLD = `    setTimeout(() => {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(() => ensureSquadModels(), { timeout: 5000 });
      } else {
        setTimeout(() => ensureSquadModels(), 1200);
      }
    }, 1500);`;

const NEW = `    // 按**帧**门控而不是墙钟：先确认首屏已经画了 2 帧，再在浏览器空闲时预取。
    // （原先用 setTimeout(1500) 会与首屏绘制竞速——机器慢时 first-paint 被推到 1500ms 之后，
    //   预取抢在绘制前解 9.6MB 的 GLB，形成「绘制被推迟 → 预取更晚 → 绘制更晚」的反馈环，
    //   实测 first-paint 在 1.0s~3.0s 之间乱跳。）
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setTimeout(() => {
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(() => ensureSquadModels(), { timeout: 5000 });
        } else {
          setTimeout(() => ensureSquadModels(), 1200);
        }
      }, 800);
    }));`;

if (!c.includes(OLD)) { console.log("✗ 未匹配"); process.exit(1); }
c = c.replace(OLD, NEW);
writeFileSync(F, c, "utf8");
console.log("✓ 预取改为按帧门控");
