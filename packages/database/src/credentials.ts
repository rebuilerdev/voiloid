/**
 * Worker の接続トークン。
 * secret は 256 bit の乱数のため、総当たりは現実的でない。保存するのは SHA-256 のハッシュだけ。
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

import { formatWorkerToken } from "@voiloid/shared/protocol"

const HASH_PREFIX = "sha256:"
const PUBLIC_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"

export interface WorkerCredentialSecret {
  /** Worker に一度だけ渡すトークン（保存しない） */
  token: string
  secret: string
  /** DB に保存するハッシュ */
  secretHash: string
}

export function hashWorkerSecret(secret: string): string {
  return HASH_PREFIX + createHash("sha256").update(secret, "utf8").digest("hex")
}

/** 定数時間で比較する */
export function verifyWorkerSecret(secret: string, secretHash: string): boolean {
  const expected = Buffer.from(secretHash, "utf8")
  const actual = Buffer.from(hashWorkerSecret(secret), "utf8")
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/** 推測できない公開 ID（紛らわしい文字を除いた 20 文字） */
export function generatePublicId(length = 20): string {
  const bytes = randomBytes(length)
  return Array.from(bytes, (b) => PUBLIC_ID_ALPHABET[b % PUBLIC_ID_ALPHABET.length]).join("")
}

export function generateWorkerCredential(publicId: string): WorkerCredentialSecret {
  const secret = randomBytes(32).toString("base64url")
  return { token: formatWorkerToken(publicId, secret), secret, secretHash: hashWorkerSecret(secret) }
}
