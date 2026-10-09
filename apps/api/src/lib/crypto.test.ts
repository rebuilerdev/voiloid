import { describe, expect, it } from "vitest"

import { decrypt, encrypt, hashIp, randomToken } from "./crypto"

const key = Buffer.alloc(32, 1)

describe("crypto", () => {
  it("暗号化して元に戻せる。同じ平文でも毎回異なる暗号文になる", () => {
    const a = encrypt("secret-token", key)
    expect(decrypt(a, key)).toBe("secret-token")
    expect(encrypt("secret-token", key)).not.toBe(a)
    expect(a).not.toContain("secret")
  })

  it("改ざん・別の鍵・不正な形式は復号できない", () => {
    const encoded = encrypt("x", key)
    const [iv, tag, data] = encoded.split(".")
    expect(() => decrypt(`${iv}.${tag}.${data}AA`, key)).toThrow()
    expect(() => decrypt(encoded, Buffer.alloc(32, 2))).toThrow()
    expect(() => decrypt("broken", key)).toThrow("Malformed")
  })

  it("ランダムトークンと IP ハッシュ", () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(randomToken()).not.toBe(randomToken())
    expect(hashIp("1.2.3.4", "salt")).toBe(hashIp("1.2.3.4", "salt"))
    expect(hashIp("1.2.3.4", "salt")).not.toBe(hashIp("1.2.3.4", "other"))
    expect(hashIp("1.2.3.4", "salt")).not.toContain("1.2.3.4")
  })
})
