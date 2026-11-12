/**
 * Aholo / Lux3D 开放平台客户端（官方 OpenAPI）。
 *
 * 官方文档：https://labs.aholo3d.cn/api-docs（公开 OpenAPI：labs.aholo3d.cn/api-docs/openapi.json）
 * 鉴权：请求头 `Authorization: <API key>`（官方说明无需 Bearer 前缀）。
 *
 * 凭据读取顺序：
 *   1) 环境变量 LUX3D_API_KEY / LUX3D_API_SECRET / LUX3D_BASE_URL
 *   2) 仓库根目录的 .lux3d-credentials.json（已 .gitignore，本机私有）
 *
 * 本目录涉及的官方端点（全部来自官方 OpenAPI）：
 *   POST /lux3d/v1/generate/text-to-3d/task/create        文生 3D
 *   POST /lux3d/v1/generate/multimodal-to-image/task/create 多模态生图
 *   POST /lux3d/v1/generate/image-to-four-view/task/create 单图 → 四视图
 *   POST /lux3d/v1/generate/img-to-3d/task/create          图生 3D
 *   POST /lux3d/v1/animations/rig/task/create              数字人自动绑骨
 *   POST /lux3d/v1/animations/retarget/task/create         动画重定向（官方动作套已绑骨模型）
 *   POST /lux3d/v1/articulation-animation/task/create       关节化 + 运动提示词
 *   POST /lux3d/v1/generate/task/get                       任务查询
 *   POST /lux3d/v1/generate/task/list                      任务列表
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "..", "..");
const CRED_FILE = path.join(ROOT, ".lux3d-credentials.json");

export function loadCredentials() {
  const env = {
    appKey: process.env.LUX3D_API_KEY || "",
    appSecret: process.env.LUX3D_API_SECRET || "",
    baseUrl: process.env.LUX3D_BASE_URL || "",
  };
  let file = {};
  if (existsSync(CRED_FILE)) {
    try { file = JSON.parse(readFileSync(CRED_FILE, "utf8")); } catch { /* 忽略坏文件 */ }
  }
  const appKey = env.appKey || file.appKey || "";
  const appSecret = env.appSecret || file.appSecret || "";
  const baseUrl = (env.baseUrl || file.baseUrl || "https://api.aholo3d.cn").replace(/\/$/, "");
  if (!appKey) throw new Error("缺少 LUX3D_API_KEY（环境变量或 .lux3d-credentials.json）");
  return { appKey, appSecret, baseUrl };
}

/** 调一次官方端点；返回解析后的 JSON（失败时抛错并带上业务码与消息）。 */
export async function call(endpoint, body, { method = "POST", timeoutMs = 120000, query } = {}) {
  const { appKey, appSecret, baseUrl } = loadCredentials();
  const headers = { "content-type": "application/json", Authorization: appKey };
  if (appSecret) headers["X-Api-Secret"] = appSecret;
  const url = baseUrl + endpoint + (query ? "?" + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null)).toString() : "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 400) }; }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${endpoint}: ${text.slice(0, 300)}`);
  }
  // 官方统一包一层：{ c: "0" 成功, m: 提示, d: 数据, f: 失败信息 }
  if (json && json.c !== undefined && String(json.c) !== "0") {
    throw new Error(`业务失败 ${json.c} ${endpoint}: ${json.f || json.m || ""}`);
  }
  return json;
}

/** 创建任务类端点：返回 taskid。 */
export async function createTask(endpoint, body) {
  const json = await call(endpoint, body);
  const id = json?.d?.taskid ?? json?.d?.taskId ?? json?.d?.id ?? json?.d;
  if (id == null) throw new Error(`创建任务未返回 taskid: ${JSON.stringify(json).slice(0, 300)}`);
  return id;
}

/** 轮询任务状态直到终态；返回任务详情对象。 */
export async function waitTask(taskid, { timeoutMs = 20 * 60 * 1000, intervalMs = 8000, onTick } = {}) {
  const t0 = Date.now();
  let last = "";
  for (;;) {
    const json = await call("/lux3d/v1/generate/task/get", undefined, { method: "GET", query: { taskid } });
    const d = json?.d ?? {};
    const status = d.status;
    const brief = `task ${taskid} status=${status}` + (d.message ? ` msg=${String(d.message).slice(0, 80)}` : "");
    if (brief !== last) { last = brief; onTick?.(d); }
    // 官方 status 枚举：0 排队 / 1 处理中 / 3 成功 / 4 失败 / 6 取消
    if (status === 3 || status === 4 || status === 6) return d;
    if (Date.now() - t0 > timeoutMs) throw new Error(`任务超时: ${brief}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** 取任务输出里的全部 URL（官方结构：d.outputs[].content，可能是 URL 或 JSON 数组/对象字符串）。 */
export function outputUrls(taskDetail) {
  const outs = taskDetail?.outputs || [];
  const urls = [];
  const scan = (v) => {
    if (typeof v === "string") {
      if (/^https?:\/\//.test(v)) urls.push(v);
      else {
        try { scan(JSON.parse(v)); } catch { /* 非 JSON 忽略 */ }
      }
    } else if (Array.isArray(v)) {
      for (const x of v) scan(x);
    } else if (v && typeof v === "object") {
      for (const val of Object.values(v)) scan(val);
    }
  };
  for (const o of outs) scan(o?.content);
  return [...new Set(urls)];
}

/** 从任务结果里递归找出第一个 URL（结果结构随任务类型不同）。 */
export function findUrl(obj, keys = ["url", "modelUrl", "zipUrl", "fileUrl", "downloadUrl", "resultUrl", "path"]) {
  if (!obj) return null;
  if (typeof obj === "string") return /^https?:\/\//.test(obj) ? obj : null;
  if (Array.isArray(obj)) {
    for (const it of obj) { const u = findUrl(it, keys); if (u) return u; }
    return null;
  }
  if (typeof obj === "object") {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
    }
    for (const v of Object.values(obj)) { const u = findUrl(v, keys); if (u) return u; }
  }
  return null;
}

/** 下载到本地文件。 */
export async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  return buf.length;
}
