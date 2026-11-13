/**
 * 修花名册里被判「不可绑骨」的两只：官方自动绑骨会把带**动物解剖特征**（喙、鸡冠）
 * 或**服装歧义**（护士帽）的模型判为「非类人形角色」而拒绝绑定。
 * 改法：把动物特征改成**布艺/道具**（可穿戴的软帽），保留辨识度但不再是解剖特征。
 */
import { readFileSync, writeFileSync } from "node:fs";

const F = "scripts/lux3d/roster.json";
const r = JSON.parse(readFileSync(F, "utf8"));

const PATCH = {
  // 奶鸡：红鸡冠 + 橙喙 → 软布鸡冠帽 + 橙围巾（去掉喙这种解剖特征）
  shell_naiji: [
    "with a small bright red comb on top of the head and a tiny orange beak",
    "wearing a tiny soft red fabric hat shaped like a rooster crest on the top of the head and a small orange scarf around the neck",
  ],
  // 奶粉：白护士帽 + 粉围裙 → 白小帽 + 粉围裙（护士帽易被判为非人形）
  shell_naifen: [
    "wearing a small white nurse cap on the head and a pale pink apron tied around the belly",
    "wearing a small plain white folded hat on the head and a pale pink apron tied around the belly",
  ],
};

let n = 0;
for (const c of r.characters) {
  const p = PATCH[c.id];
  if (!p) continue;
  if (!c.prompt.includes(p[0])) { console.log("  ✗ " + c.id + " 提示词未匹配，跳过"); continue; }
  c.prompt = c.prompt.replace(p[0], p[1]);
  c.distinctive = c.id === "shell_naiji"
    ? "奶黄底色 + 头顶布艺鸡冠小红帽 + 橙色围巾"
    : "奶粉白底色 + 白色小帽 + 淡粉围裙";
  n++;
  console.log("  ✓ " + c.id + " 提示词已改");
}
writeFileSync(F, JSON.stringify(r, null, 2) + "\n", "utf8");
console.log("已改 " + n + " 只");
