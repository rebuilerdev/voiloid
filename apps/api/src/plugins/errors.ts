/**
 * エラーレスポンス: { error: { code, message, requestId } }
 * 内部エラー（Prisma・Discord・スタックトレース）の詳細は返さず、ログにだけ残す。
 */
import { mapPrismaError } from "@voiloid/database"
import { AppError, isAppError } from "@voiloid/shared"
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { ZodError } from "zod"

export function sendError(reply: FastifyReply, request: FastifyRequest, error: AppError) {
  return reply.status(error.status).send({
    error: { code: error.code, message: error.message, requestId: request.id },
  })
}

function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error
  if (error instanceof ZodError) {
    return new AppError(
      "VALIDATION_ERROR",
      "The request is invalid.",
      error.issues.map((i) => i.path.join(".")),
    )
  }
  const fastifyError = error as Partial<FastifyError>
  // JSON の構文エラー・本文が大きすぎる等（Fastify が 4xx を付けたもの）
  if (typeof fastifyError.statusCode === "number" && fastifyError.statusCode >= 400 && fastifyError.statusCode < 500) {
    if (fastifyError.statusCode === 413) return new AppError("VALIDATION_ERROR", "The request body is too large.")
    if (fastifyError.statusCode === 415) return new AppError("VALIDATION_ERROR", "Unsupported content type.")
    return new AppError("VALIDATION_ERROR", "The request is malformed.")
  }
  return mapPrismaError(error)
}

export function registerErrorHandlers(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    const appError = toAppError(error)
    if (appError.status >= 500) {
      request.log.error({ err: error }, "request failed")
    } else {
      request.log.info({ code: appError.code, details: appError.details }, appError.message)
    }
    if (appError.code === "RATE_LIMITED") {
      const retryAfter = (appError.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds
      if (retryAfter) void reply.header("retry-after", Math.ceil(retryAfter))
    }
    return sendError(reply, request, appError)
  })

  app.setNotFoundHandler((request, reply) => sendError(reply, request, new AppError("NOT_FOUND", "Not found.")))
}
