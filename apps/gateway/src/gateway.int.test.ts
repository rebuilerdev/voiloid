import { WorkerType } from "@voiloid/database"
import { createTestGuild, createTestUser, snowflake } from "@voiloid/database/testing"
import { redisKeys, WORKER_CLOSE } from "@voiloid/shared/protocol"
import WebSocket from "ws"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  createGatewayHarness,
  engine,
  FakeWorker,
  internal,
  registerTestWorker,
  until,
  type GatewayHarness,
} from "../test/harness"

const harness = createGatewayHarness()
let h: GatewayHarness

beforeEach(async () => {
  h = await harness.setup()
})
afterEach(() => harness.cleanup())
afterAll(() => harness.teardown())

/** ずんだもん（VOICEVOX 既定の声）を持つ公式Worker */
const ZUNDAMON = "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9"
const voicevox = engine("VOICEVOX", [[ZUNDAMON, ["3", "1"]]])

function fake(token: string, engines = [voicevox], name = "fake", maxConcurrency = 2) {
  const worker = new FakeWorker(h.workerUrl, token, engines, name, maxConcurrency)
  harness.workers.push(worker)
  return worker
}

async function connectionError(token: string | null, path = "/worker") {
  const url = h.workerUrl.replace("/worker", path)
  const socket = new WebSocket(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {})
  return new Promise<string>((resolve) => {
    socket.on("unexpected-response", (_req, res) => resolve(String(res.statusCode)))
    socket.on("open", () => resolve("open"))
    socket.on("error", (error) => resolve(error.message))
  })
}

async function synthesize(guildId: string, userId: string | null, text = "こんにちは") {
  return internal(h, "POST", "/synthesize", { guildId, userId, text })
}

describe("Worker の認証", () => {
  it("トークンが無い・不正・失効・削除済みの Worker は WebSocket を確立しない（401）", async () => {
    const { worker, token } = await registerTestWorker(h.db)
    expect(await connectionError(null)).toBe("401")
    expect(await connectionError("wkr_invalid")).toBe("401")
    expect(await connectionError(`${token.slice(0, -2)}xx`)).toBe("401")

    await h.db.workerCredential.update({ where: { workerId: worker.id }, data: { revokedAt: new Date() } })
    expect(await connectionError(token)).toBe("401")

    const deleted = await registerTestWorker(h.db)
    await h.db.worker.update({ where: { id: deleted.worker.id }, data: { deletedAt: new Date() } })
    expect(await connectionError(deleted.token)).toBe("401")

    const disabled = await registerTestWorker(h.db)
    await h.db.worker.update({ where: { id: disabled.worker.id }, data: { enabled: false } })
    expect(await connectionError(disabled.token)).toBe("401")
  })

  it("/worker 以外のパスは 404", async () => {
    const { token } = await registerTestWorker(h.db)
    expect(await connectionError(token, "/other")).toBe("404")
  })
})

