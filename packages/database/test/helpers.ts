/**
 * 統合テスト用のヘルパー（テスト DB 専用）。
 */
import { randomBytes } from "node:crypto"

import { assertTestDatabase, TEST_DATABASE_URL } from "../../../test/env"
import { createDatabase, type Database } from "../src/client"
import { type WorkerGuildScope, WorkerType } from "../src/generated/prisma/client"

export function createTestDatabase(): Database {
  assertTestDatabase(TEST_DATABASE_URL)
  return createDatabase({ url: TEST_DATABASE_URL, maxConnections: 4 })
}

/** 全テーブルを空にする（各テストの前に呼ぶ） */
export async function resetTestDatabase(db: Database): Promise<void> {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (tables.length === 0) return
  const list = tables.map((t) => `"public"."${t.tablename.replace(/"/g, '""')}"`).join(", ")
  // テーブル名は pg_tables から取得した値をエスケープしたもの（ユーザー入力ではない）
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}

let sequence = 0
const next = () => ++sequence

/** Discord の Snowflake 風 ID（テスト内で一意） */
export const snowflake = () => String(100000000000000000n + BigInt(next()))

export function createTestUser(db: Database, overrides: { discordUserId?: string; username?: string } = {}) {
  const discordUserId = overrides.discordUserId ?? snowflake()
  return db.user.create({
    data: { discordUserId, discordUsername: overrides.username ?? `user${discordUserId.slice(-4)}` },
  })
}

export function createTestGuild(
  db: Database,
  overrides: { discordGuildId?: string; name?: string; botInstalled?: boolean } = {},
) {
  return db.guild.create({
    data: {
      discordGuildId: overrides.discordGuildId ?? snowflake(),
      name: overrides.name ?? `guild-${next()}`,
      ownerDiscordUserId: snowflake(),
      botInstalled: overrides.botInstalled ?? true,
    },
  })
}

export function createTestWorker(
  db: Database,
  options: {
    type?: WorkerType
    ownerUserId?: string | null
    engines?: string[]
    name?: string
    connections?: { guildId: string; scope: WorkerGuildScope }[]
  } = {},
) {
  const type = options.type ?? WorkerType.PRIVATE
  return db.worker.create({
    data: {
      publicId: randomBytes(12).toString("hex"),
      name: options.name ?? `worker-${next()}`,
      type,
      ownerUserId: type === WorkerType.OFFICIAL ? null : (options.ownerUserId ?? null),
      credential: { create: { secretHash: "hash" } },
      engines: {
        create: (options.engines ?? ["VOICEVOX"]).map((engineId) => ({
          engineId,
          engineType: "voicevox",
          engineName: engineId,
          health: "HEALTHY",
        })),
      },
      guildPermissions: {
        create: (options.connections ?? []).map((c) => ({ guildId: c.guildId, scope: c.scope })),
      },
    },
  })
}
