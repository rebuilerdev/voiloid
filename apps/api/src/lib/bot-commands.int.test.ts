import { botCommandSchema, redisKeys } from "@voiloid/shared/protocol"
import { Redis } from "ioredis"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"

import { TEST_REDIS_URL } from "../../../../test/env"
import { createBotCommander } from "./bot-commands"

const redis = new Redis(TEST_REDIS_URL)
const subscriber = new Redis(TEST_REDIS_URL)
const commander = createBotCommander(redis, { timeoutMs: 300, pollMs: 20 })

/** Bot の代わりに指示を受け、結果を書く */
async function fakeBot(reply: (id: string) => string | null) {
  await subscriber.subscribe(redisKeys.botCommands())
  const received: unknown[] = []
  subscriber.on("message", (_channel, raw: string) => {
    const command = botCommandSchema.parse(JSON.parse(raw))
    received.push(command)
    const value = reply(command.id)
    if (value !== null) void redis.set(redisKeys.botCommandResult(command.id), value, "EX", 60)
  })
  return received
}

beforeEach(() => redis.flushdb())
afterEach(async () => {
  subscriber.removeAllListeners("message")
  await subscriber.unsubscribe()
})
afterAll(async () => {
  await subscriber.quit()
  await redis.quit()
})

describe("createBotCommander", () => {
  it("Bot に指示を送り、結果を受け取る", async () => {
    const received = await fakeBot(() => JSON.stringify({ ok: false, message: "missing permissions" }))
    expect(await commander({ kind: "leave-guild", guildId: "1" })).toEqual({
      ok: false,
      message: "missing permissions",
    })
    expect(received).toMatchObject([{ kind: "leave-guild", guildId: "1" }])
  })

  it("Bot が動いていなければ 503", async () => {
    await expect(commander({ kind: "register-commands" })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" })
  })

  it("時間内に（正しい形の）結果が無ければ 503", async () => {
    await fakeBot(() => JSON.stringify({ unexpected: true }))
    await expect(commander({ kind: "stop-sessions", guildId: "1" })).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "The bot did not respond in time.",
    })
  })
})
