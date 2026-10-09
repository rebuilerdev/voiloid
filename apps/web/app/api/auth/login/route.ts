import { NextResponse, type NextRequest } from "next/server"

import { DISCORD_CLIENT_ID, SESSION_COOKIE, USE_MOCK } from "@/lib/config"
import { redirectTo } from "@/lib/redirect"

/** ログイン後の遷移先として許可するのはアプリ内パスのみ */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"
}

/**
 * Discord OAuth2 ログイン（仕様書 §70）。
 * 本番: Discord の認可画面へ。コード交換（Client Secret が必要）は Backend の callback が行う。
 * モック: セッション Cookie を発行してそのまま遷移する。
 */
export function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next"))

  if (!USE_MOCK) {
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      response_type: "code",
      scope: "identify guilds",
      redirect_uri: process.env.DISCORD_REDIRECT_URI ?? `${request.nextUrl.origin}/api/auth/callback`,
      state: next,
    })
    return NextResponse.redirect(`https://discord.com/oauth2/authorize?${params}`)
  }

  const res = redirectTo(next)
  res.cookies.set(SESSION_COOKIE, "mock-session", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  })
  return res
}
