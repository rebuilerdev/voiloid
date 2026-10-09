/**
 * アプリケーションエラー。Prisma・Discord などの内部エラーはこの形に変換してから返す。
 * Frontend へは { error: { code, message, requestId } } として返す。
 */
export const ERROR_STATUS = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const

export type ErrorCode = keyof typeof ERROR_STATUS

export class AppError extends Error {
  readonly status: number

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = "AppError"
    this.status = ERROR_STATUS[code]
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export const notFound = (resource = "Resource") => new AppError("NOT_FOUND", `${resource} not found.`)
export const forbidden = (message = "You do not have permission.") => new AppError("FORBIDDEN", message)
export const conflict = (message = "The resource already exists.") => new AppError("CONFLICT", message)
export const validationError = (message: string, details?: unknown) =>
  new AppError("VALIDATION_ERROR", message, details)