describe("接続・hello", () => {
  it("hello で登録し、DB の状態・エンジンと Redis のリアルタイム状態を更新する", async () => {
    const { worker, token } = await registerTestWorker(h.db, { engines: ["VOICEVOX", "COEIROINK"] })
    const welcome = await fake(token).connect()
    expect(welcome).toMatchObject({ type: "welcome", workerId: worker.publicId })

    // 状態（ONLINE）の後にエンジンを同期するため、エンジンの同期まで待つ
    await until(async () =>
      (await h.db.workerEngine.findMany({ where: { workerId: worker.id } })).every((e) => e.health !== "UNKNOWN"),
    )
    const row = await h.db.worker.findUniqueOrThrow({ where: { id: worker.id }, include: { engines: true } })
    expect(row).toMatchObject({ version: "1.2.3", maxConcurrency: 2 })
    expect(Object.fromEntries(row.engines.map((e) => [e.engineId, e.health]))).toEqual({
      VOICEVOX: "HEALTHY",
      // 申告されなかったエンジン
      COEIROINK: "UNHEALTHY",
    })
    await until(async () => (await h.redis.get(redisKeys.workerLive(worker.id))) !== null)
    expect(JSON.parse((await h.redis.get(redisKeys.workerLive(worker.id)))!)).toMatchObject({
      status: "online",
      runningJobs: 0,
      maxConcurrency: 2,
    })
  })

  it("切断すると OFFLINE に戻し、リアルタイム状態を消す", async () => {
    const { worker, token } = await registerTestWorker(h.db)
    const w = fake(token)
    await w.connect()
    await until(async () => (await h.redis.get(redisKeys.workerLive(worker.id))) !== null)
    w.close()
    await until(async () => (await h.db.worker.findUniqueOrThrow({ where: { id: worker.id } })).status === "OFFLINE")
    expect(await h.redis.get(redisKeys.workerLive(worker.id))).toBeNull()
  })

  it("hello が届かない・プロトコル非対応・不正な hello は切断する", async () => {
    const { token } = await registerTestWorker(h.db)
    const silent = new WebSocket(h.workerUrl, { headers: { Authorization: `Bearer ${token}` } })
    const code = await new Promise<number>((resolve) => silent.on("close", (c) => resolve(c)))
    expect(code).toBe(WORKER_CLOSE.HELLO_TIMEOUT)

    const old = fake(token)
    await expect(old.connect({ protocolVersion: 999 })).rejects.toThrow(String(WORKER_CLOSE.INVALID_HELLO))

    const invalid = fake(token)
    await expect(invalid.connect({ hello: { type: "hello", engines: "x" } })).rejects.toThrow(
      String(WORKER_CLOSE.INVALID_HELLO),
    )
  })

  it("同じ Worker が再接続したら古い接続を切断する", async () => {
    const { worker, token } = await registerTestWorker(h.db)
    const first = fake(token)
    await first.connect()
    const second = fake(token)
    await second.connect()
    expect(await first.waitForClose()).toBe(WORKER_CLOSE.REPLACED)
    // 古い接続の切断で OFFLINE にしない
    await new Promise((r) => setTimeout(r, 100))
    expect((await h.db.worker.findUniqueOrThrow({ where: { id: worker.id } })).status).toBe("ONLINE")
    expect(h.gateway.registry.get(worker.id)).toBeDefined()
  })

  const notify = (workerId: string, extra: Record<string, unknown> = {}) =>
    h.redis.publish(redisKeys.invalidation(), JSON.stringify({ kind: "worker", workerId, ...extra }))

  it.each([
    ["トークン再発行", { credential: { update: { secretHash: "sha256:rotated" } } }],
    ["メンテナンス", { enabled: false }],
    ["削除", { deletedAt: new Date() }],
  ])("%s の通知で、再接続しても受け付けないコードで切断する", async (_label, data) => {
    const { worker, token } = await registerTestWorker(h.db)
    const w = fake(token)
    await w.connect()
    await h.db.worker.update({ where: { id: worker.id }, data })
    await notify(worker.publicId)
    expect(await w.waitForClose()).toBe(WORKER_CLOSE.DISABLED)
  })

  it("エンジンのオンオフの通知では切断せず、止めたエンジンをその場で反映する", async () => {
    const guild = await createTestGuild(h.db)
    const { worker, token } = await registerTestWorker(h.db)
    await fake(token).connect()
    expect((await synthesize(guild.discordGuildId, null)).status).toBe(200)

    await h.db.workerEngine.updateMany({ where: { workerId: worker.id }, data: { enabled: false } })
    await notify(worker.publicId)
    await until(async () => (await synthesize(guild.discordGuildId, null)).status === 503)
    expect(h.gateway.registry.get(worker.id)).toBeDefined()

    await h.db.workerEngine.updateMany({ where: { workerId: worker.id }, data: { enabled: true } })
    await notify(worker.publicId)
    await until(async () => (await synthesize(guild.discordGuildId, null)).status === 200)
  })

  it("古い Worker（configure 非対応）: Worker の申告より小さい数を守り、超えた依頼は順番待ちにする。変更は切断せずに反映する", async () => {
    const guild = await createTestGuild(h.db)
    const { worker, token } = await registerTestWorker(h.db)
    await h.db.worker.update({ where: { id: worker.id }, data: { concurrencyLimit: 1 } })
    const w = fake(token, [voicevox], "limited", 4)
    w.behavior = () => "ignore"
    await w.connect()
    const live = () => h.gateway.registry.get(worker.id)
    await until(() => live() !== undefined)
    expect(live()).toMatchObject({ maxConcurrency: 1, reportedConcurrency: 4, concurrencyLimit: 1 })

    // 2 件目は Worker に送らず、Gateway で待たせる
    void synthesize(guild.discordGuildId, null, "1件目")
    void synthesize(guild.discordGuildId, null, "2件目")
    await until(() => live()?.waiting?.length === 1)
    expect(w.jobs).toHaveLength(1)
    expect(h.gateway.registry.liveState(live()!)).toMatchObject({ status: "busy", runningJobs: 1, queue: 1 })

    // 上限を外すと、待っていた依頼をすぐに送る（切断しない）
    await h.db.worker.update({ where: { id: worker.id }, data: { concurrencyLimit: null } })
    await notify(worker.publicId)
    await until(() => w.jobs.length === 2)
    expect(live()).toMatchObject({ maxConcurrency: 4, concurrencyLimit: null })
  })

  it("configure に対応した Worker は、Web で設定した数を Worker の申告より大きくでき、Worker に伝える", async () => {
    const { worker, token } = await registerTestWorker(h.db)
    await h.db.worker.update({ where: { id: worker.id }, data: { concurrencyLimit: 8 } })
    const w = fake(token, [voicevox], "configurable", 2)
    await w.connect({ capabilities: ["configure"] })
    const live = () => h.gateway.registry.get(worker.id)
    await until(() => w.configured.length === 1)
    expect(w.configured).toEqual([8])
    expect(live()).toMatchObject({ maxConcurrency: 8, reportedConcurrency: 2, configurable: true })
    expect(h.gateway.registry.liveState(live()!)).toMatchObject({ maxConcurrency: 8, configurable: true })

    // 設定を外すと、Worker の申告（2）に戻すよう伝える
    await h.db.worker.update({ where: { id: worker.id }, data: { concurrencyLimit: null } })
    await notify(worker.publicId)
    await until(() => w.configured.length === 2)
    expect(w.configured).toEqual([8, 2])
    expect(live()).toMatchObject({ maxConcurrency: 2 })
  })

  it("運営者の「切断」は、すぐに再接続してよいコードで切断する", async () => {
    const { worker, token } = await registerTestWorker(h.db)
    const w = fake(token)
    await w.connect()
    await notify(worker.publicId, { reconnect: true })
    expect(await w.waitForClose()).toBe(WORKER_CLOSE.RECONNECT)
  })

  it("接続していない Worker の通知は何もしない", async () => {
    const { worker } = await registerTestWorker(h.db)
    await notify(worker.publicId)
    await notify("missing")
    expect(h.gateway.registry.list()).toEqual([])
  })
})

describe("合成の振り分け", () => {
  it("サーバーのデフォルト音声で合成し、利用記録を残す", async () => {
    const guild = await createTestGuild(h.db)
    const { worker, token } = await registerTestWorker(h.db, { name: "official-01" })
    await fake(token, [voicevox], "official").connect()

    const res = await synthesize(guild.discordGuildId, null, "こんにちは😀")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("audio/wav")
    expect(res.headers.get("x-voice-source")).toBe("guild")
    expect(res.headers.get("x-worker-id")).toBe(worker.publicId)
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("audio:official")

    await until(async () => (await h.db.usageEvent.count()) === 1)
    expect(await h.db.usageEvent.findFirst()).toMatchObject({
      guildId: guild.id,
      workerId: worker.id,
      workerType: "OFFICIAL",
      engineId: "VOICEVOX",
      characters: 6,
      success: true,
    })
  })

  it("投稿者のマイボイスを、本人の自分専用 Worker で優先して合成する", async () => {
    const guild = await createTestGuild(h.db)
    const alice = await createTestUser(h.db)
    await h.db.userVoiceSettings.create({
      data: { userId: alice.id, engineId: "COEIROINK", speakerId: "tsukuyomi", styleId: "0", speed: 1.2 },
    })
    const official = await registerTestWorker(h.db)
    await fake(official.token, [voicevox], "official").connect()
    const personal = await registerTestWorker(h.db, {
      type: WorkerType.PRIVATE,
      ownerUserId: alice.id,
      engines: ["COEIROINK"],
    })
    await h.db.workerGuildPermission.create({
      data: { workerId: personal.worker.id, guildId: guild.id, scope: "PERSONAL" },
    })
    const aliceWorker = fake(personal.token, [engine("COEIROINK", [["tsukuyomi", ["0"]]])], "alice")
    await aliceWorker.connect()

    const res = await synthesize(guild.discordGuildId, alice.discordUserId)
    expect(res.headers.get("x-voice-source")).toBe("user")
    expect(res.headers.get("x-worker-id")).toBe(personal.worker.publicId)
    expect(aliceWorker.jobs[0]).toMatchObject({ engine: "COEIROINK", speakerId: "tsukuyomi", styleId: "0", speed: 1.2 })

    // 他のユーザーは Alice の自分専用 Worker を使えないため、デフォルト音声になる
    const bob = await createTestUser(h.db)
    await h.db.userVoiceSettings.create({
      data: { userId: bob.id, engineId: "COEIROINK", speakerId: "tsukuyomi", styleId: "0" },
    })
    const other = await synthesize(guild.discordGuildId, bob.discordUserId)
    expect(other.headers.get("x-voice-source")).toBe("guild")
    expect(other.headers.get("x-worker-id")).toBe(official.worker.publicId)
  })

  it("マイボイスの話者を持つ Worker が無ければ、デフォルト音声にする", async () => {
    const guild = await createTestGuild(h.db)
    const user = await createTestUser(h.db)
    await h.db.userVoiceSettings.create({
      data: { userId: user.id, engineId: "VOICEVOX", speakerId: "unknown", styleId: "1" },
    })
    const { token } = await registerTestWorker(h.db)
    await fake(token).connect()
    const res = await synthesize(guild.discordGuildId, user.discordUserId)
    expect(res.headers.get("x-voice-source")).toBe("guild")
  })

  it("公式のみモードでは、サーバーに共有された自鯖Worker を使わない", async () => {
    const guild = await createTestGuild(h.db)
    await h.db.guildSettings.create({ data: { guildId: guild.id, workerMode: "OFFICIAL" } })
    const owner = await createTestUser(h.db)
    const shared = await registerTestWorker(h.db, { type: WorkerType.PRIVATE, ownerUserId: owner.id })
    await h.db.workerGuildPermission.create({
      data: { workerId: shared.worker.id, guildId: guild.id, scope: "SERVER" },
    })
    await fake(shared.token).connect()

    const res = await synthesize(guild.discordGuildId, null)
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ error: { code: "SERVICE_UNAVAILABLE" } })
    await until(async () => (await h.db.usageEvent.count({ where: { success: false } })) === 1)
  })

  it("Worker が失敗したら次の Worker で合成する", async () => {
    const guild = await createTestGuild(h.db)
    const a = await registerTestWorker(h.db)
    const b = await registerTestWorker(h.db)
    const first = fake(a.token, [voicevox], "a")
    const second = fake(b.token, [voicevox], "b")
    first.behavior = () => ({ ok: false, error: "engine crashed" })
    second.behavior = () => ({ ok: false, error: "engine crashed" })
    await first.connect()
    await second.connect()
    // 1 回目: どちらも失敗 → 503
    expect((await synthesize(guild.discordGuildId, null)).status).toBe(503)

    second.behavior = () => ({ ok: true, audio: Buffer.from("ok") })
    const res = await synthesize(guild.discordGuildId, null)
    expect(res.status).toBe(200)
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("ok")
  })

  it("応答しない Worker はタイムアウトして次の Worker へ", async () => {
    const guild = await createTestGuild(h.db)
    const a = await registerTestWorker(h.db)
    const b = await registerTestWorker(h.db)
    const stuck = fake(a.token, [voicevox], "stuck", 4)
    stuck.behavior = () => "ignore"
    const healthy = fake(b.token, [voicevox], "healthy", 1)
    await stuck.connect()
    await healthy.connect()
    // 負荷の低い（同時実行数の大きい）stuck が先に選ばれる
    const res = await synthesize(guild.discordGuildId, null)
    expect(res.status).toBe(200)
    expect(stuck.jobs).toHaveLength(1)
    expect(healthy.jobs).toHaveLength(1)
  })

  it("合成中に Worker が切断したら失敗として次へ", async () => {
    const guild = await createTestGuild(h.db)
    const a = await registerTestWorker(h.db)
    const w = fake(a.token, [voicevox])
    w.behavior = () => {
      setTimeout(() => w.close(), 10)
      return "ignore"
    }
    await w.connect()
    const res = await synthesize(guild.discordGuildId, null)
    expect(res.status).toBe(503)
  })

  it("Bot 未導入・未登録のサーバーは 404", async () => {
    const guild = await createTestGuild(h.db, { botInstalled: false })
    expect((await synthesize(guild.discordGuildId, null)).status).toBe(404)
    expect((await synthesize(snowflake(), null)).status).toBe(404)
  })

  it("運営者が利用停止したサーバーは合成しない（403）", async () => {
    const guild = await createTestGuild(h.db)
    await h.db.guild.update({ where: { id: guild.id }, data: { suspendedAt: new Date(), suspendedReason: "規約違反" } })
    const { token } = await registerTestWorker(h.db)
    await fake(token).connect()
    expect((await synthesize(guild.discordGuildId, null)).status).toBe(403)
    expect(await h.db.usageEvent.count()).toBe(0)
  })

  it("設定変更の通知でキャッシュを破棄する", async () => {
    const guild = await createTestGuild(h.db)
    const { token } = await registerTestWorker(h.db)
    await fake(token).connect()
    expect((await synthesize(guild.discordGuildId, null)).status).toBe(200)

    await h.db.guildSettings.update({ where: { guildId: guild.id }, data: { voiceSpeakerId: "missing" } })
    // 通知前はキャッシュされた設定で合成できる
    expect((await synthesize(guild.discordGuildId, null)).status).toBe(200)
    await h.redis.publish(redisKeys.invalidation(), JSON.stringify({ kind: "guild", guildId: guild.discordGuildId }))
    await until(async () => (await synthesize(guild.discordGuildId, null)).status === 503)
  })
})

describe("エンジンのオンオフ・公式Worker の担当サーバー", () => {
  it("運営者が止めたエンジンは、振り分け・声の一覧・プレビューに使わない", async () => {
    const guild = await createTestGuild(h.db)
    const user = await createTestUser(h.db)
    const { worker, token } = await registerTestWorker(h.db)
    await h.db.workerEngine.updateMany({ where: { workerId: worker.id }, data: { enabled: false } })
    await fake(token).connect()
    expect((await synthesize(guild.discordGuildId, null)).status).toBe(503)
    expect(await (await internal(h, "GET", `/voices?userId=${user.id}`)).json()).toEqual({ data: [] })
    const voice = { engine: "VOICEVOX", speakerId: ZUNDAMON, styleId: "3", speed: 1, pitch: 0, intonation: 1 }
    expect((await internal(h, "POST", "/preview", { userId: user.id, voice, text: "テスト" })).status).toBe(503)
  })

  it("担当するサーバーを指定した公式Worker は、指定したサーバーでだけ使う。routing の通知で再計算する", async () => {
    const [assigned, other] = await Promise.all([createTestGuild(h.db), createTestGuild(h.db)])
    const { worker, token } = await registerTestWorker(h.db)
    await h.db.worker.update({ where: { id: worker.id }, data: { restrictedToGuilds: true } })
    await h.db.workerGuildPermission.create({ data: { workerId: worker.id, guildId: assigned.id } })
    await fake(token).connect()
    expect((await synthesize(assigned.discordGuildId, null)).status).toBe(200)
    expect((await synthesize(other.discordGuildId, null)).status).toBe(503)

    await h.db.worker.update({ where: { id: worker.id }, data: { restrictedToGuilds: false } })
    await h.redis.publish(redisKeys.invalidation(), JSON.stringify({ kind: "routing" }))
    await until(async () => (await synthesize(other.discordGuildId, null)).status === 200)
    // 切断しない
    expect(h.gateway.registry.get(worker.id)).toBeDefined()
  })

  it("サーバーでオフにしたエンジンのマイボイスは使わず、デフォルト音声で読む", async () => {
    const guild = await createTestGuild(h.db)
    const alice = await createTestUser(h.db)
    await h.db.userVoiceSettings.create({
      data: { userId: alice.id, engineId: "COEIROINK", speakerId: "tsukuyomi", styleId: "0" },
    })
    await h.db.guildSettings.create({ data: { guildId: guild.id, disabledEngines: ["COEIROINK"] } })
    const { token } = await registerTestWorker(h.db, { engines: ["VOICEVOX", "COEIROINK"] })
    await fake(token, [voicevox, engine("COEIROINK", [["tsukuyomi", ["0"]]])]).connect()
    const res = await synthesize(guild.discordGuildId, alice.discordUserId)
    expect(res.status).toBe(200)
    expect(res.headers.get("x-voice-source")).toBe("guild")
  })
})

