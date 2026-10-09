import { afterAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDatabase,
  createTestGuild,
  createTestUser,
  createTestWorker,
  resetTestDatabase,
} from "../../test/helpers"
import { mapPrismaError } from "../errors"
import { EngineHealth, WorkerGuildScope, WorkerMode, WorkerStatus, WorkerType } from "../generated/prisma/client"
import { routingSettings, routingWorker } from "../mappers"
import { createRepositories } from "../repositories"
import { commitBotProfile } from "./bot-profile.transactions"
import { deleteWorker, registerWorker, replaceWorkerConnections, rotateWorkerCredential } from "./worker.transactions"

const db = createTestDatabase()
const repos = createRepositories(db)

beforeEach(() => resetTestDatabase(db))
afterAll(() => db.$disconnect())

const register = (ownerUserId: string, publicId = "PUBLIC0000000001") =>
  registerWorker(db, {
    publicId,
    name: "home",
    engines: ["VOICEVOX", "COEIROINK"],
    secretHash: "hashed-secret",
    type: WorkerType.PRIVATE,
    ownerUserId,
  })

describe("registerWorker", () => {
  it("Worker・Credential・Engine・監査ログを 1 つの Transaction で作成する", async () => {
    const user = await createTestUser(db)
    const worker = await register(user.id)

    expect(worker).toMatchObject({ publicId: "PUBLIC0000000001", status: "OFFLINE", ownerUserId: user.id })
    expect(worker.engines.map((e) => [e.engineId, e.engineType, e.health])).toEqual([
      ["COEIROINK", "coeiroink", "UNKNOWN"],
      ["VOICEVOX", "voicevox", "UNKNOWN"],
    ])
    expect(await db.workerCredential.findUnique({ where: { workerId: worker.id } })).toMatchObject({
      secretHash: "hashed-secret",
    })
    expect(await db.auditLog.findFirst({ where: { action: "worker.create" } })).toMatchObject({
      actorUserId: user.id,
      targetId: worker.publicId,
    })
  })

  it("返却値に Credential（secretHash）を含めない", async () => {
    const user = await createTestUser(db)
    const worker = await register(user.id)
    expect(JSON.stringify(worker)).not.toContain("hashed-secret")
    expect(worker).not.toHaveProperty("credential")
  })

  it("途中で失敗したら何も作成しない（Rollback）", async () => {
    const user = await createTestUser(db)
    await register(user.id)
    const error = await register(user.id).catch(mapPrismaError)
    expect(error).toMatchObject({ code: "CONFLICT" })
    expect(await db.worker.count()).toBe(1)
    expect(await db.workerCredential.count()).toBe(1)
    expect(await db.auditLog.count({ where: { action: "worker.create" } })).toBe(1)
  })
})

describe("deleteWorker", () => {
  it("無効化・Credential 失効・ACL 削除・Soft Delete を行い、指定していたサーバーを自動に戻す", async () => {
    const user = await createTestUser(db)
    const guild = await createTestGuild(db)
    const worker = await register(user.id)
    await db.workerGuildPermission.create({ data: { workerId: worker.id, guildId: guild.id } })
    await db.guildSettings.create({ data: { guildId: guild.id, workerMode: "SPECIFIC", specificWorkerId: worker.id } })

    await deleteWorker(db, worker.id, user.id)

    const row = await db.worker.findUniqueOrThrow({ where: { id: worker.id }, include: { credential: true } })
    expect(row).toMatchObject({ enabled: false, status: "DISABLED" })
    expect(row.deletedAt).toBeInstanceOf(Date)
    expect(row.credential?.revokedAt).toBeInstanceOf(Date)
    expect(await db.workerGuildPermission.count()).toBe(0)
    expect(await db.guildSettings.findUniqueOrThrow({ where: { guildId: guild.id } })).toMatchObject({
      workerMode: "AUTOMATIC",
      specificWorkerId: null,
    })
    // Soft Delete のため通常の取得からは除外される
    expect(await repos.workers.findOwned(worker.publicId, user.id)).toBeNull()
    expect(await repos.workers.listVisibleTo(user.id)).toEqual([])
    expect(await db.auditLog.count({ where: { action: "worker.delete" } })).toBe(1)
  })

  it("存在しない Worker は NOT_FOUND で、何も変更しない", async () => {
    const error = await deleteWorker(db, "00000000-0000-7000-8000-000000000000", null).catch(mapPrismaError)
    expect(error).toMatchObject({ code: "NOT_FOUND" })
    expect(await db.auditLog.count()).toBe(0)
  })
})

