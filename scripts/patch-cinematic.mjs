import { readFileSync, writeFileSync } from "node:fs";
const F = "src/vfx/cinematic.mjs";
let c = readFileSync(F, "utf8");
let n = 0;
c = c.replace(/this\.zoomT = 0\.16 \* strength;/, () => { n++; return "this.zoomT = 0.2 * strength;"; });
c = c.replace(/this\.zoomDur = 0\.16 \* strength;/, () => { n++; return "this.zoomDur = 0.24 * strength;"; });
c = c.replace(/this\.shakeT = 0\.18 \* strength;/, () => { n++; return "this.shakeT = 0.22 * strength;"; });
if (n < 3) { console.log("✗ 只替换了 " + n + " 处"); process.exit(1); }
writeFileSync(F, c, "utf8");
console.log("✓ cinematic.onHit 冲击已加强（" + n + " 处）");
