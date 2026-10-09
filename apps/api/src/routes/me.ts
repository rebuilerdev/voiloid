import { updateMeRequestSchema } from "@voiloid/shared/contracts"
import type { FastifyInstance } from "fastify"

import { requireSession } from "../plugins/auth"
import type { MeService } from "../services/me.service"
import { ok, parse } from "./helpers"

export function meRoutes(app: FastifyInstance, me: MeService) {
  app.get("/api/me", async (request) => ok(await me.me(requireSession(request))))

  app.patch("/api/me", async (request) => {
    const session = requireSession(request)
    const input = parse(updateMeRequestSchema, request.body)
    return ok(await me.updateVoice(session, input.voice))
  })

  app.get("/api/me/guilds", async (request) => ok(await me.guilds(requireSession(request))))
}
