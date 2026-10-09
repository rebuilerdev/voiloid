/**
 * Bot への指示（運営コンソールから）。Redis の Pub/Sub で送り、Bot が書いた結果を待つ。
 */
import { randomUUID } from "node:crypto"

import { AppError } from "@voiloid/shared"
import type { BotCommandResult } from "@voiloid/shared/contracts"
import { botCommandResultSchema, redisKeys, type BotCommand } from "@voiloid/shared/protocol"
import type { Redis } from "ioredis"

type CommandInput = BotCommand extends infer C ? (C extends BotCommand ? Omit<C, "id"> : never) : never

export type BotCommander = (command: CommandInput) => Promise<BotCommandResult>

export function createBotCommander(redis: Redis, options: { timeoutMs?: number; pollMs?: number } = {}): BotCommander {
  const timeoutMs = options.timeoutMs ?? 10_000
  const pollMs = options.pollMs ?? 200

  return async (command) => {
    const id = randomUUID()
    const receivers = await redis.publish(redisKeys.botCommands(), JSON.stringify({ ...command, id }))
    if (receivers === 0) throw new AppError("SERVICE_UNAVAILABLE", "The bot is not running.")

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const raw = await redis.getdel(redisKeys.botCommandResult(id))
      if (raw) {
        const parsed = botCommandResultSchema.safeParse(JSON.parse(raw))
        if (parsed.success) return parsed.data
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs))
    }
    throw new AppError("SERVICE_UNAVAILABLE", "The bot did not respond in time.")
  }
}
