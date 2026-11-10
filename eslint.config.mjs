import globals from "globals";

/** 与项目无关、必须排除的目录/文件（构建产物、临时目录、证据归档、一次性脚本） */
const IGNORES = [
  "node_modules/**",
  "dist/**",
  ".tmp-*/**",
  ".tmp-*",
  ".ego-tmp-*",
  ".ego-tmp-tex/**",
  ".verify-build/**",
  ".site-publish/**",
  ".codeartsdoer/**",
  "docs/**",
  "public/**",
  "scripts/**",
  "vite.config.mjs",
  "eslint.config.mjs",
];

/** 本项目统一启用的规则：只保留高信号、零噪音的项，不引 recommended 以免历史代码被噪声淹没 */
const RULES = {
  "no-undef": "error", // R5.2：未声明的全局标识符（历史故障 NEON_PALETTE is not defined）
  "no-redeclare": "error",
  "no-dupe-keys": "error",
  "no-dupe-args": "error",
  "no-unreachable": "error",
  "no-const-assign": "error",
  "no-fallthrough": "error",
  "no-self-compare": "error",
  "no-cond-assign": "error",
};

export default [
  { ignores: IGNORES },
  {
    files: ["src/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules: RULES,
  },
  {
    files: ["tests/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node, // process / Buffer / console
        ...globals.browser, // page.evaluate 回调在浏览器上下文求值：window / document / KeyboardEvent 等
        taskSpace: "readonly", // ego 宿主注入的全局（真实报错 tests/run-game-test.mjs:16 反推，运行时由 typeof 守卫）
      },
    },
    rules: RULES,
  },
];