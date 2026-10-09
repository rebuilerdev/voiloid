import "server-only"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { connection } from "next/server"

import { API_BASE_URL, SESSION_COOKIE, USE_MOCK } from "@/lib/config"
import { registerServerTransport, type HttpMethod } from "@/services/http"

/**
 * サーバー側から Control API への接続先（コンテナ内では http://api:4000 など）。
 * ブラウザ向けの NEXT_PUBLIC_API_BASE_URL（同一オリジン）とは別に、実行時の環境変数で指定する。
 */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? API_BASE_URL

/**
 * Server Component からの API 呼び出し。セッション Cookie を転送する。
 * cookies() を読むため、呼び出し元は動的レンダリングになる（<Suspense> で囲むこと）。
 */
registerServerTransport(async (method: HttpMethod, path: string, body?: unknown) => {
  const res = await send(method, path, body)
  // セッション切れ: Cookie を消してからログイン画面へ（Cookie が残ると proxy.ts がログイン画面から戻してしまう）
  if (res.status === 401) redirect("/api/auth/session-expired")
  return res
})

async function send(method: HttpMethod, path: string, body?: unknown) {
  // API の結果は常にリクエスト時点のもの（事前レンダリングしない）
  await connection()
  const cookieStore = await cookies()

  if (USE_MOCK) {
    const { handleMockRequest } = await import("@/lib/mock/router")
    return handleMockRequest(method, path, body)
  }

  const session = cookieStore.get(SESSION_COOKIE)
  try {
    const res = await fetch(`${API_INTERNAL_URL}${path}`, {
      method,
      cache: "no-store",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(session ? { Cookie: `${SESSION_COOKIE}=${session.value}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  } catch {
    return { status: 0, body: { error: { code: "NETWORK_ERROR", message: "Failed to connect to server." } } }
  }
}
