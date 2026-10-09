import { AppError } from "@voiloid/shared"
import { describe, expect, it } from "vitest"

import { isPrismaError, mapPrismaError } from "./errors"
import { Prisma } from "./generated/prisma/client"

const known = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError("raw message with SQL", { code, clientVersion: "7.10.0", meta })

const adapterError = (originalCode: string) => known("P2010", { driverAdapterError: { cause: { originalCode } } })

describe("mapPrismaError", () => {
  it.each([
    ["P2002", "CONFLICT"],
    ["P2025", "NOT_FOUND"],
    ["P2003", "VALIDATION_ERROR"],
    ["P2000", "VALIDATION_ERROR"],
    ["P2004", "VALIDATION_ERROR"],
    ["P2011", "VALIDATION_ERROR"],
    ["P2034", "CONFLICT"],
    ["P9999", "INTERNAL_ERROR"],
  ])("Prisma のエラーコード %s は %s", (code, expected) => {
    expect(mapPrismaError(known(code)).code).toBe(expected)
  })

  it.each([
    ["23505", "CONFLICT"],
    ["23503", "VALIDATION_ERROR"],
    ["23514", "VALIDATION_ERROR"],
    ["40P01", "CONFLICT"],
    ["99999", "INTERNAL_ERROR"],
  ])("PostgreSQL の SQLSTATE %s は %s", (state, expected) => {
    expect(mapPrismaError(adapterError(state)).code).toBe(expected)
  })

  it("元のメッセージ（SQL など）を含めない", () => {
    const error = mapPrismaError(known("P2002"))
    expect(error.message).not.toContain("SQL")
    expect(error.details).toEqual({ prismaCode: "P2002", sqlState: undefined })
  })

  it("接続できないときは SERVICE_UNAVAILABLE", () => {
    const error = new Prisma.PrismaClientInitializationError("cannot connect", "7.10.0")
    expect(mapPrismaError(error)).toMatchObject({ code: "SERVICE_UNAVAILABLE", status: 503 })
  })

  it("AppError はそのまま返し、未知のエラーは INTERNAL_ERROR", () => {
    const appError = new AppError("FORBIDDEN", "no")
    expect(mapPrismaError(appError)).toBe(appError)
    expect(mapPrismaError(new Error("boom"))).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Internal server error.",
    })
  })
})

describe("isPrismaError", () => {
  it("コードが一致する Prisma エラーだけを判定する", () => {
    expect(isPrismaError(known("P2002"), "P2002")).toBe(true)
    expect(isPrismaError(known("P2025"), "P2002")).toBe(false)
    expect(isPrismaError(new Error("x"), "P2002")).toBe(false)
  })
})
