import { parseWorkerToken } from "@voiloid/shared/protocol"
import { describe, expect, it } from "vitest"

import { generatePublicId, generateWorkerCredential, hashWorkerSecret, verifyWorkerSecret } from "./credentials"

describe("Worker の接続トークン", () => {
  it("トークンは形式どおりで、DB にはハッシュだけを保存する", () => {
    const publicId = generatePublicId()
    const credential = generateWorkerCredential(publicId)
    expect(parseWorkerToken(credential.token)).toEqual({ publicId, secret: credential.secret })
    expect(credential.secretHash).toBe(hashWorkerSecret(credential.secret))
    expect(credential.secretHash).not.toContain(credential.secret)
    expect(credential.secretHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it("正しい secret だけを受け付ける", () => {
    const { secret, secretHash } = generateWorkerCredential(generatePublicId())
    expect(verifyWorkerSecret(secret, secretHash)).toBe(true)
    expect(verifyWorkerSecret(`${secret}x`, secretHash)).toBe(false)
    expect(verifyWorkerSecret(secret, "sha256:short")).toBe(false)
  })

  it("毎回異なる値を生成する", () => {
    expect(generatePublicId()).not.toBe(generatePublicId())
    expect(generatePublicId()).toMatch(/^[A-Za-z0-9]{20}$/)
    const id = generatePublicId()
    expect(generateWorkerCredential(id).secret).not.toBe(generateWorkerCredential(id).secret)
  })
})
