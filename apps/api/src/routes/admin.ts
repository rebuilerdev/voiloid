/**
 * 運営コンソールの API（/api/admin/*）。
 * 権限: viewer = 閲覧 / editor = サーバー・ユーザー・Worker の変更 / admin = 運営者の管理・全体設定・削除・Bot の退出
 * 運営者以外には 404（存在を明かさない）、権限が足りなければ 403。
 */
import {
  adminWorkersQuerySchema,
  auditLogQuerySchema,
  createOperatorRequestSchema,
  createWorkerRequestSchema,
  pageQuerySchema,
  reasonRequestSchema,
  snowflakeSchema,
  updateAdminWorkerRequestSchema,
  updateMeRequestSchema,
  updateOperatorRequestSchema,
  updateSystemSettingsRequestSchema,
  updateWorkerGuildsRequestSchema,
} from "@voiloid/shared/contracts"
import { notFound } from "@voiloid/shared"
import type { FastifyInstance, FastifyRequest } from "fastify"

import { requireSession } from "../plugins/auth"
import type { AdminService } from "../services/admin.service"
import type { OperatorLevel, OperatorService } from "../services/operator.service"
import type { SystemService } from "../services/system.service"
import { guildIdParam, ok, parse, workerIdParam } from "./helpers"

function userIdParam(request: FastifyRequest): string {
  const result = snowflakeSchema.safeParse((request.params as { userId?: string }).userId)
  if (!result.success) throw notFound("User")
  return result.data
}

