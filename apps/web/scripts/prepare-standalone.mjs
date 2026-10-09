// next build の standalone 出力に、静的ファイル（.next/static と public）をコピーする。
// standalone のサーバーはこれらを自分のディレクトリから配信する。
import { cpSync, existsSync } from "node:fs"

const target = ".next/standalone/apps/web"
if (!existsSync(target)) throw new Error(`${target} was not found. Run next build first.`)
cpSync(".next/static", `${target}/.next/static`, { recursive: true })
if (existsSync("public")) cpSync("public", `${target}/public`, { recursive: true })
