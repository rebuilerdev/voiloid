import {
  dictionaryEntryInputSchema,
  updateGuildBotProfileRequestSchema,
  updateGuildSettingsRequestSchema,
} from "@voiloid/shared/contracts"
import type { FastifyInstance, FastifyRequest } from "fastify"

import { hashIp } from "../lib/crypto"
import { requireSession } from "../plugins/auth"
import { RATE_LIMITS, type RateLimiter } from "../plugins/rate-limit"
import type { BotProfileService } from "../services/bot-profile.service"
import type { DictionaryService } from "../services/dictionary.service"
import type { GuildService } from "../services/guild.service"
import { guildIdParam, ok, parse } from "./helpers"

export function guildRoutes(
  app: FastifyInstance,
  services: { guilds: GuildService; botProfiles: BotProfileService; dictionary: DictionaryService },
  options: { ipHashSalt: string; rateLimit: RateLimiter },
) {
  const { guilds, botProfiles, dictionary } = services
  const ip = (request: FastifyRequest) => hashIp(request.ip, options.ipHashSalt)

  app.get("/api/guilds", async (request) => ok(await guilds.list(requireSession(request))))

  app.get("/api/guilds/:guildId", async (request) =>
    ok(await guilds.detail(requireSession(request), guildIdParam(request))),
  )

  app.get("/api/guilds/:guildId/channels", async (request) =>
    ok(await guilds.channels(requireSession(request), guildIdParam(request))),
  )

  app.get("/api/guilds/:guildId/settings", async (request) =>
    ok(await guilds.getSettings(requireSession(request), guildIdParam(request))),
  )

  app.patch("/api/guilds/:guildId/settings", async (request) => {
    const session = requireSession(request)
    const guildId = guildIdParam(request)
    const input = parse(updateGuildSettingsRequestSchema, request.body)
    return ok(await guilds.updateSettings(session, guildId, input, ip(request)))
  })

  app.get("/api/guilds/:guildId/bot-profile", async (request) =>
    ok(await botProfiles.get(requireSession(request), guildIdParam(request))),
  )

  app.patch("/api/guilds/:guildId/bot-profile", async (request) => {
    const session = requireSession(request)
    const guildId = guildIdParam(request)
    const input = parse(updateGuildBotProfileRequestSchema, request.body)
    await options.rateLimit(request, RATE_LIMITS.botProfile)
    return ok(await botProfiles.update(session, guildId, input, ip(request)))
  })

  app.get("/api/guilds/:guildId/dictionary", async (request) =>
    ok(await dictionary.list(requireSession(request), guildIdParam(request))),
  )

  app.post("/api/guilds/:guildId/dictionary", async (request, reply) => {
    const session = requireSession(request)
    const guildId = guildIdParam(request)
    const input = parse(dictionaryEntryInputSchema, request.body)
    return reply.status(201).send(ok(await dictionary.create(session, guildId, input, ip(request))))
  })

  app.patch("/api/guilds/:guildId/dictionary/:entryId", async (request) => {
    const session = requireSession(request)
    const guildId = guildIdParam(request)
    const input = parse(dictionaryEntryInputSchema, request.body)
    const { entryId } = request.params as { entryId: string }
    return ok(await dictionary.update(session, guildId, entryId, input, ip(request)))
  })

  app.delete("/api/guilds/:guildId/dictionary/:entryId", async (request) => {
    const session = requireSession(request)
    const { entryId } = request.params as { entryId: string }
    await dictionary.delete(session, guildIdParam(request), entryId, ip(request))
    return ok(null)
  })
}
