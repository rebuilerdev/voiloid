/**
 * ログイン確認と CSRF 対策。
 * - Cookie のセッション ID から Redis のセッションを引く（無効なら 401）
 * - 状態を変更するリクエストは Origin が Web GUI と一致する場合だけ受け付ける
 */
import { AppError } from "@voiloid/shared"
import type { FastifyRequest } from "fastify"

import type { Session, SessionStore } from "../lib/session"

export const SESSION_COOKIE = "voiloid_session"

declare module "fastify" {
  interface FastifyRequest {
    session: Session | null
  }
}

export function requireSession(request: FastifyRequest): Session {
  if (!request.session) throw new AppError("UNAUTHORIZED", "Login required.")
  return request.session
}

export function createAuthHooks(sessions: SessionStore, appOrigin: string) {
  const allowedOrigin = new URL(appOrigin).origin

  return {
    async loadSession(request: FastifyRequest) {
      const id = request.cookies[SESSION_COOKIE]
      request.session = id ? await sessions.get(id) : null
    },

    checkOrigin(request: FastifyRequest) {
      if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return
      const origin = request.headers.origin
      if (origin !== allowedOrigin) {
        throw new AppError("FORBIDDEN", "Cross-site requests are not allowed.")
      }
    },
  }
}
