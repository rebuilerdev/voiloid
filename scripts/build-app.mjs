// アプリ（apps/*）を本番用に 1 ファイルへバンドルする。
// - ワークスペースのパッケージ（@voiloid/*、Prisma の生成コードを含む）はバンドルする
// - npm の依存パッケージはバンドルせず、node_modules から読み込む（ネイティブモジュール・wasm を含むため）
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { build } from "esbuild"

const cwd = process.cwd()
const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"))

/** ワークスペースの依存も含め、外部扱いにする npm パッケージを集める */
function externals(manifest, seen = new Set()) {
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (name.startsWith("@voiloid/")) {
      if (seen.has(name)) continue
      seen.add(name)
      const dir = name === "@voiloid/shared" || name === "@voiloid/database" ? "packages" : "apps"
      externals(JSON.parse(readFileSync(join(cwd, "../..", dir, name.split("/")[1], "package.json"), "utf8")), seen)
    } else {
      seen.add(name)
    }
  }
  return [...seen].filter((name) => !name.startsWith("@voiloid/"))
}

const external = externals(pkg).flatMap((name) => [name, `${name}/*`])

// 引数でエントリーポイントを指定できる（既定: src/main.ts）。出力は dist/<ファイル名>.js
const entries = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["src/main.ts"]

await build({
  entryPoints: entries.map((entry) => join(cwd, entry)),
  outdir: join(cwd, "dist"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  external,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // バンドル内の CommonJS 依存が require を使えるようにする
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
  logLevel: "info",
})