describe("プレビュー・声の一覧", () => {
  it("公式Worker と本人の自鯖Worker だけを使い、他人の Worker は使わない", async () => {
    const [alice, bob] = await Promise.all([createTestUser(h.db), createTestUser(h.db)])
    const official = await registerTestWorker(h.db)
    await fake(official.token, [voicevox]).connect()
    const aliceWorker = await registerTestWorker(h.db, {
      type: WorkerType.PRIVATE,
      ownerUserId: alice.id,
      engines: ["COEIROINK"],
    })
    await fake(aliceWorker.token, [engine("COEIROINK", [["tsukuyomi", ["0"]]])], "alice").connect()

    const voice = { engine: "COEIROINK", speakerId: "tsukuyomi", styleId: "0", speed: 1, pitch: 0, intonation: 1 }
    const ok = await internal(h, "POST", "/preview", { userId: alice.id, voice, text: "テスト" })
    expect(Buffer.from(await ok.arrayBuffer()).toString()).toBe("audio:alice")
    expect((await internal(h, "POST", "/preview", { userId: bob.id, voice, text: "テスト" })).status).toBe(503)

    const voices = async (userId: string) =>
      ((await (await internal(h, "GET", `/voices?userId=${userId}`)).json()) as { data: { engine: string }[] }).data
    expect((await voices(alice.id)).map((v) => v.engine).sort()).toEqual(["COEIROINK", "VOICEVOX", "VOICEVOX"])
    expect((await voices(bob.id)).map((v) => v.engine)).toEqual(["VOICEVOX", "VOICEVOX"])
  })

  it("異常なエンジンの声は一覧に出さない", async () => {
    const user = await createTestUser(h.db)
    const { token } = await registerTestWorker(h.db)
    await fake(token, [engine("VOICEVOX", [["s", ["1"]]], false)]).connect()
    const res = await internal(h, "GET", `/voices?userId=${user.id}`)
    expect(await res.json()).toEqual({ data: [] })
  })
})

describe("内部 API", () => {
  it("トークンが無い・異なる場合は 401、不正な入力は 400、未知のパスは 404", async () => {
    expect((await internal(h, "GET", "/voices?userId=x", undefined, "wrong")).status).toBe(401)
    expect((await internal(h, "POST", "/synthesize", { guildId: "x" })).status).toBe(400)
    expect((await internal(h, "GET", "/voices?userId=not-uuid")).status).toBe(400)
    expect((await internal(h, "GET", "/unknown")).status).toBe(404)
    const raw = await fetch(`${h.internalUrl}/internal/v1/synthesize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${"t".repeat(40)}` },
      body: "{bad",
    })
    expect(raw.status).toBe(400)
  })

  it("ヘルスチェック", async () => {
    expect((await fetch(`${h.internalUrl}/healthz`)).status).toBe(200)
    expect((await fetch(`${h.internalUrl}/readyz`)).status).toBe(200)
    expect((await fetch(h.workerUrl.replace("ws:", "http:").replace("/worker", "/healthz"))).status).toBe(200)
  })
})
