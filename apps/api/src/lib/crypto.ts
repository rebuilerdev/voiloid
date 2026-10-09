import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

/** 推測できないランダム文字列（セッション ID・OAuth の state） */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url")

/** AES-256-GCM。Redis に保存する Discord のトークンを暗号化する */
export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".")
}

export function decrypt(encoded: string, key: Buffer): string {
  const [iv, tag, data] = encoded.split(".").map((p) => Buffer.from(p, "base64url"))
  if (!iv || !tag || !data) throw new Error("Malformed ciphertext.")
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
}

/** 監査ログ用の IP ハッシュ（IP アドレスそのものは保存しない） */
export const hashIp = (ip: string, salt: string) => createHash("sha256").update(`${salt}:${ip}`).digest("hex")