describe("rotateWorkerCredential", () => {
  it("secret を差し替え、失効を解除する", async () => {
    const user = await createTestUser(db)
    const worker = await register(user.id)
    await db.workerCredential.update({ where: { workerId: worker.id }, data: { revokedAt: new Date() } })

    await rotateWorkerCredential(db, worker.id, "new-hash", user.id)

    const credential = await db.workerCredential.findUniqueOrThrow({ where: { workerId: worker.id } })
    expect(credential).toMatchObject({ secretHash: "new-hash", revokedAt: null })
    expect(credential.rotatedAt).toBeInstanceOf(Date)
    expect(await db.auditLog.count({ where: { action: "worker.rotate_token" } })).toBe(1)
  })
})

describe("replaceWorkerConnections", () => {
  it("接続先を置き換え、共有でなくなったサーバーの指定を自動に戻す", async () => {
    const user = await createTestUser(db)
    const [a, b, c] = await Promise.all([createTestGuild(db), createTestGuild(db), createTestGuild(db)])
    const worker = await register(user.id)
    await db.workerGuildPermission.createMany({
      data: [
        { workerId: worker.id, guildId: a.id, scope: "SERVER" },
        { workerId: worker.id, guildId: b.id, scope: "SERVER" },
      ],
    })
    await db.guildSettings.createMany({
      data: [
        { guildId: a.id, workerMode: "SPECIFIC", specificWorkerId: worker.id },
        { guildId: b.id, workerMode: "SPECIFIC", specificWorkerId: worker.id },
      ],
    })

    // a: 共有のまま / b: 自分専用に変更 / c: 新たに自分専用
    await replaceWorkerConnections(
      db,
      worker.id,
      [
        { guildId: a.id, scope: WorkerGuildScope.SERVER },
        { guildId: b.id, scope: WorkerGuildScope.PERSONAL },
        { guildId: c.id, scope: WorkerGuildScope.PERSONAL },
      ],
      user.id,
    )

    const connections = await repos.workers.listConnections(worker.id)
    expect(Object.fromEntries(connections.map((x) => [x.guild.id, x.scope]))).toEqual({
      [a.id]: "SERVER",
      [b.id]: "PERSONAL",
      [c.id]: "PERSONAL",
    })
    const settings = await db.guildSettings.findMany({ orderBy: { guildId: "asc" } })
    expect(Object.fromEntries(settings.map((s) => [s.guildId, s.workerMode]))).toEqual({
      [a.id]: "SPECIFIC",
      [b.id]: "AUTOMATIC",
    })

    // 全て解除
    await replaceWorkerConnections(db, worker.id, [], user.id)
    expect(await repos.workers.listConnections(worker.id)).toEqual([])
    expect(await db.auditLog.count({ where: { action: "worker.update_connections" } })).toBe(2)
  })
})

