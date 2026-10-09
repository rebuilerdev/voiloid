import { connection, type NextRequest } from "next/server"

import { SESSION_COOKIE, USE_MOCK } from "@/lib/config"
import { handleMockRequest } from "@/lib/mock/router"

/**
 * ブラウザからのモック API（仕様書 §63）。本番では API_BASE_URL の Backend を使うため無効。
 */
async function handle(request: NextRequest) {
  await connection()
  if (!USE_MOCK) {
    return Response.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 })
  }
  if (!request.cookies.has(SESSION_COOKIE)) {
    return Response.json({ error: { code: "UNAUTHORIZED", message: "Login required." } }, { status: 401 })
  }

  const body = ["POST", "PATCH", "PUT"].includes(request.method)
    ? await request.json().catch(() => undefined)
    : undefined

  // Loading 表示を確認できるよう、わずかに遅延させる
  await new Promise((r) => setTimeout(r, 250))

  const { pathname, search } = request.nextUrl
  const res = handleMockRequest(request.method, `${pathname}${search}`, body)
  return Response.json(res.body, { status: res.status })
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE }
