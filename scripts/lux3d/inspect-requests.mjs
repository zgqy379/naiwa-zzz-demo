/** 从公开 OpenAPI 规范里打印关键请求体结构（字段名/类型/枚举/必填/说明）。 */
import fs from "node:fs";

const spec = JSON.parse(fs.readFileSync(process.argv[2] || "C:/Users/dqy/AppData/Local/Temp/oapi.json", "utf8"));
const S = spec.components.schemas;
const names = ["lux3d_TextTo3dRequest", "lux3d_ImgTo3dRequest", "lux3d_ImageToFourViewRequest",
  "lux3d_MultimodalToImageRequest", "lux3d_HumanoidAutoRigRequest",
  "lux3d_HumanoidAnimationRetargetRequest", "lux3d_ArticulationAnimationRequest"];
for (const n of names) {
  if (!S[n]) continue;
  const sch = S[n];
  console.log("===== " + n + " =====");
  for (const [k, v] of Object.entries(sch.properties || {})) {
    const req = (sch.required || []).includes(k);
    console.log(`  ${k}: type=${v.type} enum=${JSON.stringify(v.enum)} required=${req}`);
    const d = (v.description || "").replace(/\n/g, " ");
    console.log("     " + d.slice(0, 430));
  }
  console.log("  required = " + JSON.stringify(sch.required || []));
}
