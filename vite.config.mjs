import { defineConfig } from "vite";

/**
 * CSS 压缩（lightningcss）会把「标准 backdrop-filter + 同值 -webkit- 前缀别名」
 * 去重成只剩前缀版，而 Chrome 154 已移除该别名 → 计算值恒 none，桌面真玻璃
 * 静默失效、控制台还不报错。这里在产物里把标准属性补回来；不改源码写法、
 * 不加构建依赖。
 *
 * 源码里**只写标准属性**（`backdrop-filter: var(--xxx)`），前缀由本插件补。
 * 插件认的是 `backdrop-filter:var(--变量名)` 这个形态（可带空格），
 * 改样式表时务必保持该写法，否则正则匹配不上。
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
          /(-webkit-)?backdrop-filter:\s*var\(--[a-z0-9-]+\)/gi,
          (m) => {
            // 归一化成 `backdrop-filter:var(--x)` 再补前缀，避免重复替换
            const body = m.replace(/^\s*(-webkit-)?/, "").replace(/\s+/g, "");
            return `${body};-webkit-${body}`;
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
