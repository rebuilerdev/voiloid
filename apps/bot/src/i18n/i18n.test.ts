import { describe, expect, it } from "vitest"

import { en } from "./en"
import { fmt, localeFromDiscord, messages } from "./index"
import { ja } from "./ja"

const entries = (dict: Record<string, Record<string, string>>) =>
  Object.entries(dict).flatMap(([section, values]) =>
    Object.entries(values).map(([key, value]) => [`${section}.${key}`, value] as const),
  )

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe("i18n", () => {
  it("日本語の Discord は日本語、それ以外は英語", () => {
    expect(localeFromDiscord("ja")).toBe("ja")
    expect(localeFromDiscord("en-US")).toBe("en")
    expect(localeFromDiscord("ko")).toBe("en")
    expect(localeFromDiscord(null)).toBe("en")
    expect(messages("en")).toBe(en)
  })

  it("英語の文言は日本語と同じキー・同じ埋め込み項目を持つ", () => {
    const english = new Map(entries(en))
    for (const [key, text] of entries(ja)) {
      expect(english.get(key), key).toBeTruthy()
      expect(placeholders(english.get(key) ?? ""), key).toEqual(placeholders(text))
    }
    expect(english.size).toBe(entries(ja).length)
  })

  it("テンプレートに値を埋め込む（無い値はそのまま残す）", () => {
    expect(fmt("{a} and {b}", { a: 1 })).toBe("1 and {b}")
  })
})
