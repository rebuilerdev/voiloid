/**
 * DB の値（Prisma Enum・列）と、API / 振り分けロジックで使う値の変換。
 */
import { isEngineId, type RoutingSettings, type RoutingWorker } from "@voiloid/shared"
import type {
  LongMessageBehavior,
  ReadingMode,
  VoiceSettings,
  WorkerGuildScope as ApiWorkerGuildScope,
  WorkerMode as ApiWorkerMode,
  WorkerStatus as ApiWorkerStatus,
} from "@voiloid/shared/contracts"

import {
  LongMessageBehavior as DbLongMessageBehavior,
  ReadingMode as DbReadingMode,
  WorkerGuildScope as DbWorkerGuildScope,
  WorkerMode as DbWorkerMode,
  type WorkerStatus as DbWorkerStatus,
  WorkerType as DbWorkerType,
  type GuildSettings,
  type UserVoiceSettings,
} from "./generated/prisma/client"

const invert = <K extends string, V extends string>(map: Record<K, V>) =>
  Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k])) as Record<V, K>

export const workerModeToDb: Record<ApiWorkerMode, DbWorkerMode> = {
  auto: DbWorkerMode.AUTOMATIC,
  official: DbWorkerMode.OFFICIAL,
  private_preferred: DbWorkerMode.PRIVATE_PREFERRED,
  specific: DbWorkerMode.SPECIFIC,
}
export const workerModeFromDb = invert(workerModeToDb)

export const readingModeToDb: Record<ReadingMode, DbReadingMode> = {
  command: DbReadingMode.COMMAND,
  fixed: DbReadingMode.FIXED,
}
export const readingModeFromDb = invert(readingModeToDb)

export const longMessageToDb: Record<LongMessageBehavior, DbLongMessageBehavior> = {
  truncate: DbLongMessageBehavior.TRUNCATE,
  skip: DbLongMessageBehavior.SKIP,
}
export const longMessageFromDb = invert(longMessageToDb)

export const scopeToDb: Record<Exclude<ApiWorkerGuildScope, "none">, DbWorkerGuildScope> = {
  server: DbWorkerGuildScope.SERVER,
  personal: DbWorkerGuildScope.PERSONAL,
}
export const scopeFromDb = invert(scopeToDb)

/** API の Worker 状態（DEGRADED は error、DISABLED は offline として返す） */
export const workerStatusFromDb: Record<DbWorkerStatus, ApiWorkerStatus> = {
  ONLINE: "online",
  BUSY: "busy",
  DEGRADED: "error",
  ERROR: "error",
  OFFLINE: "offline",
  DISABLED: "offline",
}

export const workerTypeFromDb = (type: DbWorkerType) => (type === DbWorkerType.OFFICIAL ? "official" : "private")

type VoiceColumns = Pick<UserVoiceSettings, "engineId" | "speakerId" | "styleId" | "speed" | "pitch" | "intonation">

/** DB に保存された音声設定を API の形に変換する。未知のエンジン（廃止など）は null */
export function voiceFromColumns(row: VoiceColumns): VoiceSettings | null {
  if (!isEngineId(row.engineId)) return null
  return {
    engine: row.engineId,
    speakerId: row.speakerId,
    styleId: row.styleId,
    speed: row.speed,
    pitch: row.pitch,
    intonation: row.intonation,
  }
}

export function voiceToColumns(voice: VoiceSettings): VoiceColumns {
  return {
    engineId: voice.engine,
    speakerId: voice.speakerId,
    styleId: voice.styleId,
    speed: voice.speed,
    pitch: voice.pitch,
    intonation: voice.intonation,
  }
}

/** サーバーのデフォルト音声 */
export function guildVoice(settings: GuildSettings): VoiceSettings | null {
  return voiceFromColumns({
    engineId: settings.voiceEngineId,
    speakerId: settings.voiceSpeakerId,
    styleId: settings.voiceStyleId,
    speed: settings.voiceSpeed,
    pitch: settings.voicePitch,
    intonation: settings.voiceIntonation,
  })
}

export function guildVoiceColumns(voice: VoiceSettings) {
  return {
    voiceEngineId: voice.engine,
    voiceSpeakerId: voice.speakerId,
    voiceStyleId: voice.styleId,
    voiceSpeed: voice.speed,
    voicePitch: voice.pitch,
    voiceIntonation: voice.intonation,
  }
}

export function routingSettings(
  settings: Pick<GuildSettings, "workerMode" | "specificWorkerId" | "fallbackToOfficial">,
): RoutingSettings {
  return {
    workerMode: workerModeFromDb[settings.workerMode],
    specificWorkerId: settings.specificWorkerId,
    fallbackToOfficial: settings.fallbackToOfficial,
  }
}

/** 振り分け用の Worker（scope は対象サーバーでの接続） */
export function routingWorker(worker: {
  id: string
  type: DbWorkerType
  ownerUserId: string | null
  engines: { engineId: string }[]
  guildPermissions: { scope: DbWorkerGuildScope }[]
}): RoutingWorker {
  const permission = worker.guildPermissions[0]
  return {
    id: worker.id,
    type: workerTypeFromDb(worker.type),
    ownerUserId: worker.ownerUserId,
    scope: permission ? scopeFromDb[permission.scope] : null,
    engines: worker.engines.map((e) => e.engineId),
  }
}
