import { notFound } from "@voiloid/shared"
import { snowflakeSchema } from "@voiloid/shared/contracts"
import type { FastifyRequest } from "fastify"
import type { z } from "zod"

/** 成功レスポンス: { data } */
export const ok = <T>(data: T) => ({ data })

/** Zod で検証する（失敗はエラーハンドラーが VALIDATION_ERROR にする） */
export const parse = <T>(schema: z.ZodType<T>, value: unknown): T => schema.parse(value)

/** URL の Guild ID。形式が不正なら存在しないものとして扱う */
export function guildIdParam(request: FastifyRequest): string {
  const { guildId } = request.params as { guildId?: string }
  const result = snowflakeSchema.safeParse(guildId)
  if (!result.success) throw notFound("Guild")
  return result.data
}

const PUBLIC_ID = /^[A-Za-z0-9]{16,32}$/

export function workerIdParam(request: FastifyRequest): string {
  const { workerId } = request.params as { workerId?: string }
  if (!workerId || !PUBLIC_ID.test(workerId)) throw notFound("Worker")
  return workerId
}
