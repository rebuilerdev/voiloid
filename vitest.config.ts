import { defineConfig } from "vitest/config"

const sources = ["packages/*/src/**/*.ts", "apps/{api,gateway,bot,worker}/src/**/*.ts"]

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: sources.map((s) => s.replace("*.ts", "*.test.ts")),
          exclude: ["**/*.int.test.ts", "**/node_modules/**"],
          environment: "node",
          restoreMocks: true,
        },
      },
      {
        test: {
          name: "integration",
          include: sources.map((s) => s.replace("*.ts", "*.int.test.ts")),
          environment: "node",
          restoreMocks: true,
          // 実 PostgreSQL / Redis を共有するため、ファイル単位でも並列実行しない
          fileParallelism: false,
          globalSetup: ["./test/integration-setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: sources,
      exclude: [
        "**/*.test.ts",
        "**/test/**",
        "**/generated/**",
        "**/index.ts",
        // プロセスの起動処理（main）は E2E / スモークテストで確認する
        "apps/*/src/main.ts",
        "apps/api/src/admin.ts",
        "apps/bot/src/scripts/**",
        "packages/database/prisma/**",
      ],
      reporter: ["text-summary", "lcov", "json-summary"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
        // 振り分け・整形・契約は全分岐をテストする
        "packages/shared/src/**": { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
})
