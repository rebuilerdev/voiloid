import { usagePeriodSchema, voicePreviewRequestSchema, type ServiceStatus } from "@voiloid/shared/contracts"
import type { FastifyInstance } from "fastify"
import { z } from "zod"

import type { AppDeps } from "../deps"
import { requireSession } from "../plugins/auth"
import { RATE_LIMITS, type RateLimiter } from "../plugins/rate-limit"
import type { LiveService } from "../services/live.service"
import { toAnnouncement, type SystemService } from "../services/system.service"
import type { UsageService } from "../services/usage.service"
import { ok, parse } from "./helpers"

/** Bot の応答がこれより遅ければ degraded とする */
const DEGRADED_PING_MS = 1000

export function miscRoutes(
  app: FastifyInstance,
  deps: AppDeps,
  services: { usage: UsageService; live: LiveService; system: SystemService },
  rateLimit: RateLimiter,
) {
  app.get("/api/voices", async (request) => {
    const session = requireSession(request)
    return ok(await deps.gateway.listVoices(session.userId))
  })

  app.post("/api/voices/preview", async (request) => {
    const session = requireSession(request)
    const { text, ...voice } = parse(voicePreviewRequestSchema, request.body)
    await rateLimit(request, RATE_LIMITS.preview)
    const audio = await deps.gateway.preview({ userId: session.userId, voice, text })
    return ok({ audioUrl: `data:audio/wav;base64,${audio.toString("base64")}` })
  })

  app.get("/api/usage", async (request) => {
    const session = requireSession(request)
    const { period } = parse(z.object({ period: usagePeriodSchema.default("30d") }), request.query)
    return ok(await services.usage.summary(session, period))
  })

  app.get("/api/status", async (request) => {
    requireSession(request)
    const [bot, settings] = await Promise.all([services.live.botHeartbeat(), services.system.get()])
    const status: ServiceStatus = {
      bot: !bot.online ? "offline" : bot.pingMs > DEGRADED_PING_MS ? "degraded" : "online",
      gatewayLatencyMs: bot.pingMs,
      announcement: toAnnouncement(settings),
      readingPaused: settings.readingPaused,
    }
    return ok(status)
  })

  /** Liveness: プロセスが応答できるか */
  app.get("/healthz", (_request, reply) => reply.send({ status: "ok" }))

  /** Readiness: DB と Redis に接続できるか（Docker のヘルスチェック・デプロイ後の確認に使う） */
  app.get("/readyz", async (_request, reply) => {
    try {
      await Promise.all([deps.db.$queryRaw`SELECT 1`, deps.redis.ping()])
      return { status: "ok" }
    } catch {
      return reply.status(503).send({ status: "unavailable" })
    }
  })
}
