/**
 * サーバー一覧・詳細・チャンネル・設定。
 */
import {
  guildVoice,
  guildVoiceColumns,
  longMessageFromDb,
  longMessageToDb,
  ReadUrlsMode,
  readingModeFromDb,
  readingModeToDb,
  WorkerMode,
  workerModeFromDb,
  workerModeToDb,
  type GuildSettings as DbGuildSettings,
  type GuildSettingsPatch,
} from "@voiloid/database"
import { DEFAULT_GUILD_VOICE, validationError } from "@voiloid/shared"
import type {
  Guild as ApiGuild,
  GuildChannel,
  GuildDetail,
  GuildSettings,
  UpdateGuildSettingsRequest,
  Voice,
} from "@voiloid/shared/contracts"
import { redisKeys } from "@voiloid/shared/protocol"
import { z } from "zod"

import type { AppDeps } from "../deps"
import { cdn, toAppError } from "../lib/discord"
import type { Session } from "../lib/session"
import { startOfDay } from "../lib/time"
import type { AccessService } from "./access.service"
import type { LiveService } from "./live.service"
import { enginesByGuild } from "./routing"

const CHANNELS_CACHE_SECONDS = 30

/** Discord のチャンネル種別 */
const TEXT_TYPES = new Set([0, 5]) // GUILD_TEXT / GUILD_ANNOUNCEMENT
const VOICE_TYPES = new Set([2, 13]) // GUILD_VOICE / GUILD_STAGE_VOICE

const cachedChannelsSchema = z.array(z.object({ id: z.string(), name: z.string(), type: z.enum(["text", "voice"]) }))

export function toApiSettings(settings: DbGuildSettings, specificWorkerPublicId: string | undefined): GuildSettings {
  return {
    readingMode: readingModeFromDb[settings.readingMode],
    textChannelId: settings.defaultTextChannelId ?? undefined,
    voiceChannelId: settings.defaultVoiceChannelId ?? undefined,
    autoJoin: settings.autoJoin,
    readUrls: settings.readUrlsMode === ReadUrlsMode.READ,
    maxCharacters: settings.maxCharacters,
    longMessageBehavior: longMessageFromDb[settings.longMessageBehavior],
    workerMode: workerModeFromDb[settings.workerMode],
    workerId: specificWorkerPublicId,
    fallbackToOfficial: settings.fallbackToOfficial,
    // 廃止されたエンジンが保存されていた場合は既定の声として返す
    voice: guildVoice(settings) ?? { ...DEFAULT_GUILD_VOICE },
  }
}

