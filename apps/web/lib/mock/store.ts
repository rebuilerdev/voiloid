/**
 * モック用のインメモリストア。サーバープロセス内で共有され、開発中の HMR でも保持される。
 */
import type { AuditLogEntry, OperatorEntry, Suspension, SystemSettingsView } from "@/types/admin"
import type { DictionaryEntry } from "@/types/dictionary"
import type { GuildSettings } from "@/types/guild"
import type { CurrentUser } from "@/types/user"
import type { VoiceSettings } from "@/types/voice"

import * as seed from "@/lib/mock/data"

type Store = {
  user: CurrentUser
  guilds: seed.MockGuild[]
  settings: Map<string, GuildSettings>
  dictionary: Map<string, DictionaryEntry[]>
  workers: seed.MockWorker[]
  botProfiles: Map<string, { nickname: string | null; avatarUrl: string | null }>
  auditLogs: AuditLogEntry[]
  /** 運営コンソール: 利用停止中のサーバー */
  guildSuspensions: Map<string, Suspension>
  /** 運営コンソール: ユーザーの状態（利用停止・マイボイス・ログイン中のセッション数・削除済み） */
  users: Map<string, { suspension: Suspension | null; voice: VoiceSettings | null; sessions: number; deleted: boolean }>
  /** 運営コンソール: メンテナンス中の Worker */
  disabledWorkers: Set<string>
  system: SystemSettingsView
  /** Web で追加した運営者（owner は含めない） */
  operators: OperatorEntry[]
}

function createStore(): Store {
  const installed = seed.guilds.filter((g) => g.botInstalled)
  return {
    user: structuredClone(seed.user),
    guilds: structuredClone(seed.guilds),
    settings: new Map(installed.map((g, i) => [g.id, seed.defaultGuildSettings(i)])),
    dictionary: new Map(
      installed.map((g, gi) => [
        g.id,
        // 1 サーバーだけ空の辞書にして EmptyState を確認できるようにする
        gi === 3
          ? []
          : seed.dictionary.map((e, i) => ({ ...e, id: `dict_${g.id}_${i}` })),
      ])
    ),
    workers: seed.buildWorkers(),
    // 1 サーバーだけニックネームを設定済みにする
    botProfiles: new Map(
      installed.map((g, i) => [g.id, { nickname: i === 0 ? "ずんだ読み上げ" : null, avatarUrl: null }])
    ),
    auditLogs: seed.auditLogSeed.map(([minutesAgo, action, actorId, guildId, targetType, targetId], i) => {
      const actor = seed.adminUsers.find((u) => u.id === actorId)
      const guild = seed.guilds.find((g) => g.id === guildId)
      return {
        id: `audit_${String(1000 - i).padStart(4, "0")}`,
        action,
        actor: actor ? { id: actor.id, name: actor.displayName } : null,
        guild: guild ? { id: guild.id, name: guild.name } : null,
        targetType,
        targetId,
        metadata: action === "guild.settings.update" ? { fields: ["readUrls", "maxCharacters"] } : null,
        createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
      }
    }),
    guildSuspensions: new Map(),
    users: new Map(
      seed.adminUsers.map((u, i) => [
        u.id,
        {
          suspension: null,
          voice: i === 0 ? structuredClone(seed.user.voice) : null,
          sessions: i < 3 ? 1 : 0,
          deleted: false,
        },
      ])
    ),
    disabledWorkers: new Set(),
    system: {
      limits: { maxWorkersPerUser: 10, dictionaryMaxEntries: 1000, maxCharactersLimit: 1000 },
      newGuildDefaults: {
        maxCharacters: 200,
        voice: { engine: "VOICEVOX", speakerId: "vv-zundamon", styleId: "3", speed: 1, pitch: 0, intonation: 1 },
      },
      readingPaused: false,
      announcement: null,
      updatedAt: new Date().toISOString(),
    },
    operators: [
      {
        discordUserId: seed.adminUsers[1].id,
        role: "editor",
        source: "web",
        user: { name: seed.adminUsers[1].displayName },
        createdAt: new Date(Date.now() - 86_400_000 * 7).toISOString(),
      },
    ],
  }
}

const globalForMock = globalThis as unknown as { __voiloidMockStore?: Store }

export function getStore(): Store {
  // 項目追加前に作られたストア（開発中の HMR）は作り直す
  if (!globalForMock.__voiloidMockStore?.system) globalForMock.__voiloidMockStore = createStore()
  return globalForMock.__voiloidMockStore
}
