import { defineConfig } from "vite";

/**
 * CSS 压缩（lightningcss）会把「标准 backdrop-filter + 同值 -webkit- 前缀别名」
 * 去重成只剩前缀版，而 Chrome 154 已移除该别名 → 计算值恒 none，桌面真玻璃
 * 静默失效、控制台还不报错。这里在产物里把标准属性补回来；不改源码写法、
 * 不加构建依赖。
 *
 * 插件现在匹配**任意取值形态**（var() / blur() / url() 混合皆可），
 * 为每条声明同时补回标准属性与前缀降级版；含 url() 位移滤镜时前缀版会
 * 去掉 url()，让 Safari / Firefox 优雅退化为通透磨砂。
 * 2026-11-11：原来只认 var()，导致所有字面量 blur() 面板在 Chrome 154 上
 * 计算值恒 none（玻璃静默失效），已修。
 */
function keepStandardBackdropFilter() {
  return {
    name: "keep-standard-backdrop-filter",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== "asset" || !file.fileName.endsWith(".css")) continue;
        file.source = String(file.source).replace(
          /(-webkit-)?backdrop-filter:\s*([^;}]+)/gi,
          (_m, _prefix, raw) => {
            const v = raw.trim().replace(/\s+/g, " ");
            if (/^(none|inherit|initial|unset|revert)$/i.test(v)) {
              return `backdrop-filter:${v};-webkit-backdrop-filter:${v}`;
            }
            // Safari / Firefox 不支持 backdrop-filter 里的 url() 位移滤镜：
            // 前缀版去掉 url()，只留 blur/saturate/brightness，优雅降级为通透磨砂。
            const webkit = v.replace(/\s*url\(#[^)]*\)/gi, "").trim() || "none";
            return `backdrop-filter:${v};-webkit-backdrop-filter:${webkit}`;
          },
        );
      }
    },
  };
}

export default defineConfig({
  // GitHub Pages 项目页（/naiwa-zzz-demo/）需要相对路径
  base: "./",
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
  },
  plugins: [keepStandardBackdropFilter()],
});
