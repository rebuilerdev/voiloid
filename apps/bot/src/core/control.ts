/**
 * 運営コンソールからの指示（Control API → Redis Pub/Sub → Bot）。結果は Redis に書き、API が待つ。
 */
import type { BotCommandResult } from "@voiloid/shared/contracts"
import { botCommandSchema, redisKeys, type BotCommand } from "@voiloid/shared/protocol"
import type { Redis } from "ioredis"
import type { Logger } from "pino"

import type { SessionManager } from "./sessions"

/** API が結果を受け取れなかった場合に残さない */
const RESULT_TTL_SECONDS = 60

export function createControlHandler(deps: {
  redis: Redis
  sessions: SessionManager
  /** すべての Bot をサーバーから退出させる（退出した Bot の数） */
  leaveGuild: (guildId: string) => Promise<number>
  /** スラッシュコマンドを登録し直す（登録したコマンドの数） */
  registerCommands: () => Promise<number>
  logger: Logger
}) {
  async function stopSessions(guildId: string, reason: string) {
    const targets = deps.sessions.inGuild(guildId)
    await Promise.all(targets.map((s) => deps.sessions.stop(s, reason)))
    return targets.length
  }

  async function run(command: BotCommand): Promise<BotCommandResult> {
    switch (command.kind) {
      case "stop-sessions":
        return { ok: true, message: `${await stopSessions(command.guildId, "admin")} session(s) stopped` }
      case "leave-guild": {
        await stopSessions(command.guildId, "admin")
        return { ok: true, message: `${await deps.leaveGuild(command.guildId)} bot(s) left` }
      }
      case "register-commands":
        return { ok: true, message: `${await deps.registerCommands()} command(s) registered` }
    }
  }

  /** Pub/Sub のメッセージを処理する（不正なメッセージは無視する） */
  return async function handle(raw: string): Promise<void> {
    let command: BotCommand
    try {
      const parsed = botCommandSchema.safeParse(JSON.parse(raw))
      if (!parsed.success) return
      command = parsed.data
    } catch {
      return
    }
    let result: BotCommandResult
    try {
      result = await run(command)
      deps.logger.info({ command: command.kind, result: result.message }, "control command executed")
    } catch (error) {
      deps.logger.warn({ err: error, command: command.kind }, "control command failed")
      result = { ok: false, message: (error instanceof Error ? error.message : "Unknown error").slice(0, 500) }
    }
    await deps.redis.set(redisKeys.botCommandResult(command.id), JSON.stringify(result), "EX", RESULT_TTL_SECONDS)
  }
}
