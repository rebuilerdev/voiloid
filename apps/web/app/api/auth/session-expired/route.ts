import type { NextRequest } from "next/server"

import { SESSION_COOKIE } from "@/lib/config"
import { redirectTo } from "@/lib/redirect"

/** ログイン後の遷移先として許可するのはアプリ内パスのみ */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"
}

/**
 * セッション切れ: Cookie を消してログイン画面へ（モック用。本番は Control API が同じパスで処理する）。
 */
export function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next"))
  const res = redirectTo(`/login?next=${encodeURIComponent(next)}`)
  res.cookies.delete(SESSION_COOKIE)
  return res
}
