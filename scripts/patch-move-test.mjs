import { readFileSync, writeFileSync } from "node:fs";
const F = "tests/game-test.mjs";
let c = readFileSync(F, "utf8");

const OLD = `await evalPage(() => { if (window.__npr) window.__npr.debugNoOpponentAI = true; });`;
const NEW = `await evalPage(() => {
        const n = window.__npr;
        if (!n) return;
        // 2026-11-13 战斗手感 v1：对手改为**主动进攻**，玩家可能在测量窗口内被打进
        // 受击硬直（受击动画的根节点位移会污染「屏幕左分量」的投影）。
        // 因此测量前：冻结对手 AI + 血量拉满 + 等受击动作结束（判据不变）。
        n.debugNoOpponentAI = true;
        const a = n.squad.active;
        if (a) a.hp = a.maxHp;
      });
      for (let i = 0; i < 20; i++) {
        const inHit = await evalPage(() => window.__npr?.squad?.active?.anim?.action === "hit");
        if (!inHit) break;
        await page.waitForTimeout(250);
      }`;

if (!c.includes(OLD)) { console.log("✗ 未匹配"); process.exit(1); }
c = c.replace(OLD, NEW);
writeFileSync(F, c, "utf8");
console.log("✓ WASD 用例已加「血量拉满 + 等受击结束」");
