import { pino } from "pino"
import { vi } from "vitest"

import type { SessionInfo, SessionRecorder, VoiceConnector, VoiceHandle } from "../src/core/sessions"
import type { ServiceState } from "../src/core/service-state"

export const silentLogger = pino({ level: "silent" })

/** 再生をテストから進められる VoiceHandle */
export class FakeHandle implements VoiceHandle {
  played: string[] = []
  stopped = 0
  destroyed = false
  private finish: (() => void) | null = null
  private disconnected: (() => void)[] = []
  /** true なら再生をすぐ終える */
  autoFinish = true

  play(audio: Buffer) {
    this.played.push(audio.toString())
    if (this.autoFinish) return Promise.resolve()
    return new Promise<void>((resolve) => (this.finish = resolve))
  }
  /** 再生中の音声を終える */
  end() {
    const finish = this.finish
    this.finish = null
    finish?.()
  }
  stop() {
    this.stopped++
    this.end()
  }
  destroy() {
    this.destroyed = true
  }
  onDisconnected(callback: () => void) {
    this.disconnected.push(callback)
  }
  disconnect() {
    for (const cb of this.disconnected) cb()
  }
}

export class FakeConnector implements VoiceConnector {
  handles: FakeHandle[] = []
  fail = false
  connect() {
    if (this.fail) return Promise.reject(new Error("cannot connect"))
    const handle = new FakeHandle()
    this.handles.push(handle)
    return Promise.resolve(handle)
  }
}

export function fakeRecorder() {
  const events: string[] = []
  const recorder: SessionRecorder = {
    started: vi.fn((s: SessionInfo) => {
      events.push(`start:${s.voiceChannelId}`)
      return Promise.resolve("history-id")
    }),
    updated: vi.fn((s: SessionInfo) => {
      events.push(`update:${s.voiceChannelId}`)
      return Promise.resolve()
    }),
    ended: vi.fn((s: SessionInfo, _id: string | null, reason: string) => {
      events.push(`end:${s.voiceChannelId}:${reason}`)
      return Promise.resolve()
    }),
  }
  return { recorder, events }
}

export const flush = () => new Promise((r) => setTimeout(r, 0))

export const until = async (predicate: () => boolean, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("timeout")
    await new Promise((r) => setTimeout(r, 5))
  }
}

/** サービス全体の状態（テスト中に書き換えられる） */
export function fakeState() {
  const values = { paused: false, maxEntries: 1000, suspendedUsers: new Set<string>() }
  const state: ServiceState = {
    readingPaused: () => values.paused,
    dictionaryMaxEntries: () => values.maxEntries,
    isUserSuspended: (id) => values.suspendedUsers.has(id),
  }
  return { state, values }
}
