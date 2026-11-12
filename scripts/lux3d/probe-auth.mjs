/**
 * 探测 Lux3D 网关的鉴权形式（不消耗积分：GET task/list）。
 * 用法：node scripts/lux3d/probe-auth.mjs
 */
import { loadCredentials } from "./client.mjs";

const { appKey, appSecret, baseUrl } = loadCredentials();
console.log("baseUrl =", baseUrl, " appKey =", appKey.slice(0, 4) + "…" + appKey.slice(-3), " secret =", appSecret ? "有" : "无");

const forms = [
  ["Authorization: appKey", { Authorization: appKey }],
  ["Authorization: appKey:appSecret", { Authorization: appKey + ":" + appSecret }],
  ["Authorization: Bearer appKey", { Authorization: "Bearer " + appKey }],
  ["Basic appKey:appSecret", { Authorization: "Basic " + Buffer.from(appKey + ":" + appSecret).toString("base64") }],
  ["X-Api-Key + X-Api-Secret", { "X-Api-Key": appKey, "X-Api-Secret": appSecret }],
  ["X-API-Key", { "X-API-Key": appKey }],
];

for (const [label, headers] of forms) {
  const url = baseUrl + "/lux3d/v1/generate/task/list?page=1&pagesize=3";
  try {
    const r = await fetch(url, { method: "GET", headers: { "content-type": "application/json", ...headers } });
    const t = (await r.text()).slice(0, 300);
    console.log(`[${label}] -> ${r.status} ${t}`);
  } catch (e) {
    console.log(`[${label}] -> ERR ${String(e).slice(0, 110)}`);
  }
}
