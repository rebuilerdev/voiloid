import {
  createWorkerRequestSchema,
  renameWorkerRequestSchema,
  updateWorkerGuildsRequestSchema,
} from "@voiloid/shared/contracts"
import type { FastifyInstance } from "fastify"

import { requireSession } from "../plugins/auth"
import type { WorkerService } from "../services/worker.service"
import { guildIdParam, ok, parse, workerIdParam } from "./helpers"

export function workerRoutes(app: FastifyInstance, workers: WorkerService) {
  app.get("/api/workers", async (request) => ok(await workers.list(requireSession(request))))

  app.post("/api/workers", async (request, reply) => {
    const session = requireSession(request)
    const input = parse(createWorkerRequestSchema, request.body)
    return reply.status(201).send(ok(await workers.create(session, input)))
  })

  app.get("/api/workers/:workerId", async (request) =>
    ok(await workers.get(requireSession(request), workerIdParam(request))),
  )

  app.patch("/api/workers/:workerId", async (request) => {
    const session = requireSession(request)
    const { name } = parse(renameWorkerRequestSchema, request.body)
    return ok(await workers.rename(session, workerIdParam(request), name))
  })

  app.delete("/api/workers/:workerId", async (request) => {
    await workers.delete(requireSession(request), workerIdParam(request))
    return ok(null)
  })

  app.post("/api/workers/:workerId/regenerate-token", async (request) =>
    ok(await workers.regenerateToken(requireSession(request), workerIdParam(request))),
  )

  app.get("/api/guilds/:guildId/workers", async (request) =>
    ok(await workers.sharedWithGuild(requireSession(request), guildIdParam(request))),
  )

  app.get("/api/workers/:workerId/guilds", async (request) =>
    ok(await workers.connections(requireSession(request), workerIdParam(request))),
  )

  app.put("/api/workers/:workerId/guilds", async (request) => {
    const session = requireSession(request)
    const input = parse(updateWorkerGuildsRequestSchema, request.body)
    await workers.updateConnections(session, workerIdParam(request), input)
    return ok(null)
  })
}