describe("workerRepository", () => {
  it("一覧は公式Worker と自分の自鯖Worker だけ（他人・削除済みを除く）", async () => {
    const [me, other] = await Promise.all([createTestUser(db), createTestUser(db)])
    await createTestWorker(db, { type: WorkerType.OFFICIAL, name: "official" })
    await createTestWorker(db, { ownerUserId: me.id, name: "mine" })
    await createTestWorker(db, { ownerUserId: other.id, name: "theirs" })
    const deleted = await createTestWorker(db, { ownerUserId: me.id, name: "deleted" })
    await db.worker.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } })

    expect((await repos.workers.listVisibleTo(me.id)).map((w) => w.name)).toEqual(["official", "mine"])
  })

  it("詳細は自分の自鯖Worker のみ。公式・他人の Worker は取得できない", async () => {
    const [me, other] = await Promise.all([createTestUser(db), createTestUser(db)])
    const official = await createTestWorker(db, { type: WorkerType.OFFICIAL })
    const mine = await createTestWorker(db, { ownerUserId: me.id })
    const theirs = await createTestWorker(db, { ownerUserId: other.id })

    expect(await repos.workers.findOwned(mine.publicId, me.id)).toMatchObject({ id: mine.id })
    expect(await repos.workers.findOwned(official.publicId, me.id)).toBeNull()
    expect(await repos.workers.findOwned(theirs.publicId, me.id)).toBeNull()
    expect(await repos.workers.findByPublicId(official.publicId)).toMatchObject({ id: official.id })
  })

  it("通常の取得に Credential を含めず、認証用の取得だけが含む", async () => {
    const me = await createTestUser(db)
    const worker = await createTestWorker(db, { ownerUserId: me.id })
    const listed = await repos.workers.listVisibleTo(me.id)
    expect(JSON.stringify(listed)).not.toContain("secretHash")
    expect(await repos.workers.findForAuth(worker.publicId)).toMatchObject({
      credential: { secretHash: "hash", revokedAt: null },
    })
    expect(await repos.workers.findForAuth("missing")).toBeNull()
  })

  it("名前の変更と状態の更新（削除済みの状態は上書きしない）", async () => {
    const worker = await createTestWorker(db)
    expect(await repos.workers.rename(worker.id, "renamed")).toMatchObject({ name: "renamed" })

    const seenAt = new Date("2026-10-09T00:00:00Z")
    await repos.workers.updateStatus(worker.id, WorkerStatus.ONLINE, {
      lastSeenAt: seenAt,
      version: "1.2.3",
      maxConcurrency: 4,
    })
    expect(await db.worker.findUnique({ where: { id: worker.id } })).toMatchObject({
      status: "ONLINE",
      lastSeenAt: seenAt,
      version: "1.2.3",
      maxConcurrency: 4,
    })

    await db.worker.update({ where: { id: worker.id }, data: { deletedAt: new Date(), status: "DISABLED" } })
    await repos.workers.updateStatus(worker.id, WorkerStatus.ONLINE)
    expect(await db.worker.findUnique({ where: { id: worker.id } })).toMatchObject({ status: "DISABLED" })
  })

  it("Gateway の再起動時に接続中の状態を OFFLINE に戻す", async () => {
    const [a, b] = await Promise.all([createTestWorker(db), createTestWorker(db)])
    await db.worker.update({ where: { id: a.id }, data: { status: "BUSY" } })
    expect(await repos.workers.resetOnlineStatuses()).toBe(1)
    expect((await db.worker.findMany()).map((w) => w.status)).toEqual(["OFFLINE", "OFFLINE"])
    expect(b.status).toBe("OFFLINE")
  })

  it("申告されたエンジンを反映し、申告に無いエンジンは UNHEALTHY にする", async () => {
    const worker = await createTestWorker(db, { engines: ["VOICEVOX", "COEIROINK"] })
    const seenAt = new Date()
    await repos.workers.syncEngines(
      worker.id,
      [
        {
          engineId: "VOICEVOX",
          engineType: "voicevox",
          engineName: "VOICEVOX",
          engineVersion: "0.21.1",
          health: EngineHealth.HEALTHY,
        },
        {
          engineId: "AivisSpeech",
          engineType: "voicevox",
          engineName: "AivisSpeech",
          engineVersion: "1.1.0",
          health: EngineHealth.DEGRADED,
        },
      ],
      seenAt,
    )
    const engines = await db.workerEngine.findMany({ where: { workerId: worker.id }, orderBy: { engineId: "asc" } })
    expect(engines.map((e) => [e.engineId, e.health, e.engineVersion])).toEqual([
      ["AivisSpeech", "DEGRADED", "1.1.0"],
      ["COEIROINK", "UNHEALTHY", null],
      ["VOICEVOX", "HEALTHY", "0.21.1"],
    ])
  })

  it("振り分け候補を 1 クエリで取得し、対象サーバーの接続だけを含める", async () => {
    const [me, other] = await Promise.all([createTestUser(db), createTestUser(db)])
    const [guild, elsewhere] = await Promise.all([createTestGuild(db), createTestGuild(db)])
    const official = await createTestWorker(db, { type: WorkerType.OFFICIAL, engines: ["VOICEVOX"] })
    const shared = await createTestWorker(db, {
      ownerUserId: other.id,
      engines: ["COEIROINK"],
      connections: [
        { guildId: guild.id, scope: WorkerGuildScope.SERVER },
        { guildId: elsewhere.id, scope: WorkerGuildScope.PERSONAL },
      ],
    })
    const personal = await createTestWorker(db, {
      ownerUserId: me.id,
      engines: ["AivisSpeech"],
      connections: [{ guildId: guild.id, scope: WorkerGuildScope.PERSONAL }],
    })
    // 接続していない・無効・削除済みの Worker は候補にしない
    await createTestWorker(db, { ownerUserId: me.id })
    const disabled = await createTestWorker(db, {
      connections: [{ guildId: guild.id, scope: WorkerGuildScope.SERVER }],
    })
    await db.worker.update({ where: { id: disabled.id }, data: { enabled: false } })

    const candidates = await repos.workers.listRoutingCandidates([guild.id])
    const routing = candidates.map(routingWorker)
    expect(routing.map((w) => [w.id, w.type, w.scope, w.engines])).toEqual(
      expect.arrayContaining([
        [official.id, "official", null, ["VOICEVOX"]],
        [shared.id, "private", "server", ["COEIROINK"]],
        [personal.id, "private", "personal", ["AivisSpeech"]],
      ]),
    )
    expect(routing).toHaveLength(3)

    // 接続中の Worker だけ
    await db.worker.update({ where: { id: official.id }, data: { status: "ONLINE" } })
    expect((await repos.workers.listRoutingCandidates([guild.id], { onlyConnected: true })).map((w) => w.id)).toEqual([
      official.id,
    ])
  })

  it("UNHEALTHY なエンジンは振り分け候補のエンジンに含めない", async () => {
    const worker = await createTestWorker(db, { type: WorkerType.OFFICIAL, engines: ["VOICEVOX", "AivisSpeech"] })
    await db.workerEngine.updateMany({
      where: { workerId: worker.id, engineId: "AivisSpeech" },
      data: { health: "UNHEALTHY" },
    })
    const [candidate] = await repos.workers.listRoutingCandidates([])
    expect(candidate?.engines).toEqual([{ engineId: "VOICEVOX" }])
  })

  it("サーバーに共有された自鯖Worker だけを返す", async () => {
    const guild = await createTestGuild(db)
    const shared = await createTestWorker(db, { connections: [{ guildId: guild.id, scope: WorkerGuildScope.SERVER }] })
    await createTestWorker(db, { connections: [{ guildId: guild.id, scope: WorkerGuildScope.PERSONAL }] })
    expect((await repos.workers.listSharedWithGuild(guild.id)).map((w) => w.id)).toEqual([shared.id])
  })
})

