import { describe, expect, it } from "vitest"
import { z } from "zod"

import { loadEnv } from "./env"

const schema = z.object({ URL: z.url().optional(), PORT: z.coerce.number().default(80), TOKEN: z.string().min(8) })

describe("loadEnv", () => {
  it("空文字は未設定として扱い、既定値を使う", () => {
    expect(loadEnv(schema, { URL: "", PORT: "", TOKEN: "12345678" })).toEqual({ PORT: 80, TOKEN: "12345678" })
  })

  it("不正な値は項目名と理由だけを示して失敗する", () => {
    expect(() => loadEnv(schema, { URL: "not-a-url", TOKEN: "secret" })).toThrow(/URL: .*\n?TOKEN: /s)
    expect(() => loadEnv(schema, { TOKEN: "leaked" })).not.toThrow(/leaked/)
  })
})
