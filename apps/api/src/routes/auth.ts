/**
 * Discord OAuth2 ログイン。
 * Client Secret を使うコード交換は Backend だけで行い、Frontend には Discord のトークンを渡さない。
 */
import { AppError } from "@voiloid/shared"
import { redisKeys } from "@voiloid/shared/protocol"
import type { FastifyInstance, FastifyReply } from "fastify"
import { z } from "zod"

import type { AppDeps } from "../deps"
import { randomToken, hashIp } from "../lib/crypto"
import { toAppError } from "../lib/discord"
import { SESSION_COOKIE } from "../plugins/auth"
import { RATE_LIMITS, type RateLimiter } from "../plugins/rate-limit"
import type { AccessService } from "../services/access.service"

const STATE_COOKIE = "voiloid_oauth_state"
const STATE_TTL_SECONDS = 600

/** ログイン後の遷移先として許可するのはアプリ内のパスのみ（オープンリダイレクト対策） */
export function safeNext(next: unknown): string {
  return typeof next === "string" &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\") &&
    !/\p{Cc}/u.test(next) &&
    next.length <= 512
    ? next
    : "/dashboard"
}

const callbackQuery = z.object({
  code: z.string().min(1).max(512).optional(),
  state: z.string().min(1).max(128).optional(),
  error: z.string().max(128).optional(),
})

export function authRoutes(app: FastifyInstance, deps: AppDeps, access: AccessService, rateLimit: RateLimiter) {
  const { config } = deps
  const redirectUri = `${config.APP_ORIGIN}/api/auth/callback`
  const cookieOptions = { httpOnly: true, secure: config.COOKIE_SECURE, sameSite: "lax" as const, path: "/" }

  const toLogin = (reply: FastifyReply, error: string) =>
    reply.clearCookie(STATE_COOKIE, { ...cookieOptions, path: "/api/auth" }).redirect(`/login?error=${error}`)

  app.get("/api/auth/login", async (request, reply) => {
    await rateLimit(request, RATE_LIMITS.auth)
    const next = safeNext((request.query as { next?: unknown }).next)
    const state = randomToken(24)
    await deps.redis.set(redisKeys.oauthState(state), JSON.stringify({ next }), "EX", STATE_TTL_SECONDS)
    // state を Cookie にも保存し、コールバックしたブラウザがログインを始めたブラウザと同じか確認する（Login CSRF 対策）
    return reply
      .setCookie(STATE_COOKIE, state, { ...cookieOptions, path: "/api/auth", maxAge: STATE_TTL_SECONDS })
      .redirect(deps.discord.authorizeUrl(state, redirectUri))
  })

  app.get("/api/auth/callback", async (request, reply) => {
    await rateLimit(request, RATE_LIMITS.auth)
    const query = callbackQuery.safeParse(request.query)
    if (!query.success || query.data.error) return toLogin(reply, "cancelled")
    const { code, state } = query.data
    if (!code || !state || request.cookies[STATE_COOKIE] !== state) return toLogin(reply, "state")

    const stored = await deps.redis.getdel(redisKeys.oauthState(state))
    if (!stored) return toLogin(reply, "state")
    const { next } = z.object({ next: z.string() }).parse(JSON.parse(stored))

    let sessionId: string | null
    try {
      const tokens = await deps.discord.exchangeCode(code, redirectUri)
      const profile = await deps.discord.getCurrentUser(tokens.accessToken)
      const user = await deps.repos.users.upsertFromDiscord({
        discordUserId: profile.id,
        username: profile.username,
        globalName: profile.global_name ?? null,
        avatar: profile.avatar ?? null,
      })
      // 利用停止中のユーザーはログインできない
      if (user.suspendedAt) {
        sessionId = null
      } else {
        const session = await deps.sessions.create({
          userId: user.id,
          discordUserId: user.discordUserId,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          accessTokenExpiresAt: tokens.expiresAt,
        })
        await deps.repos.audit.record({
          actorUserId: user.id,
          action: "auth.login",
          targetType: "user",
          targetId: user.id,
          ipHash: hashIp(request.ip, config.IP_HASH_SALT),
        })
        sessionId = session.id
      }
    } catch (error) {
      request.log.warn({ err: error instanceof AppError ? error : toAppError(error) }, "OAuth callback failed")
      return toLogin(reply, "discord")
    }
    if (sessionId === null) return toLogin(reply, "suspended")
    return reply
      .clearCookie(STATE_COOKIE, { ...cookieOptions, path: "/api/auth" })
      .setCookie(SESSION_COOKIE, sessionId, { ...cookieOptions, maxAge: config.SESSION_TTL_SECONDS })
      .redirect(safeNext(next))
  })

  app.post("/api/auth/logout", async (request, reply) => {
    const session = request.session
    if (session) {
      await deps.sessions.destroy(session.id)
      await access.clearCache(session)
      // Discord 側のトークンも失効させる（失敗してもログアウトは完了させる）
      await deps.discord.revokeToken(session.refreshToken).catch(() => undefined)
    }
    // 303: フォーム送信後に GET で /login を開く
    return reply.clearCookie(SESSION_COOKIE, cookieOptions).redirect("/login", 303)
  })

  /** セッション切れの Cookie を消してログイン画面へ（Web のサーバー側で 401 を受けたときの遷移先） */
  app.get("/api/auth/session-expired", async (request, reply) => {
    const id = request.cookies[SESSION_COOKIE]
    if (id) await deps.sessions.destroy(id)
    const next = safeNext((request.query as { next?: unknown }).next)
    return reply.clearCookie(SESSION_COOKIE, cookieOptions).redirect(`/login?next=${encodeURIComponent(next)}`)
  })
}
