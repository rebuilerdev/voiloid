/**
 * 読み上げセッション（Discord に依存しない部分）。
 * - 1 つの Bot はサーバーごとに 1 つの VC にだけ参加できる（Discord の仕様）
 * - メッセージは届いた順に読み上げる。合成は再生より先に始めておき、待ち時間を減らす
 * - 待ちが多すぎる場合は古いものから捨てる
 */
import type { Logger } from "pino"

import type { Synthesizer } from "./synthesizer"

/** 再生中の次に、先に合成しておく数 */
const PREFETCH = 2

export interface VoiceHandle {
  /** 再生し、終わったら resolve する */
  play(audio: Buffer): Promise<void>
  /** 再生中の音声を止める */
  stop(): void
  /** VC から切断する */
  destroy(): void
  /** Discord 側で切断された（キック・接続失敗）ときに呼ばれる */
  onDisconnected(callback: () => void): void
}

export interface VoiceConnector {
  connect(input: { botUserId: string; guildId: string; voiceChannelId: string }): Promise<VoiceHandle>
}

export interface SessionInfo {
  /** Discord の Guild ID */
  guildId: string
  botUserId: string
  textChannelId: string
  textChannelName: string
  voiceChannelId: string
  voiceChannelName: string
  startedAt: Date
}

/** セッションの記録（Redis のリアルタイム状態・DB の履歴） */
export interface SessionRecorder {
  started(session: SessionInfo, startedByUserId: string | null): Promise<string | null>
  updated(session: SessionInfo): Promise<void>
  ended(session: SessionInfo, historyId: string | null, reason: string): Promise<void>
}

interface QueueItem {
  text: string
  userId: string | null
  audio: Promise<Buffer | null> | null
}

export class ReadingSession {
  private readonly queue: QueueItem[] = []
  private playing = false
  private closed = false
  historyId: string | null = null

  constructor(
    readonly info: SessionInfo,
    private readonly handle: VoiceHandle,
    private readonly synthesize: Synthesizer,
    private readonly maxQueue: number,
    private readonly logger: Logger,
  ) {}

  get key() {
    return sessionKey(this.info.guildId, this.info.botUserId)
  }

  get pending() {
    return this.queue.length
  }

  enqueue(text: string, userId: string | null): void {
    if (this.closed) return
    // 再生中のものは残し、待っているものの中で一番古いものを捨てる
    while (this.queue.length >= this.maxQueue) this.queue.splice(this.playing ? 1 : 0, 1)
    this.queue.push({ text, userId, audio: null })
    this.prefetch()
    void this.pump()
  }

  /** 先頭から PREFETCH + 1 件の合成を始める */
  private prefetch() {
    for (const item of this.queue.slice(0, PREFETCH + 1)) {
      item.audio ??= this.synthesize({ guildId: this.info.guildId, userId: item.userId, text: item.text }).catch(
        (error: unknown) => {
          this.logger.warn({ err: error, guild: this.info.guildId }, "synthesis failed; skipping the message")
          return null
        },
      )
    }
  }

  private async pump() {
    if (this.playing) return
    this.playing = true
    try {
      while (!this.closed && this.queue.length > 0) {
        this.prefetch()
        const item = this.queue[0]
        if (!item) break
        const audio = await item.audio
        // 待っている間に閉じられた場合
        if (this.isClosed()) return
        if (audio) {
          try {
            await this.handle.play(audio)
          } catch (error) {
            this.logger.warn({ err: error, guild: this.info.guildId }, "playback failed")
          }
        }
        if (this.queue[0] === item) this.queue.shift()
      }
    } finally {
      this.playing = false
    }
  }

  private isClosed() {
    return this.closed
  }

  /** 読み上げ中の音声と待ちを捨てる（/skip 相当） */
  clear(): void {
    this.queue.length = 0
    this.handle.stop()
  }

  close(): void {
    this.closed = true
    this.queue.length = 0
    this.handle.stop()
    this.handle.destroy()
  }
}

export const sessionKey = (guildId: string, botUserId: string) => `${guildId}:${botUserId}`

export class SessionManager {
  private readonly sessions = new Map<string, ReadingSession>()

  constructor(
    private readonly deps: {
      connector: VoiceConnector
      synthesize: Synthesizer
      recorder: SessionRecorder
      logger: Logger
      maxQueue: number
    },
  ) {}

  async start(info: Omit<SessionInfo, "startedAt">, startedByUserId: string | null): Promise<ReadingSession> {
    const handle = await this.deps.connector.connect({
      botUserId: info.botUserId,
      guildId: info.guildId,
      voiceChannelId: info.voiceChannelId,
    })
    const session = new ReadingSession(
      { ...info, startedAt: new Date() },
      handle,
      this.deps.synthesize,
      this.deps.maxQueue,
      this.deps.logger,
    )
    this.sessions.get(session.key)?.close()
    this.sessions.set(session.key, session)
    handle.onDisconnected(() => void this.stop(session, "disconnected"))
    session.historyId = await this.deps.recorder.started(session.info, startedByUserId).catch((error: unknown) => {
      this.deps.logger.error({ err: error }, "failed to record the session")
      return null
    })
    return session
  }

  async stop(session: ReadingSession, reason: string): Promise<void> {
    if (this.sessions.get(session.key) !== session) return
    this.sessions.delete(session.key)
    session.close()
    await this.deps.recorder.ended(session.info, session.historyId, reason).catch((error: unknown) => {
      this.deps.logger.error({ err: error }, "failed to record the end of the session")
    })
  }

  async stopAll(reason: string): Promise<void> {
    await Promise.all([...this.sessions.values()].map((s) => this.stop(s, reason)))
  }

  /** Bot が別の VC に移動された */
  async moved(session: ReadingSession, voiceChannelId: string, voiceChannelName: string): Promise<void> {
    session.info.voiceChannelId = voiceChannelId
    session.info.voiceChannelName = voiceChannelName
    await this.deps.recorder.updated(session.info).catch(() => undefined)
  }

  get(guildId: string, botUserId: string): ReadingSession | undefined {
    return this.sessions.get(sessionKey(guildId, botUserId))
  }

  byTextChannel(channelId: string): ReadingSession | undefined {
    return [...this.sessions.values()].find((s) => s.info.textChannelId === channelId)
  }

  byVoiceChannel(channelId: string): ReadingSession | undefined {
    return [...this.sessions.values()].find((s) => s.info.voiceChannelId === channelId)
  }

  inGuild(guildId: string): ReadingSession[] {
    return [...this.sessions.values()].filter((s) => s.info.guildId === guildId)
  }

  get size() {
    return this.sessions.size
  }
}