export function createGuildService(deps: AppDeps, access: AccessService, live: LiveService) {
  async function specificWorkerPublicId(settings: DbGuildSettings) {
    if (!settings.specificWorkerId) return undefined
    const worker = await deps.db.worker.findUnique({
      where: { id: settings.specificWorkerId },
      select: { publicId: true },
    })
    return worker?.publicId
  }

  /** 声の名前（話者名）。Gateway が応答しなければ省略する */
  async function speakerNames(userId: string): Promise<Map<string, string>> {
    try {
      const voices: Voice[] = await deps.gateway.listVoices(userId)
      return new Map(voices.map((v) => [`${v.engine}:${v.speakerId}`, v.speakerName]))
    } catch {
      return new Map()
    }
  }

  async function channels(discordGuildId: string): Promise<GuildChannel[]> {
    const key = redisKeys.guildChannels(discordGuildId)
    const cached = await deps.redis.get(key)
    if (cached) {
      const parsed = cachedChannelsSchema.safeParse(JSON.parse(cached))
      if (parsed.success) return parsed.data
    }
    let raw
    try {
      raw = await deps.discord.getGuildChannels(discordGuildId)
    } catch (error) {
      throw toAppError(error)
    }
    const result = raw
      .filter((c) => TEXT_TYPES.has(c.type) || VOICE_TYPES.has(c.type))
      .sort((a, b) => Number(VOICE_TYPES.has(a.type)) - Number(VOICE_TYPES.has(b.type)) || a.position - b.position)
      .map((c): GuildChannel => ({ id: c.id, name: c.name ?? "", type: TEXT_TYPES.has(c.type) ? "text" : "voice" }))
    await deps.redis.set(key, JSON.stringify(result), "EX", CHANNELS_CACHE_SECONDS)
    return result
  }

  return {
    /** 管理できるサーバーの一覧（Bot 未導入を含む） */
    async list(session: Session): Promise<ApiGuild[]> {
      const manageable = await access.manageableGuilds(session)
      const installed = manageable.flatMap((g) => (g.guild?.botInstalled ? [g.guild] : []))
      const [sessions, lastActivity, settings, bot, names] = await Promise.all([
        live.guildSessions(installed.map((g) => g.discordGuildId)),
        deps.repos.usage.lastActivity(installed.map((g) => g.id)),
        deps.repos.guildSettings.findManyByGuildIds(installed.map((g) => g.id)),
        live.botHeartbeat(),
        installed.length > 0 ? speakerNames(session.userId) : Promise.resolve(new Map<string, string>()),
      ])
      const settingsById = new Map(settings.map((s) => [s.guildId, s]))

      const guilds = manageable.map(({ discord, guild }): ApiGuild => {
        const iconUrl = discord.icon ? cdn.guildIcon(discord.id, discord.icon) : undefined
        if (!guild?.botInstalled) {
          return { id: discord.id, name: discord.name, iconUrl, botInstalled: false, readingEnabled: false }
        }
        const saved = settingsById.get(guild.id)
        const voice = (saved && guildVoice(saved)) ?? DEFAULT_GUILD_VOICE
        return {
          id: discord.id,
          name: discord.name,
          iconUrl,
          suspended: guild.suspendedAt !== null,
          memberCount: guild.memberCount ?? undefined,
          botInstalled: true,
          botStatus: bot.online ? "online" : "offline",
          readingEnabled: guild.suspendedAt === null,
          readingStatus: guild.suspendedAt
            ? "disabled"
            : (sessions.get(discord.id)?.length ?? 0) > 0
              ? "active"
              : "idle",
          voiceName: names.get(`${voice.engine}:${voice.speakerId}`),
          lastActiveAt: lastActivity.get(guild.id)?.toISOString(),
        }
      })
      // 最近使われたサーバーから順に並べる
      return guilds.sort(
        (a, b) =>
          Number(b.botInstalled) - Number(a.botInstalled) ||
          (b.lastActiveAt ?? "").localeCompare(a.lastActiveAt ?? "") ||
          a.name.localeCompare(b.name),
      )
    },

    async detail(session: Session, discordGuildId: string): Promise<GuildDetail> {
      const { discord, guild } = await access.requireManageable(session, discordGuildId)
      const iconUrl = discord.icon ? cdn.guildIcon(discord.id, discord.icon) : undefined
      if (!guild?.botInstalled) {
        return {
          id: discord.id,
          name: discord.name,
          iconUrl,
          botInstalled: false,
          readingEnabled: false,
          messagesReadToday: 0,
          availableEngines: [],
        }
      }

      const settings = await deps.repos.guildSettings.getOrCreate(guild.id)
      const today = startOfDay(deps.now(), deps.config.USAGE_TIME_ZONE)
      const [sessions, bot, messagesReadToday, engines, lastActivity, lastUsage] = await Promise.all([
        live.guildSessions([discord.id]),
        live.botHeartbeat(),
        deps.repos.usage.countSince(guild.id, today),
        enginesByGuild(deps, [{ id: guild.id, settings }], null),
        deps.repos.usage.lastActivity([guild.id]),
        deps.db.usageEvent.findFirst({
          where: { guildId: guild.id, success: true, workerId: { not: null } },
          orderBy: { createdAt: "desc" },
          select: { worker: { select: { name: true } } },
        }),
      ])
      const current = sessions.get(discord.id)?.[0]
      return {
        id: discord.id,
        name: discord.name,
        iconUrl,
        suspended: guild.suspendedAt !== null,
        memberCount: guild.memberCount ?? undefined,
        botInstalled: true,
        botStatus: bot.online ? "online" : "offline",
        readingEnabled: guild.suspendedAt === null,
        readingStatus: guild.suspendedAt ? "disabled" : current ? "active" : "idle",
        lastActiveAt: lastActivity.get(guild.id)?.toISOString(),
        session: current
          ? { textChannelName: current.textChannelName, voiceChannelName: current.voiceChannelName, connected: true }
          : undefined,
        currentWorkerName: lastUsage?.worker?.name,
        messagesReadToday,
        availableEngines: engines.get(guild.id) ?? [],
      }
    },

    async channels(session: Session, discordGuildId: string): Promise<GuildChannel[]> {
      await access.requireManageableInstalled(session, discordGuildId)
      return channels(discordGuildId)
    },

    async getSettings(session: Session, discordGuildId: string): Promise<GuildSettings> {
      const { guild } = await access.requireManageableInstalled(session, discordGuildId)
      const settings = await deps.repos.guildSettings.getOrCreate(guild.id)
      return toApiSettings(settings, await specificWorkerPublicId(settings))
    },

    async updateSettings(
      session: Session,
      discordGuildId: string,
      input: UpdateGuildSettingsRequest,
      ipHash: string,
    ): Promise<GuildSettings> {
      const { guild, asOperator } = await access.requireManageableInstalled(session, discordGuildId)
      const current = await deps.repos.guildSettings.getOrCreate(guild.id)

      // 最大文字数はサービス全体の上限まで
      if (input.maxCharacters !== undefined) {
        const { maxCharactersLimit } = await deps.repos.system.get()
        if (input.maxCharacters > maxCharactersLimit) {
          throw validationError(`maxCharacters must be ${maxCharactersLimit} or less.`)
        }
      }

      const patch: GuildSettingsPatch = {}
      if (input.readingMode !== undefined) patch.readingMode = readingModeToDb[input.readingMode]
      if (input.textChannelId !== undefined) patch.defaultTextChannelId = input.textChannelId
      if (input.voiceChannelId !== undefined) patch.defaultVoiceChannelId = input.voiceChannelId
      if (input.autoJoin !== undefined) patch.autoJoin = input.autoJoin
      if (input.readUrls !== undefined) patch.readUrlsMode = input.readUrls ? ReadUrlsMode.READ : ReadUrlsMode.OMIT
      if (input.maxCharacters !== undefined) patch.maxCharacters = input.maxCharacters
      if (input.longMessageBehavior !== undefined)
        patch.longMessageBehavior = longMessageToDb[input.longMessageBehavior]
      if (input.workerMode !== undefined) patch.workerMode = workerModeToDb[input.workerMode]
      if (input.fallbackToOfficial !== undefined) patch.fallbackToOfficial = input.fallbackToOfficial
      if (input.voice !== undefined) Object.assign(patch, guildVoiceColumns(input.voice))

      if (input.workerId !== undefined) {
        if (input.workerId === null) {
          patch.specificWorkerId = null
        } else {
          // 指定できるのは、このサーバーに「サーバーで共有」された自鯖Worker のみ
          const shared = await deps.repos.workers.listSharedWithGuild(guild.id)
          const worker = shared.find((w) => w.publicId === input.workerId)
          if (!worker) throw validationError("The worker is not shared with this server.")
          patch.specificWorkerId = worker.id
        }
      }

      const next = { ...current, ...patch }

      if (next.workerMode === WorkerMode.SPECIFIC && !next.specificWorkerId) {
        throw validationError("workerId is required for the specific worker mode.")
      }
      if (next.readingMode === "FIXED" && (!next.defaultTextChannelId || !next.defaultVoiceChannelId)) {
        throw validationError("Text and voice channels are required for the fixed reading mode.")
      }

      // 変更されたチャンネルが、このサーバーの正しい種類のチャンネルか確認する
      if (patch.defaultTextChannelId || patch.defaultVoiceChannelId) {
        const list = await channels(discordGuildId)
        const exists = (id: string, type: GuildChannel["type"]) => list.some((c) => c.id === id && c.type === type)
        if (patch.defaultTextChannelId && !exists(patch.defaultTextChannelId, "text")) {
          throw validationError("The text channel does not exist on this server.")
        }
        if (patch.defaultVoiceChannelId && !exists(patch.defaultVoiceChannelId, "voice")) {
          throw validationError("The voice channel does not exist on this server.")
        }
      }

      // サーバーのデフォルト音声は、このサーバーで使えるエンジンに限る
      if (input.voice !== undefined) {
        const engines = (await enginesByGuild(deps, [{ id: guild.id, settings: next }], null)).get(guild.id) ?? []
        if (!engines.includes(input.voice.engine)) {
          throw validationError(`${input.voice.engine} is not available on this server.`)
        }
      }

      const updated = await deps.db.$transaction(async (tx) => {
        const saved = await tx.guildSettings.update({ where: { guildId: guild.id }, data: patch })
        await tx.auditLog.create({
          data: {
            actorUserId: session.userId,
            guildId: guild.id,
            action: "guild.settings.update",
            targetType: "guild",
            targetId: guild.id,
            metadata: { fields: Object.keys(input), ...(asOperator ? { asOperator: true } : {}) },
            ipHash,
          },
        })
        return saved
      })
      await live.invalidate({ kind: "guild", guildId: discordGuildId })
      return toApiSettings(updated, await specificWorkerPublicId(updated))
    },
  }
}

export type GuildService = ReturnType<typeof createGuildService>
