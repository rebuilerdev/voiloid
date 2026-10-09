/**
 * Prisma 固有の例外をアプリケーションエラーに変換する。
 * Prisma の例外（SQL・制約名・値を含む）をそのまま Frontend へ返さない。
 */
import { AppError, isAppError } from "@voiloid/shared"

import { Prisma } from "./generated/prisma/client"

/** PostgreSQL の SQLSTATE（Driver Adapter 経由のエラー用） */
const PG_CODES: Record<string, AppError["code"]> = {
  "23505": "CONFLICT", // unique_violation
  "23503": "VALIDATION_ERROR", // foreign_key_violation
  "23514": "VALIDATION_ERROR", // check_violation
  "23502": "VALIDATION_ERROR", // not_null_violation
  "22001": "VALIDATION_ERROR", // string_data_right_truncation
  "40001": "CONFLICT", // serialization_failure
  "40P01": "CONFLICT", // deadlock_detected
}

const PRISMA_CODES: Record<string, AppError["code"]> = {
  P2000: "VALIDATION_ERROR", // 値が列の長さを超える
  P2002: "CONFLICT", // Unique 制約違反
  P2003: "VALIDATION_ERROR", // Foreign Key 制約違反
  P2004: "VALIDATION_ERROR", // DB の制約違反（CHECK など）
  P2011: "VALIDATION_ERROR", // NOT NULL 制約違反
  P2025: "NOT_FOUND", // 対象のレコードが無い
  P2034: "CONFLICT", // トランザクションの競合・デッドロック
}

const MESSAGES: Record<AppError["code"], string> = {
  CONFLICT: "The resource already exists or was modified concurrently.",
  NOT_FOUND: "Resource not found.",
  VALIDATION_ERROR: "The request violates a data constraint.",
  SERVICE_UNAVAILABLE: "The database is temporarily unavailable.",
  INTERNAL_ERROR: "Internal server error.",
  UNAUTHORIZED: "Unauthorized.",
  FORBIDDEN: "Forbidden.",
  RATE_LIMITED: "Too many requests.",
}

/** Driver Adapter のエラーに含まれる PostgreSQL の SQLSTATE を取り出す */
function sqlState(error: Prisma.PrismaClientKnownRequestError): string | undefined {
  const meta = error.meta as { driverAdapterError?: { cause?: { originalCode?: unknown } } } | undefined
  const code = meta?.driverAdapterError?.cause?.originalCode
  return typeof code === "string" ? code : undefined
}

export function mapPrismaError(error: unknown): AppError {
  if (isAppError(error)) return error

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const state = sqlState(error)
    const code = (state === undefined ? undefined : PG_CODES[state]) ?? PRISMA_CODES[error.code] ?? "INTERNAL_ERROR"
    return new AppError(code, MESSAGES[code], { prismaCode: error.code, sqlState: state })
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new AppError("SERVICE_UNAVAILABLE", MESSAGES.SERVICE_UNAVAILABLE)
  }
  return new AppError("INTERNAL_ERROR", MESSAGES.INTERNAL_ERROR)
}

/** 指定した Prisma エラーかどうか（Unique 制約違反の判定など） */
export function isPrismaError(error: unknown, code: keyof typeof PRISMA_CODES): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
}
