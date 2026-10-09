/**
 * サービス全体の設定（上限値・新しいサーバーの初期値・お知らせ・読み上げの一時停止）。
 */
import { AnnouncementLevel, voiceFromColumns, type SystemSettings, type SystemSettingsPatch } from "@voiloid/database"
import { DEFAULT_GUILD_VOICE, validationError } from "@voiloid/shared"
import type { Announcement, SystemSettingsView, UpdateSystemSettingsRequest } from "@voiloid/shared/contracts"

import type { AppDeps } from "../deps"
import type { Session } from "../lib/session"
import type { LiveService } from "./live.service"

export function toAnnouncement(settings: SystemSettings): Announcement | null {
  return settings.announcementMessage
    ? {
        message: settings.announcementMessage,
        level: settings.announcementLevel === AnnouncementLevel.WARNING ? "warning" : "info",
      }
    : null
}

export function toSystemView(settings: SystemSettings): SystemSettingsView {
  return {
    limits: {
      maxWorkersPerUser: settings.maxWorkersPerUser,
      dictionaryMaxEntries: settings.dictionaryMaxEntries,
      maxCharactersLimit: settings.maxCharactersLimit,
    },
    newGuildDefaults: {
      maxCharacters: settings.newGuildMaxCharacters,
      voice: voiceFromColumns({
        engineId: settings.newGuildVoiceEngineId,
        speakerId: settings.newGuildVoiceSpeakerId,
        styleId: settings.newGuildVoiceStyleId,
        speed: settings.newGuildVoiceSpeed,
        pitch: settings.newGuildVoicePitch,
        intonation: settings.newGuildVoiceIntonation,
      }) ?? { ...DEFAULT_GUILD_VOICE },
    },
    readingPaused: settings.readingPaused,
    announcement: toAnnouncement(settings),
    updatedAt: settings.updatedAt.toISOString(),
  }
}

export function createSystemService(deps: AppDeps, live: LiveService) {
  return {
    get: () => deps.repos.system.get(),

    async view(): Promise<SystemSettingsView> {
      return toSystemView(await deps.repos.system.get())
    },

    async update(session: Session, input: UpdateSystemSettingsRequest): Promise<SystemSettingsView> {
      const current = await deps.repos.system.get()
      const patch: SystemSettingsPatch = { updatedByUserId: session.userId }
      if (input.limits?.maxWorkersPerUser !== undefined) patch.maxWorkersPerUser = input.limits.maxWorkersPerUser
      if (input.limits?.dictionaryMaxEntries !== undefined)
        patch.dictionaryMaxEntries = input.limits.dictionaryMaxEntries
      if (input.limits?.maxCharactersLimit !== undefined) patch.maxCharactersLimit = input.limits.maxCharactersLimit
      if (input.newGuildDefaults?.maxCharacters !== undefined)
        patch.newGuildMaxCharacters = input.newGuildDefaults.maxCharacters
      if (input.newGuildDefaults?.voice) {
        const v = input.newGuildDefaults.voice
        Object.assign(patch, {
          newGuildVoiceEngineId: v.engine,
          newGuildVoiceSpeakerId: v.speakerId,
          newGuildVoiceStyleId: v.styleId,
          newGuildVoiceSpeed: v.speed,
          newGuildVoicePitch: v.pitch,
          newGuildVoiceIntonation: v.intonation,
        })
      }
      if (input.readingPaused !== undefined) patch.readingPaused = input.readingPaused
      if (input.announcement !== undefined) {
        patch.announcementMessage = input.announcement?.message ?? null
        patch.announcementLevel =
          input.announcement?.level === "warning" ? AnnouncementLevel.WARNING : AnnouncementLevel.INFO
      }

      const limit = patch.maxCharactersLimit ?? current.maxCharactersLimit
      if ((patch.newGuildMaxCharacters ?? current.newGuildMaxCharacters) > limit) {
        throw validationError("The default maximum characters must not exceed the limit.")
      }

      const updated = await deps.db.$transaction(async (tx) => {
        const saved = await tx.systemSettings.update({ where: { id: 1 }, data: patch })
        await tx.auditLog.create({
          data: {
            actorUserId: session.userId,
            action: "admin.system.update",
            targetType: "system",
            metadata: { fields: Object.keys(input) },
          },
        })
        return saved
      })
      await live.invalidate({ kind: "system" })
      return toSystemView(updated)
    },
  }
}

export type SystemService = ReturnType<typeof createSystemService>
