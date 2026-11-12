/**
 * 摸底：账号历史任务（官方 API 已有 auto-rig / animation-retarget 记录）+ 任务产出结构。
 * 用法：node scripts/lux3d/inspect-tasks.mjs
 */
import { call, outputUrls } from "./client.mjs";

const list = await call("/lux3d/v1/generate/task/list", undefined, { method: "GET", query: { page: 1, pagesize: 30 } });
const items = list?.d?.items || [];
console.log("任务总数 =", list?.d?.total ?? "?", " 本页 =", items.length);
for (const t of items) {
  const st = { 0: "排队", 1: "运行中", 3: "成功", 4: "失败", 6: "取消" }[t.status] ?? t.status;
  console.log(`  ${t.taskId}  ${String(t.taskType).padEnd(22)} ${st}  credits=${t.consumedCredits}  ${new Date(t.created).toISOString().slice(0, 16)}`);
}

// 逐个查详情，重点看成功任务的 outputs 结构
for (const t of items.slice(0, 8)) {
  const d = (await call("/lux3d/v1/generate/task/get", undefined, { method: "GET", query: { taskid: t.taskId } }))?.d;
  console.log(`\n=== task ${t.taskId} (${t.taskType}) status=${d?.status} ===`);
  console.log("  keys:", Object.keys(d || {}).join(","));
  if (d?.message) console.log("  message:", String(d.message).slice(0, 200));
  if (d?.errorMessage || d?.error) console.log("  error:", String(d.errorMessage || d.error).slice(0, 200));
  const outs = d?.outputs || [];
  outs.forEach((o, i) => {
    const c = typeof o?.content === "string" ? o.content.slice(0, 220) : JSON.stringify(o?.content).slice(0, 220);
    console.log(`  output[${i}] keys=${Object.keys(o || {}).join(",")} content=${c}`);
  });
  const urls = outputUrls(d);
  if (urls.length) console.log("  urls:", urls.map((u) => u.split("/").pop()).join(" | "));
}
