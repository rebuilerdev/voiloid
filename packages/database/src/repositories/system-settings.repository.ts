import type { DbClient } from "../client"
import type { SystemSettings } from "../generated/prisma/client"

/** 更新できる項目。undefined の項目は変更しない */
export type SystemSettingsPatch = Partial<Omit<SystemSettings, "id" | "updatedAt">>

const ID = 1

export function systemSettingsRepository(db: DbClient) {
  return {
    /** サービス全体の設定（無ければ既定値で作る） */
    get(): Promise<SystemSettings> {
      return db.systemSettings.upsert({ where: { id: ID }, create: { id: ID }, update: {} })
    },

    update(patch: SystemSettingsPatch): Promise<SystemSettings> {
      return db.systemSettings.upsert({ where: { id: ID }, create: { id: ID, ...patch }, update: patch })
    },
  }
}

export type SystemSettingsRepository = ReturnType<typeof systemSettingsRepository>
