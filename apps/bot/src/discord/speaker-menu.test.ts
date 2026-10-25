import { describe, expect, it } from "vitest"

import type { SpeakerView } from "../core/speaker"
import { voiceLabel } from "../core/speaker"
import { isSpeakerCustomId, renderMenu, renderStyles, tuneModal } from "./speaker-menu"

const speakers = (count: number, styles = 1) =>
  Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    name: `話者${i}`,
    styles: Array.from({ length: styles }, (_, j) => ({ id: `${i}-${j}`, name: `スタイル${j}` })),
  }))

const view = (voice: SpeakerView["voice"] = null): SpeakerView => ({
  voice,
  engines: [
    { id: "VOICEVOX", speakers: speakers(30, 2) },
    { id: "COEIROINK", speakers: speakers(2) },
  ],
})

const voice = { engine: "VOICEVOX", speakerId: "s27", styleId: "27-1", speed: 1.2, pitch: 0, intonation: 1 } as const

const json = (rendered: { components?: readonly unknown[] }) =>
  (rendered.components ?? []).map((c) => (c as { toJSON(): { components: Record<string, unknown>[] } }).toJSON())

describe("renderMenu", () => {
  it("未設定なら案内し、調整・解除のボタンを押せない", () => {
    const rendered = renderMenu(view(), "ja")
    expect(JSON.stringify(rendered.embeds)).toContain("デフォルト音声")
    const [engine, select, buttons] = json(rendered)
    expect(engine?.components[0]).toMatchObject({ custom_id: "speaker:engine" })
    expect(select?.components[0]).toMatchObject({ custom_id: "speaker:select:VOICEVOX:0" })
    expect((select?.components[0]?.options as unknown[]).length).toBe(25)
    expect(buttons?.components.map((b) => b.disabled)).toEqual([true, false, true, true])
  })

  it("現在の声のエンジン・ページを開き、選択中の話者に印を付ける", () => {
    const rendered = renderMenu(view(voice), "ja")
    const [, select, buttons] = json(rendered)
    expect(select?.components[0]).toMatchObject({ custom_id: "speaker:select:VOICEVOX:1" })
    const options = select?.components[0]?.options as { value: string; default: boolean }[]
    expect(options.filter((o) => o.default).map((o) => o.value)).toEqual(["s27"])
    expect(buttons?.components.map((b) => b.custom_id)).toEqual([
      "speaker:page:VOICEVOX:0",
      "speaker:page:VOICEVOX:2",
      "speaker:tune",
      "speaker:reset",
    ])
    expect(JSON.stringify(rendered.embeds)).toContain("1.20")
  })

  it("エンジンを切り替える。エンジンが 1 つならエンジンの選択は出さない", () => {
    const [, select] = json(renderMenu(view(voice), "ja", { engineId: "COEIROINK" }))
    expect(select?.components[0]).toMatchObject({ custom_id: "speaker:select:COEIROINK:0" })
    const single = json(renderMenu({ voice: null, engines: [{ id: "VOICEVOX", speakers: speakers(1) }] }, "ja"))
    expect(single[0]?.components[0]).toMatchObject({ custom_id: "speaker:select:VOICEVOX:0" })
  })

  it("ID が長すぎる声は選択肢に出さない", () => {
    const [select] = json(
      renderMenu(
        {
          voice: null,
          engines: [{ id: "VOICEVOX", speakers: [...speakers(1), { id: "x".repeat(61), name: "長い", styles: [] }] }],
        },
        "ja",
      ),
    )
    expect((select?.components[0]?.options as unknown[]).length).toBe(1)
  })
})

describe("英語", () => {
  it("メニュー・モーダルを英語で表示する", () => {
    const rendered = renderMenu(view(voice), "en")
    expect(JSON.stringify(rendered.embeds)).toContain("Your reading voice")
    const [engine, , buttons] = json(rendered)
    expect(engine?.components[0]).toMatchObject({ placeholder: "Choose an engine" })
    expect(buttons?.components.map((b) => b.label)).toContain("Use the server default")
    expect(voiceLabel(view().engines, voice, "en")).toBe("話者27 (スタイル1)")
    expect(JSON.stringify(tuneModal(voice, "en").toJSON())).toContain("Speed (0.5 to 2, default 1)")
  })
})

describe("renderStyles / voiceLabel / tuneModal", () => {
  it("話者のスタイルを選ぶ画面と、戻るボタン（元のページ）", () => {
    const rendered = renderStyles(view(voice), "ja", "VOICEVOX", "s27")
    if (!rendered) throw new Error("expected styles")
    const [select, back] = json(rendered)
    expect(select?.components[0]).toMatchObject({ custom_id: "speaker:style:VOICEVOX:s27" })
    const options = select?.components[0]?.options as { value: string; default: boolean }[]
    expect(options.map((o) => [o.value, o.default])).toEqual([
      ["27-0", false],
      ["27-1", true],
    ])
    expect(back?.components[0]).toMatchObject({ custom_id: "speaker:page:VOICEVOX:1" })
    expect(renderStyles(view(), "ja", "VOICEVOX", "missing")).toBeNull()
  })

  it("声の名前。一覧に無ければ利用できないと表示する", () => {
    const { engines } = view()
    expect(voiceLabel(engines, voice, "ja")).toBe("話者27（スタイル1）")
    // スタイルが無くなった場合も ID は出さない
    expect(voiceLabel(engines, { ...voice, styleId: "gone" }, "ja")).toBe("話者27")
    expect(voiceLabel(engines, { ...voice, speakerId: "gone" }, "ja")).toBe("VOICEVOX の声（現在利用できません）")
  })

  it("調整のモーダルは現在の値（未設定なら標準値）を入れておく", () => {
    const values = (v: SpeakerView["voice"]) =>
      tuneModal(v, "ja")
        .toJSON()
        .components.map((label) => (label as { component: { custom_id: string; value?: string } }).component)
    expect(values(voice).map((c) => [c.custom_id, c.value])).toEqual([
      ["speed", "1.2"],
      ["pitch", "0"],
      ["intonation", "1"],
    ])
    expect(values(null).map((c) => c.value)).toEqual(["1", "0", "1"])
    expect(isSpeakerCustomId("speaker:tune")).toBe(true)
    expect(isSpeakerCustomId("speakers")).toBe(false)
  })
})
