/**
 * Web GUI の型と、Control API の契約（@voiloid/shared/contracts）が一致しているかをコンパイル時に確認する。
 * どちらかを変更して食い違うと `tsc`（CI の typecheck）が失敗する。実行時のコードは含まない。
 */
import type * as Contract from "@voiloid/shared/contracts"

import type {
  AdminGuild,
  AdminGuildDetail,
  AdminOverview,
  AdminUser,
  AdminUserDetail,
  AdminWorker,
  AdminWorkerConnection,
  AuditLogEntry,
  BotCommandResult,
  OperatorEntry,
  OperatorRole,
  Page,
  SystemSettingsView,
  UpdateAdminWorkerRequest,
  UpdateSystemSettingsRequest,
} from "@/types/admin"
import type { ApiErrorCode } from "@/types/api"
import type { DictionaryEntry, DictionaryEntryInput } from "@/types/dictionary"
import type {
  Guild,
  GuildBot,
  GuildBotProfile,
  GuildChannel,
  GuildDetail,
  GuildSettings,
  UpdateGuildBotProfileRequest,
} from "@/types/guild"
import type { ServiceStatus } from "@/types/status"
import type { UsageSummary } from "@/types/usage"
import type { CurrentUser, MemberGuild, UpdateMeRequest } from "@/types/user"
import type { Voice, VoicePreview, VoicePreviewRequest, VoiceSettings } from "@/types/voice"
import type { CreateWorkerResponse, UpdateWorkerGuildsRequest, Worker, WorkerGuildConnection } from "@/types/worker"

type Assert<T extends true> = T
/** API のレスポンスを Web の型として扱えるか */
type Readable<Api, Web> = [Api] extends [Web] ? true : false
/** 項目名が完全に一致するか（片方にだけある項目の検出） */
type SameKeys<A, B> = [keyof A] extends [keyof B] ? ([keyof B] extends [keyof A] ? true : false) : false

export type ContractChecks = [
  // レスポンス
  Assert<Readable<Contract.CurrentUser, CurrentUser>>,
  Assert<Readable<Contract.MemberGuild, MemberGuild>>,
  Assert<Readable<Contract.Guild, Guild>>,
  Assert<Readable<Contract.GuildDetail, GuildDetail>>,
  Assert<Readable<Contract.GuildBot, GuildBot>>,
  Assert<Readable<Contract.GuildChannel, GuildChannel>>,
  Assert<Readable<Contract.GuildSettings, GuildSettings>>,
  Assert<Readable<Contract.GuildBotProfile, GuildBotProfile>>,
  Assert<Readable<Contract.DictionaryEntry, DictionaryEntry>>,
  Assert<Readable<Contract.Worker, Worker>>,
  Assert<Readable<Contract.CreateWorkerResponse, CreateWorkerResponse>>,
  Assert<Readable<Contract.WorkerGuildConnection, WorkerGuildConnection>>,
  Assert<Readable<Contract.Voice, Voice>>,
  Assert<Readable<Contract.VoicePreview, VoicePreview>>,
  Assert<Readable<Contract.UsageSummary, UsageSummary>>,
  Assert<Readable<Contract.ServiceStatus, ServiceStatus>>,
  Assert<Readable<Contract.ApiErrorBody["error"]["code"], ApiErrorCode>>,
  Assert<Readable<Contract.AdminOverview, AdminOverview>>,
  Assert<Readable<Contract.Page<Contract.AdminGuild>, Page<AdminGuild>>>,
  Assert<Readable<Contract.AdminGuildDetail, AdminGuildDetail>>,
  Assert<Readable<Contract.Page<Contract.AdminUser>, Page<AdminUser>>>,
  Assert<Readable<Contract.Page<Contract.AuditLogEntry>, Page<AuditLogEntry>>>,
  Assert<Readable<Contract.AdminUserDetail, AdminUserDetail>>,
  Assert<Readable<Contract.AdminWorker[], AdminWorker[]>>,
  Assert<Readable<Contract.Page<Contract.AdminWorker>, Page<AdminWorker>>>,
  Assert<Readable<Contract.AdminWorkerConnection, AdminWorkerConnection>>,
  Assert<Readable<Contract.SystemSettingsView, SystemSettingsView>>,
  Assert<Readable<Contract.OperatorEntry, OperatorEntry>>,
  Assert<Readable<Contract.OperatorRole, OperatorRole>>,
  Assert<Readable<Contract.BotCommandResult, BotCommandResult>>,
  // リクエスト（項目名の一致。値の妥当性は Control API が Zod で検証する）
  Assert<SameKeys<Contract.UpdateMeRequest, UpdateMeRequest>>,
  Assert<SameKeys<Contract.VoiceSettings, VoiceSettings>>,
  Assert<SameKeys<Contract.VoicePreviewRequest, VoicePreviewRequest>>,
  Assert<SameKeys<Contract.DictionaryEntryInput, DictionaryEntryInput>>,
  Assert<SameKeys<Contract.UpdateGuildBotProfileRequest, UpdateGuildBotProfileRequest>>,
  Assert<SameKeys<Contract.UpdateWorkerGuildsRequest, UpdateWorkerGuildsRequest>>,
  Assert<SameKeys<Contract.UpdateGuildSettingsRequest, GuildSettings>>,
  Assert<SameKeys<Contract.UpdateAdminWorkerRequest, UpdateAdminWorkerRequest>>,
  Assert<SameKeys<Contract.UpdateSystemSettingsRequest, UpdateSystemSettingsRequest>>,
]
