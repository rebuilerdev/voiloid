/**
 * 内部 API（Bot / Control API 用）。外部には公開せず、共有トークンで認証する。
 */
import { timingSafeEqual } from "node:crypto"
import type { IncomingMessage, ServerResponse } from "node:http"

import { mapPrismaError } from "@voiloid/database"
import { AppError, isAppError } from "@voiloid/shared"
import {
  INTERNAL_API_PREFIX,
  internalPreviewRequestSchema,
  internalSynthesizeRequestSchema,
  SYNTH_HEADERS,
} from "@voiloid/shared/protocol"
import type { Logger } from "pino"
import { z, ZodError } from "zod"

import type { Router } from "./router"

const MAX_BODY_BYTES = 64 * 1024

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on("data", (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new AppError("VALIDATION_ERROR", "The request body is too large."))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")))
      } catch {
        reject(new AppError("VALIDATION_ERROR", "The request body must be JSON."))
      }
    })
    request.on("error", reject)
  })
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body))
}

export function createInternalApi(options: {
  token: string
  router: Router
  logger: Logger
  ready: () => Promise<boolean>
}) {
  const expected = Buffer.from(`Bearer ${options.token}`)

  function authorized(request: IncomingMessage): boolean {
    const given = Buffer.from(request.headers.authorization ?? "")
    return given.length === expected.length && timingSafeEqual(given, expected)
  }

  async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://localhost")

    if (url.pathname === "/healthz") return sendJson(response, 200, { status: "ok" })
    if (url.pathname === "/readyz") {
      return sendJson(response, (await options.ready()) ? 200 : 503, { status: "ok" })
    }
    if (!url.pathname.startsWith(INTERNAL_API_PREFIX)) throw new AppError("NOT_FOUND", "Not found.")
    if (!authorized(request)) throw new AppError("UNAUTHORIZED", "Invalid internal token.")

    const path = url.pathname.slice(INTERNAL_API_PREFIX.length)
    if (request.method === "POST" && path === "/synthesize") {
      const input = internalSynthesizeRequestSchema.parse(await readBody(request))
      const result = await options.router.synthesize(input)
      response
        .writeHead(200, {
          "content-type": "audio/wav",
          [SYNTH_HEADERS.voiceSource]: result.voiceSource,
          [SYNTH_HEADERS.workerId]: result.workerId,
          [SYNTH_HEADERS.engine]: result.engine,
        })
        .end(result.audio)
      return
    }
    if (request.method === "POST" && path === "/preview") {
      const input = internalPreviewRequestSchema.parse(await readBody(request))
      const audio = await options.router.preview(input)
      response.writeHead(200, { "content-type": "audio/wav" }).end(audio)
      return
    }
    if (request.method === "GET" && path === "/voices") {
      const { userId } = z.object({ userId: z.uuid() }).parse(Object.fromEntries(url.searchParams))
      return sendJson(response, 200, { data: options.router.voices(userId) })
    }
    throw new AppError("NOT_FOUND", "Not found.")
  }

  return function handle(request: IncomingMessage, response: ServerResponse) {
    route(request, response).catch((error: unknown) => {
      const appError =
        error instanceof ZodError
          ? new AppError("VALIDATION_ERROR", "The request is invalid.")
          : isAppError(error)
            ? error
            : mapPrismaError(error)
      if (appError.status >= 500 && appError.code !== "SERVICE_UNAVAILABLE") {
        options.logger.error({ err: error }, "internal API request failed")
      }
      if (!response.headersSent)
        sendJson(response, appError.status, { error: { code: appError.code, message: appError.message } })
    })
  }
}
