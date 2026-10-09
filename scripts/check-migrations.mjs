// Migration Review の補助: 追加・変更された migration.sql に破壊的な変更が含まれていないか確認する。
//
// 破壊的な変更（列・テーブルの削除、型変更、NOT NULL の即時追加など）は段階的に行う方針のため、
// 意図的に含める場合は migration.sql に次のコメントを書き、レビューで確認する:
//   -- migration-review: <理由と、段階的移行の何番目かの説明>
//
// 使い方: node scripts/check-migrations.mjs <比較対象の ref（例: origin/main）>
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

const base = process.argv[2] ?? "origin/main"
const MIGRATIONS = "packages/database/prisma/migrations"

const RULES = [
  [/\bDROP\s+TABLE\b/i, "テーブルの削除"],
  [/\bDROP\s+COLUMN\b/i, "列の削除"],
  [/\bALTER\s+COLUMN\s+"?\w+"?\s+(SET\s+DATA\s+)?TYPE\b/i, "列の型変更"],
  [/\bALTER\s+COLUMN\s+"?\w+"?\s+SET\s+NOT\s+NULL\b/i, "既存の列への NOT NULL 追加"],
  [/\bADD\s+COLUMN\s+"?\w+"?\s+[^,;]*\bNOT\s+NULL\b(?![^,;]*\bDEFAULT\b)/i, "既定値なしの NOT NULL 列の追加"],
  [/\bRENAME\s+(COLUMN|TO)\b/i, "名前の変更"],
  [/\bDROP\s+(TYPE|ENUM)\b/i, "型の削除"],
  [/\bTRUNCATE\b/i, "データの全削除"],
  [/\bDELETE\s+FROM\b/i, "データの削除"],
]

let changed
try {
  changed = execFileSync("git", ["diff", "--name-only", "--diff-filter=AM", `${base}...HEAD`, "--", MIGRATIONS], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => f.endsWith("migration.sql"))
} catch {
  console.error(`Could not compare with ${base}. Fetch the base branch first (actions/checkout with fetch-depth: 0).`)
  process.exit(2)
}

let failed = false
for (const file of changed) {
  if (!existsSync(file)) continue
  const sql = readFileSync(file, "utf8")
  const reviewed = /^--\s*migration-review:\s*\S+/m.test(sql)
  // コメント行は検査しない
  const statements = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
  const found = RULES.filter(([pattern]) => pattern.test(statements)).map(([, label]) => label)
  if (found.length === 0) {
    console.log(`ok: ${file}`)
  } else if (reviewed) {
    console.log(`reviewed: ${file} (${found.join(", ")})`)
  } else {
    failed = true
    console.error(`NG: ${file}: ${found.join(", ")}`)
  }
}

if (failed) {
  console.error(
    "\n破壊的な変更を含む Migration があります。段階的な移行（Nullable で追加 → アプリ更新 → Backfill → 制約追加 → 旧列削除）を検討し、" +
      "意図的な場合は migration.sql に `-- migration-review: <理由>` を書いてレビューを受けてください。",
  )
  process.exit(1)
}
console.log(`checked ${changed.length} migration(s)`)
