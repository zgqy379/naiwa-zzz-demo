import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages 项目页（/naiwa-zzz-demo/）需要相对路径
  base: "./",
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
  },
});
