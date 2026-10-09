import { randomUUID } from "node:crypto"

import cookie from "@fastify/cookie"
import Fastify, { type FastifyServerOptions } from "fastify"

import type { AppDeps } from "./deps"
import { createAuthHooks } from "./plugins/auth"
import { registerErrorHandlers } from "./plugins/errors"
import { createRateLimiter, RATE_LIMITS } from "./plugins/rate-limit"
import { adminRoutes } from "./routes/admin"
import { authRoutes } from "./routes/auth"
import { guildRoutes } from "./routes/guilds"
import { meRoutes } from "./routes/me"
import { miscRoutes } from "./routes/misc"
import { workerRoutes } from "./routes/workers"
import { createAccessService } from "./services/access.service"
import { createAdminService } from "./services/admin.service"
import { createOperatorService } from "./services/operator.service"
import { createSystemService } from "./services/system.service"
import { createBotProfileService } from "./services/bot-profile.service"
import { createDictionaryService } from "./services/dictionary.service"
import { createGuildService } from "./services/guild.service"
import { createLiveService } from "./services/live.service"
import { createMeService } from "./services/me.service"
import { createUsageService } from "./services/usage.service"
import { createWorkerService } from "./services/worker.service"

/** ログに出さない項目（Cookie・トークン・画像データ） */
export const LOG_REDACT = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  "*.accessToken",
  "*.refreshToken",
  "*.token",
  "*.avatar",
]

export function buildApp(deps: AppDeps, options: { logger?: FastifyServerOptions["logger"] } = {}) {
  const app = Fastify({
    logger: options.logger ?? false,
    // リバースプロキシ（Caddy）の背後で動かす
    trustProxy: true,
    // Bot アバター（4MB の画像を base64 にしたもの）を受け付ける
    bodyLimit: 8 * 1024 * 1024,
    genReqId: () => `req_${randomUUID().replaceAll("-", "")}`,
    requestIdHeader: false,
  })

  const operators = createOperatorService(deps)
  const access = createAccessService(deps, operators)
  const live = createLiveService(deps.redis, deps.now)
  const system = createSystemService(deps, live)
  const rateLimit = createRateLimiter(deps.redis)
  const auth = createAuthHooks(deps.sessions, deps.config.APP_ORIGIN)

  void app.register(cookie)
  app.decorateRequest("session", null)
  registerErrorHandlers(app)

  app.addHook("onRequest", async (request, reply) => {
    void reply.header("x-request-id", request.id)
    void reply.header("cache-control", "no-store")
    void reply.header("x-content-type-options", "nosniff")
    void reply.header("referrer-policy", "same-origin")
    if (!request.url.startsWith("/api/")) return
    auth.checkOrigin(request)
    await auth.loadSession(request)
    if (request.session) await rateLimit(request, RATE_LIMITS.default)
  })

  authRoutes(app, deps, access, rateLimit)
  meRoutes(app, createMeService(deps, access, live, operators))
  guildRoutes(
    app,
    {
      guilds: createGuildService(deps, access, live),
      botProfiles: createBotProfileService(deps, access),
      dictionary: createDictionaryService(deps, access, live),
    },
    { ipHashSalt: deps.config.IP_HASH_SALT, rateLimit },
  )
  workerRoutes(app, createWorkerService(deps, access, live))
  miscRoutes(app, deps, { usage: createUsageService(deps, access), live, system }, rateLimit)
  adminRoutes(app, { admin: createAdminService(deps, live, operators), operators, system })

  return app
}