describe("mappers", () => {
  it("DB の設定を振り分け用に変換する", async () => {
    const guild = await createTestGuild(db)
    const settings = await db.guildSettings.create({
      data: { guildId: guild.id, workerMode: WorkerMode.PRIVATE_PREFERRED },
    })
    expect(routingSettings(settings)).toEqual({
      workerMode: "private_preferred",
      specificWorkerId: null,
      fallbackToOfficial: true,
    })
  })
})

describe("commitBotProfile", () => {
  it("プロフィールと監査ログを同じ Transaction で保存し、画像データを記録しない", async () => {
    const guild = await createTestGuild(db)
    const user = await createTestUser(db)
    const profile = await commitBotProfile(
      db,
      guild.id,
      { nickname: "ずんだ", avatarObjectKey: "avatars/x.png", discordAvatarHash: "hash", updatedByUserId: user.id },
      "iphash",
    )
    expect(profile).toMatchObject({ nickname: "ずんだ", discordAvatarHash: "hash" })
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "guild.bot_profile.update" } })
    expect(audit).toMatchObject({ guildId: guild.id, actorUserId: user.id, ipHash: "iphash" })
    expect(audit.metadata).toEqual({ nickname: "changed", avatar: "changed" })

    await commitBotProfile(db, guild.id, { nickname: null, updatedByUserId: user.id }, null)
    const latest = await db.auditLog.findFirstOrThrow({
      where: { action: "guild.bot_profile.update" },
      orderBy: { createdAt: "desc" },
    })
    expect(latest.metadata).toEqual({ nickname: "reset", avatar: "unchanged" })

    await commitBotProfile(db, guild.id, { avatarObjectKey: null, updatedByUserId: user.id }, null)
    const reset = await db.auditLog.findMany({
      where: { action: "guild.bot_profile.update" },
      orderBy: { createdAt: "asc" },
    })
    expect(reset.at(-1)?.metadata).toEqual({ nickname: "unchanged", avatar: "reset" })
  })
})
