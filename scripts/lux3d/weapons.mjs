/**
 * 官方生成 8 件「食物系」武器道具（与奶蛙家族设定同源），供角色挂手骨。
 * 道具无骨骼 → 只走文生 3D（20 积分/件），不需要绑骨。
 *
 * 用法：node scripts/lux3d/weapons.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createTask, download, outputUrls, waitTask } from "./client.mjs";

const ROOT = "E:/naiwa-zzz";
const WORK = path.join(ROOT, ".lux3d-work", "weapons");
const STATE = path.join(ROOT, ".lux3d-work", "weapons-state.json");

const WEAPONS = [
  { id: "spatula", file: "naiwa_spatula.glb", prompt: "A cartoon 3D game weapon prop: a flat stainless-steel pancake spatula with a long worn wooden handle, slightly scratched metal blade, single object centered, clean solid light grey background, stylized cartoon 3D render, high quality PBR material, whole object visible" },
  { id: "teacup", file: "naiwa_teacup.glb", prompt: "A cartoon 3D game weapon prop: a tall clear plastic cup of brown bubble tea with a wide black straw and tapioca pearls at the bottom, condensation droplets, single object centered, clean solid light grey background, stylized cartoon 3D render, high quality PBR material, whole object visible" },
  { id: "bottle", file: "naiwa_bottle.glb", prompt: "A cartoon 3D game weapon prop: a glass baby milk bottle filled with milk, a silver metal nipple and a white plastic collar, faint measurement scale printed on the glass, single object centered, clean solid light grey background, stylized cartoon 3D render, high quality PBR material, whole object visible" },
  { id: "ladle", file: "naiwa_ladle.glb", prompt: "A cartoon 3D game weapon prop: a stainless-steel soup ladle with a deep round bowl and a long straight handle, mirror-polished metal, single object centered, clean solid light grey background, stylized cartoon 3D render, high quality PBR material, whole object visible" },
  { id: "drumstick", file: "naiwa_drumstick.glb", prompt: "A cartoon 3D game weapon prop: a crispy golden fried chicken drumstick on a white bone, crunchy textured breading, single object centered, clean solid light grey background, stylized cartoon 3D render, high quality PBR material, whole object visible" },
  { id: "teapot", file: "naiwa_teapot.glb", prompt: "A cartoon 3D game weapon prop: a round brown clay teapot with a short spout and a round lid knob, matte ceramic surface, single object centered, clean solid light grey background, stylized cartoon 3D render, high quality PBR material, whole object visible" },
  { id: "rollingpin", file: "naiwa_rollingpin.glb", prompt: "A cartoon 3D game weapon prop: a wooden rolling pin with cylindrical handles at both ends and a worn wooden barrel, single object centered, clean solid light grey background, stylized cartoon 3D render, high quality PBR material, whole object visible" },
  { id: "mug", file: "naiwa_mug.glb", prompt: "A cartoon 3D game weapon prop: a white ceramic coffee mug with a thick round handle, glossy glaze, single object centered, clean solid light grey background, stylized cartoon 3D render, high quality PBR material, whole object visible" },
];

function readState() {
  if (!existsSync(STATE)) return {};
  try { return JSON.parse(readFileSync(STATE, "utf8")); } catch { return {}; }
}
function writeState(s) { mkdirSync(path.dirname(STATE), { recursive: true }); writeFileSync(STATE, JSON.stringify(s, null, 2), "utf8"); }

async function unzipTo(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  execFileSync("tar", ["-xf", zipPath, "-C", destDir], { stdio: "ignore" });
  const { readdirSync } = await import("node:fs");
  return readdirSync(destDir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.glb$/i.test(d.name)).map((d) => path.join(destDir, d.name));
}

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const targets = WEAPONS.filter((w) => !only || w.id === only);

for (const w of targets) {
  const st = readState();
  const out = path.join(ROOT, "public", "asset", w.file);
  if (st[w.id]?.final && existsSync(st[w.id].final)) { console.log(`[${w.id}] 已完成，跳过`); continue; }
  console.log(`[${w.id}] 文生3D`);
  const taskid = await createTask("/lux3d/v1/generate/text-to-3d/task/create", {
    prompt: w.prompt, style: "cartoon", version: "G1", faceCount: 12000,
    outputFormat: ["glb"], enablePbr: true,
  });
  const d = await waitTask(taskid, { intervalMs: 6000, onTick: () => {} });
  if (d.status !== 3) { console.error(`[${w.id}] 失败：${JSON.stringify(d.outputs).slice(0, 200)}`); continue; }
  const urls = outputUrls(d);
  const glb = urls.find((u) => /\.glb($|\?)/i.test(u));
  const zip = urls.find((u) => /\.zip($|\?)/i.test(u));
  const dir = path.join(WORK, w.id);
  mkdirSync(dir, { recursive: true });
  let src = null;
  if (glb) { src = path.join(dir, "textured.glb"); await download(glb, src); }
  else if (zip) {
    const z = path.join(dir, "results.zip");
    await download(zip, z);
    const glbs = await unzipTo(z, dir);
    if (!glbs.length) { console.error(`[${w.id}] ZIP 内无 GLB`); continue; }
    src = glbs[0];
  } else { console.error(`[${w.id}] 无产出`); continue; }
  // 定版化：贴图压 JPEG + 量化 + meshopt（道具无骨骼，不需要改名/动画）
  execFileSync("node", [path.join(ROOT, "scripts", "lux3d", "finalize.mjs"), "--in", src, "--out", out], { stdio: "inherit", cwd: ROOT });
  const s = readState();
  s[w.id] = { taskid, final: out };
  writeState(s);
  console.log(`[${w.id}] ✓ → ${out}`);
}
console.log("done");
