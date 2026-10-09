// @ts-check
import js from "@eslint/js"
import prettier from "eslint-config-prettier"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: [
      // Web GUI は apps/web の eslint.config.mjs（Next.js）で検査する
      "apps/web/**",
      "prototype/**",
      "**/dist/**",
      "**/coverage/**",
      "packages/database/src/generated/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { arguments: false } }],
      // スタイル上の制約で、誤りの検出には寄与しないため無効にする
      "@typescript-eslint/no-confusing-void-expression": "off",
      eqeqeq: ["error", "always"],
      // ログは各アプリの logger（pino）を使う
      "no-console": "error",
    },
  },
  {
    files: ["**/*.test.ts", "**/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      // expect(mock.method) の形で頻繁に使うため
      "@typescript-eslint/unbound-method": "off",
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // CLI スクリプト・Seed は標準出力に結果を出す
    files: ["**/scripts/**", "**/prisma/seed.ts"],
    rules: { "no-console": "off" },
  },
  prettier,
)
