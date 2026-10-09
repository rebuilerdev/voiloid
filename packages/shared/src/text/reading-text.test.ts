import { describe, expect, it } from "vitest"

import { compileDictionary, READING_PHRASES, toReadingText, type ReadingTextOptions } from "./reading-text"

const options = (patch: Partial<ReadingTextOptions> = {}): ReadingTextOptions => ({
  readUrls: false,
  maxCharacters: 100,
  longMessageBehavior: "truncate",
  ...patch,
})

describe("compileDictionary", () => {
  it("登録語が無ければそのまま返す", () => {
    expect(compileDictionary([])("Discord")).toBe("Discord")
    expect(compileDictionary([{ word: "", reading: "x" }])("abc")).toBe("abc")
  })

  it("大文字小文字を区別せずに置換する", () => {
    const dict = compileDictionary([{ word: "Discord", reading: "でぃすこーど" }])
    expect(dict("discord と DISCORD")).toBe("でぃすこーど と でぃすこーど")
  })

  it("長い語を優先する", () => {
    const dict = compileDictionary([
      { word: "VC", reading: "ぶいしー" },
      { word: "VCC", reading: "ぶいしーしー" },
    ])
    expect(dict("VCC と VC")).toBe("ぶいしーしー と ぶいしー")
  })

  it("置換後の文字列は再置換しない", () => {
    const dict = compileDictionary([
      { word: "a", reading: "b" },
      { word: "b", reading: "c" },
    ])
    expect(dict("ab")).toBe("bc")
  })

  it("Unicode の大文字小文字の対応が一致しない文字は置換しない", () => {
    // /iu では "s" が "ſ"（U+017F）に一致するが、"ſ".toLowerCase() は "s" にならない
    expect(compileDictionary([{ word: "s", reading: "えす" }])("ſ")).toBe("ſ")
  })

  it("正規表現の特殊文字をそのまま扱う", () => {
    const dict = compileDictionary([{ word: "c++", reading: "しーぷらぷら" }])
    expect(dict("c++ と c")).toBe("しーぷらぷら と c")
  })
})

describe("toReadingText", () => {
  it("URL は既定で省略する", () => {
    expect(toReadingText("見て https://example.com/a?b=c です", options())).toBe(`見て ${READING_PHRASES.url} です`)
  })

  it("readUrls が有効なら URL を残す", () => {
    expect(toReadingText("見て https://example.com", options({ readUrls: true }))).toBe("見て https://example.com")
  })

  it("コードブロック・伏せ字・カスタム絵文字・タイムスタンプ・インラインコードを整形する", () => {
    const text = "a ```ts\nconst x = 1\n``` b ||秘密|| <:pog:123456> <a:wave:42> <t:1700000000:R> `code`"
    expect(toReadingText(text, options())).toBe(
      `a ${READING_PHRASES.codeBlock} b ${READING_PHRASES.spoiler} pog wave code`,
    )
  })

  it("辞書を適用し、添付ファイルを読む", () => {
    const dictionary = compileDictionary([{ word: "w", reading: "わら" }])
    expect(toReadingText("w", options({ dictionary, attachments: 2 }))).toBe(`わら ${READING_PHRASES.attachment}`)
  })

  it("本文が空でも添付ファイルがあれば読む", () => {
    expect(toReadingText("", options({ attachments: 1 }))).toBe(READING_PHRASES.attachment)
  })

  it("読む内容が無ければ null", () => {
    expect(toReadingText("   ", options())).toBeNull()
    expect(toReadingText("<t:1700000000>", options())).toBeNull()
  })

  it("最大文字数を超えたら切り詰める", () => {
    expect(toReadingText("あいうえお", options({ maxCharacters: 3 }))).toBe(`あいう ${READING_PHRASES.truncated}`)
  })

  it("最大文字数ちょうどは切り詰めない", () => {
    expect(toReadingText("あいう", options({ maxCharacters: 3 }))).toBe("あいう")
  })

  it("skip なら最大文字数を超えたメッセージは読まない", () => {
    expect(toReadingText("あいうえお", options({ maxCharacters: 3, longMessageBehavior: "skip" }))).toBeNull()
  })

  it("絵文字（結合文字を含む）を途中で切らない", () => {
    const family = "👨‍👩‍👧"
    expect(toReadingText(`${family}${family}${family}`, options({ maxCharacters: 2 }))).toBe(
      `${family}${family} ${READING_PHRASES.truncated}`,
    )
  })
})
