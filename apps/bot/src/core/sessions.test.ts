import { describe, expect, it, vi } from "vitest"

import { FakeConnector, fakeRecorder, FakeHandle, silentLogger, until } from "../../test/fakes"
import { ReadingSession, SessionManager } from "./sessions"

const info = (voiceChannelId = "vc1", textChannelId = "tc1") => ({
  guildId: "g1",
  botUserId: "bot1",
  textChannelId,
  textChannelName: "聞き専",
  voiceChannelId,
  voiceChannelName: "雑談",
})

/** text → 合成結果。テストから解決を制御できる */
function controllableSynth() {
  const pending = new Map<string, { resolve: (b: Buffer) => void; reject: (e: Error) => void }>()
  const calls: string[] = []
  const synth = vi.fn(({ text }: { text: string }) => {
    calls.push(text)
    return new Promise<Buffer>((resolve, reject) => pending.set(text, { resolve, reject }))
  })
  return {
    synth,
    calls,
    resolve: (text: string) => pending.get(text)?.resolve(Buffer.from(text)),
    reject: (text: string) => pending.get(text)?.reject(new Error("synthesis failed")),
  }
}

function session(synth: (r: { text: string }) => Promise<Buffer>, maxQueue = 10) {
  const handle = new FakeHandle()
  const s = new ReadingSession({ ...info(), startedAt: new Date() }, handle, synth, maxQueue, silentLogger)
  return { s, handle }
}

describe("ReadingSession", () => {
  it("届いた順に再生する（後のメッセージの合成が先に終わっても）", async () => {
    const c = controllableSynth()
    const { s, handle } = session(c.synth)
    s.enqueue("一", "u1")
    s.enqueue("二", "u2")
    c.resolve("二")
    c.resolve("一")
    await until(() => handle.played.length === 2)
    expect(handle.played).toEqual(["一", "二"])
    expect(c.synth).toHaveBeenCalledWith({ guildId: "g1", userId: "u1", text: "一" })
  })

  it("再生中に次のメッセージの合成を始めておく（先読みは 2 件まで）", async () => {
    const c = controllableSynth()
    const { s, handle } = session(c.synth)
    handle.autoFinish = false
    for (const t of ["1", "2", "3", "4", "5"]) s.enqueue(t, null)
    expect(c.calls).toEqual(["1", "2", "3"])
    c.resolve("1")
    await until(() => handle.played.length === 1)
    handle.end()
    await until(() => c.calls.length === 4)
    expect(c.calls).toEqual(["1", "2", "3", "4"])
  })

  it("合成に失敗したメッセージは飛ばして次へ進む", async () => {
    const c = controllableSynth()
    const { s, handle } = session(c.synth)
    s.enqueue("失敗", null)
    s.enqueue("成功", null)
    c.reject("失敗")
    c.resolve("成功")
    await until(() => handle.played.length === 1)
    expect(handle.played).toEqual(["成功"])
  })

  it("再生に失敗しても次へ進む", async () => {
    const handle = new FakeHandle()
    const play = vi.spyOn(handle, "play").mockRejectedValueOnce(new Error("player error"))
    const s = new ReadingSession(
      { ...info(), startedAt: new Date() },
      handle,
      (r) => Promise.resolve(Buffer.from(r.text)),
      10,
      silentLogger,
    )
    s.enqueue("a", null)
    s.enqueue("b", null)
    await until(() => play.mock.calls.length === 2)
    expect(s.pending).toBe(0)
  })

  it("待ちが上限を超えたら、再生中のものを残して古いものから捨てる", async () => {
    const c = controllableSynth()
    const { s, handle } = session(c.synth, 3)
    handle.autoFinish = false
    s.enqueue("1", null)
    c.resolve("1")
    await until(() => handle.played.length === 1)
    for (const t of ["2", "3", "4", "5"]) s.enqueue(t, null)
    expect(s.pending).toBe(3)
    for (const t of ["2", "3", "4", "5"]) c.resolve(t)
    handle.end()
    await until(() => handle.played.length === 2)
    expect(handle.played).toEqual(["1", "4"])
  })

  it("clear で再生中・待ちを捨て、close 後は何もしない", () => {
    const c = controllableSynth()
    const { s, handle } = session(c.synth)
    handle.autoFinish = false
    s.enqueue("1", null)
    s.enqueue("2", null)
    s.clear()
    expect(s.pending).toBe(0)
    expect(handle.stopped).toBe(1)
    s.close()
    expect(handle.destroyed).toBe(true)
    s.enqueue("3", null)
    expect(s.pending).toBe(0)
    c.resolve("1")
  })
})

describe("SessionManager", () => {
  function manager() {
    const connector = new FakeConnector()
    const { recorder, events } = fakeRecorder()
    const sessions = new SessionManager({
      connector,
      synthesize: (r) => Promise.resolve(Buffer.from(r.text)),
      recorder,
      logger: silentLogger,
      maxQueue: 10,
    })
    return { sessions, connector, events, recorder }
  }

  it("開始・検索・終了を記録する", async () => {
    const { sessions, events } = manager()
    const s = await sessions.start(info(), "user")
    expect(s.historyId).toBe("history-id")
    expect(sessions.byTextChannel("tc1")).toBe(s)
    expect(sessions.byVoiceChannel("vc1")).toBe(s)
    expect(sessions.get("g1", "bot1")).toBe(s)
    expect(sessions.inGuild("g1")).toEqual([s])
    expect(sessions.size).toBe(1)

    await sessions.moved(s, "vc2", "作業")
    expect(sessions.byVoiceChannel("vc2")).toBe(s)

    await sessions.stop(s, "leave_command")
    await sessions.stop(s, "again")
    expect(sessions.size).toBe(0)
    expect(events).toEqual(["start:vc1", "update:vc2", "end:vc2:leave_command"])
  })

  it("Discord 側で切断されたら終了する", async () => {
    const { sessions, connector, events } = manager()
    await sessions.start(info(), null)
    connector.handles[0]!.disconnect()
    await until(() => events.length === 2)
    expect(events[1]).toBe("end:vc1:disconnected")
  })

  it("接続に失敗したら記録しない。記録の失敗は読み上げを止めない", async () => {
    const { sessions, connector, recorder } = manager()
    connector.fail = true
    await expect(sessions.start(info(), null)).rejects.toThrow()
    expect(recorder.started).not.toHaveBeenCalled()

    connector.fail = false
    vi.mocked(recorder.started).mockRejectedValueOnce(new Error("redis down"))
    const s = await sessions.start(info(), null)
    expect(s.historyId).toBeNull()
    vi.mocked(recorder.ended).mockRejectedValueOnce(new Error("redis down"))
    await sessions.stopAll("shutdown")
    expect(sessions.size).toBe(0)
  })

  it("同じ Bot・サーバーで再び開始したら古いセッションを閉じる", async () => {
    const { sessions, connector } = manager()
    await sessions.start(info("vc1"), null)
    await sessions.start(info("vc2", "tc2"), null)
    expect(connector.handles[0]!.destroyed).toBe(true)
    expect(sessions.size).toBe(1)
  })
})
