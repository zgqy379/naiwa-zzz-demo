// 看 OpenAPI 规范：servers、全部路径前缀、task/get 与 task/list 的方法与真实路径
import fs from "node:fs";

const spec = JSON.parse(fs.readFileSync(process.argv[2] || "C:/Users/dqy/AppData/Local/Temp/oapi.json", "utf8"));
console.log("servers =", JSON.stringify(spec.servers));
console.log("host/basePath =", spec.host, spec.basePath);
const paths = Object.keys(spec.paths || {});
console.log("路径总数 =", paths.length);
const prefixes = {};
for (const p of paths) {
  const pre = p.split("/").slice(0, 3).join("/");
  prefixes[pre] = (prefixes[pre] || 0) + 1;
}
console.log("前缀分布 =", JSON.stringify(prefixes, null, 1));
console.log("含 lux3d 的路径 + 方法：");
for (const p of paths.filter((x) => /lux3d/i.test(x))) {
  console.log("  " + Object.keys(spec.paths[p]).join(",").toUpperCase().padEnd(6) + " " + p);
}
console.log("含 task 的路径：");
for (const p of paths.filter((x) => /task/i.test(x))) {
  console.log("  " + Object.keys(spec.paths[p]).join(",").toUpperCase().padEnd(6) + " " + p);
}
console.log("含 animation / rig 的路径：");
for (const p of paths.filter((x) => /anim|rig/i.test(x))) {
  console.log("  " + Object.keys(spec.paths[p]).join(",").toUpperCase().padEnd(6) + " " + p);
}
console.log("\n=== task/list 与 task/get 细节 ===");
for (const p of ["/lux3d/v1/generate/task/list", "/lux3d/v1/generate/task/get"]) {
  const it = spec.paths[p];
  if (!it) { console.log(p + " 不存在"); continue; }
  for (const [m, op] of Object.entries(it)) {
    console.log(`\n${m.toUpperCase()} ${p}`);
    console.log("  summary:", op.summary);
    console.log("  desc:", (op.description || "").slice(0, 700));
    console.log("  body:", JSON.stringify(op.requestBody?.content?.["application/json"]?.schema));
    console.log("  params:", JSON.stringify(op.parameters || []).slice(0, 500));
    console.log("  resp200:", JSON.stringify(op.responses?.["200"]?.content?.["application/json"]?.schema));
  }
}