export function adminRoutes(
  app: FastifyInstance,
  services: { admin: AdminService; operators: OperatorService; system: SystemService },
) {
  const { admin, operators, system } = services
  const as = async (request: FastifyRequest, level: OperatorLevel) => {
    const session = requireSession(request)
    await operators.require(session, level)
    return session
  }

  /* ---------- 概要・監査ログ ---------- */

  app.get("/api/admin/overview", async (request) => {
    await as(request, "viewer")
    return ok(await admin.overview())
  })

  app.get("/api/admin/audit-logs", async (request) => {
    await as(request, "viewer")
    return ok(await admin.auditLogs(parse(auditLogQuerySchema, request.query)))
  })

  /* ---------- Worker ---------- */

  app.get("/api/admin/workers", async (request) => {
    await as(request, "viewer")
    return ok(await admin.officialWorkers())
  })

  app.get("/api/admin/private-workers", async (request) => {
    await as(request, "viewer")
    return ok(await admin.privateWorkers(parse(adminWorkersQuerySchema, request.query)))
  })

  app.post("/api/admin/workers", async (request, reply) => {
    const session = await as(request, "editor")
    const input = parse(createWorkerRequestSchema, request.body)
    return reply.status(201).send(ok(await admin.createOfficialWorker(session, input)))
  })

  app.patch("/api/admin/workers/:workerId", async (request) => {
    const session = await as(request, "editor")
    const input = parse(updateAdminWorkerRequestSchema, request.body)
    return ok(await admin.updateWorker(session, workerIdParam(request), input))
  })

  app.post("/api/admin/workers/:workerId/regenerate-token", async (request) => {
    const session = await as(request, "editor")
    return ok(await admin.regenerateToken(session, workerIdParam(request)))
  })

  app.post("/api/admin/workers/:workerId/disconnect", async (request) => {
    const session = await as(request, "editor")
    await admin.disconnectWorker(session, workerIdParam(request))
    return ok(null)
  })

  app.delete("/api/admin/workers/:workerId", async (request) => {
    const session = await as(request, "editor")
    await admin.deleteWorker(session, workerIdParam(request))
    return ok(null)
  })

  app.get("/api/admin/workers/:workerId/connections", async (request) => {
    await as(request, "viewer")
    return ok(await admin.workerConnections(workerIdParam(request)))
  })

  app.put("/api/admin/workers/:workerId/connections", async (request) => {
    const session = await as(request, "editor")
    const input = parse(updateWorkerGuildsRequestSchema, request.body)
    await admin.updateWorkerConnections(session, workerIdParam(request), input)
    return ok(null)
  })

  /* ---------- サーバー ---------- */

  app.get("/api/admin/guilds", async (request) => {
    await as(request, "viewer")
    return ok(await admin.guilds(parse(pageQuerySchema, request.query)))
  })

  app.get("/api/admin/guilds/:guildId", async (request) => {
    await as(request, "viewer")
    return ok(await admin.guildDetail(guildIdParam(request)))
  })

  app.post("/api/admin/guilds/:guildId/suspend", async (request) => {
    const session = await as(request, "editor")
    const { reason } = parse(reasonRequestSchema, request.body)
    await admin.suspendGuild(session, guildIdParam(request), reason)
    return ok(null)
  })

  app.post("/api/admin/guilds/:guildId/unsuspend", async (request) => {
    const session = await as(request, "editor")
    await admin.unsuspendGuild(session, guildIdParam(request))
    return ok(null)
  })

  app.post("/api/admin/guilds/:guildId/stop-sessions", async (request) => {
    const session = await as(request, "editor")
    return ok(await admin.stopGuildSessions(session, guildIdParam(request)))
  })

  app.post("/api/admin/guilds/:guildId/leave", async (request) => {
    const session = await as(request, "admin")
    const { reason } = parse(reasonRequestSchema, request.body)
    return ok(await admin.leaveGuild(session, guildIdParam(request), reason))
  })

  app.delete("/api/admin/guilds/:guildId/workers/:workerId", async (request) => {
    const session = await as(request, "editor")
    await admin.removeGuildWorker(session, guildIdParam(request), workerIdParam(request))
    return ok(null)
  })

  /* ---------- ユーザー ---------- */

  app.get("/api/admin/users", async (request) => {
    await as(request, "viewer")
    return ok(await admin.users(parse(pageQuerySchema, request.query)))
  })

  app.get("/api/admin/users/:userId", async (request) => {
    await as(request, "viewer")
    return ok(await admin.userDetail(userIdParam(request)))
  })

  app.put("/api/admin/users/:userId/voice", async (request) => {
    const session = await as(request, "editor")
    const { voice } = parse(updateMeRequestSchema, request.body)
    await admin.setUserVoice(session, userIdParam(request), voice)
    return ok(null)
  })

  app.post("/api/admin/users/:userId/logout", async (request) => {
    const session = await as(request, "editor")
    return ok(await admin.logoutUser(session, userIdParam(request)))
  })

  app.post("/api/admin/users/:userId/suspend", async (request) => {
    const session = await as(request, "editor")
    const { reason } = parse(reasonRequestSchema, request.body)
    await admin.suspendUser(session, userIdParam(request), reason)
    return ok(null)
  })

  app.post("/api/admin/users/:userId/unsuspend", async (request) => {
    const session = await as(request, "editor")
    await admin.unsuspendUser(session, userIdParam(request))
    return ok(null)
  })

  app.post("/api/admin/users/:userId/delete", async (request) => {
    const session = await as(request, "admin")
    const { reason } = parse(reasonRequestSchema, request.body)
    return ok(await admin.deleteUser(session, userIdParam(request), reason))
  })

  /* ---------- サービス全体の設定 ---------- */

  app.get("/api/admin/system", async (request) => {
    await as(request, "viewer")
    return ok(await system.view())
  })

  app.patch("/api/admin/system", async (request) => {
    const session = await as(request, "admin")
    return ok(await system.update(session, parse(updateSystemSettingsRequestSchema, request.body)))
  })

  app.post("/api/admin/system/register-commands", async (request) => {
    const session = await as(request, "admin")
    return ok(await admin.registerCommands(session))
  })

  /* ---------- 運営者 ---------- */

  app.get("/api/admin/operators", async (request) => {
    await as(request, "viewer")
    return ok(await admin.operatorList())
  })

  app.post("/api/admin/operators", async (request, reply) => {
    const session = await as(request, "admin")
    const { discordUserId, role } = parse(createOperatorRequestSchema, request.body)
    await admin.setOperator(session, discordUserId, role)
    return reply.status(201).send(ok(null))
  })

  app.patch("/api/admin/operators/:userId", async (request) => {
    const session = await as(request, "admin")
    const { role } = parse(updateOperatorRequestSchema, request.body)
    await admin.setOperator(session, userIdParam(request), role)
    return ok(null)
  })

  app.delete("/api/admin/operators/:userId", async (request) => {
    const session = await as(request, "admin")
    await admin.removeOperator(session, userIdParam(request))
    return ok(null)
  })
}
