/**
 * メッセージの読み上げと、VC の参加・退出の自動化（Discord に依存しない部分）。
 */
import { toReadingText } from "@voiloid/shared"
import type { Logger } from "pino"

import type { GuildConfigStore } from "./guild-config"
import type { ServiceState } from "./service-state"
import type { ReadingSession, SessionManager } from "./sessions"

export interface IncomingMessage {
  guildId: string
  channelId: string
  authorId: string
  authorIsBot: boolean
  /** メンションを名前に変換済みの本文 */
  content: string
  attachments: number
}

export interface VoiceChannelInfo {
  id: string
  name: string
  /** Bot 以外の参加者数 */
  humans: number
}

export interface BotSlot {
  botUserId: string
  /** このサーバーで VC に参加していない（空いている） */
  available: boolean
}

export function createReader(deps: {
  sessions: SessionManager
  configs: GuildConfigStore
  state: ServiceState
  logger: Logger
  /** 自動参加で使う Bot を選ぶ（空いている Bot が無ければ null） */
  pickBot: (guildId: string, voiceChannelId: string) => string | null
  /** チャンネル名（自動参加の記録用） */
  channelName: (guildId: string, channelId: string) => string
  setTimer?: (callback: () => void, ms: number) => NodeJS.Timeout
  clearTimer?: (timer: NodeJS.Timeout) => void
}) {
  const setTimer = deps.setTimer ?? setTimeout
  const clearTimer = deps.clearTimer ?? clearTimeout
  /** セッション → 自動退出のタイマー */
  const leaveTimers = new Map<ReadingSession, NodeJS.Timeout>()

  function cancelLeave(session: ReadingSession) {
    const timer = leaveTimers.get(session)
    if (timer) clearTimer(timer)
    leaveTimers.delete(session)
  }

  return {
    /** 読み上げ中のテキストチャンネルのメッセージを読む */
    async onMessage(message: IncomingMessage): Promise<boolean> {
      if (message.authorIsBot) return false
      // 一時停止中・利用停止中のユーザーの発言は読まない
      if (deps.state.readingPaused() || deps.state.isUserSuspended(message.authorId)) return false
      const session = deps.sessions.byTextChannel(message.channelId)
      if (!session) return false
      const config = await deps.configs.get(message.guildId)
      if (!config || config.suspended) return false
      const text = toReadingText(message.content, {
        readUrls: config.readUrls,
        maxCharacters: config.maxCharacters,
        longMessageBehavior: config.longMessageBehavior,
        dictionary: config.dictionary,
        attachments: message.attachments,
      })
      if (!text) return false
      session.enqueue(text, message.authorId)
      return true
    },

    /**
     * VC の参加者が変わった。
     * - 読み上げ中の VC から人がいなくなったら、設定した秒数の後に退出する
     * - チャンネル固定 + 自動参加の設定なら、指定 VC に人が来たら参加する
     */
    async onVoiceChannelChanged(guildId: string, channel: VoiceChannelInfo): Promise<void> {
      const config = await deps.configs.get(guildId)
      const session = deps.sessions.byVoiceChannel(channel.id)

      if (session) {
        if (channel.humans > 0) {
          cancelLeave(session)
          return
        }
        if (leaveTimers.has(session)) return
        const delayMs = (config?.autoLeaveDelaySeconds ?? 0) * 1000
        leaveTimers.set(
          session,
          setTimer(() => {
            leaveTimers.delete(session)
            void deps.sessions.stop(session, "empty")
          }, delayMs),
        )
        return
      }

      if (
        channel.humans > 0 &&
        !deps.state.readingPaused() &&
        config?.suspended === false &&
        config.readingMode === "fixed" &&
        config.autoJoin &&
        config.voiceChannelId === channel.id &&
        config.textChannelId &&
        !deps.sessions.byTextChannel(config.textChannelId)
      ) {
        const botUserId = deps.pickBot(guildId, channel.id)
        if (!botUserId) return
        try {
          const started = await deps.sessions.start(
            {
              guildId,
              botUserId,
              textChannelId: config.textChannelId,
              textChannelName: deps.channelName(guildId, config.textChannelId),
              voiceChannelId: channel.id,
              voiceChannelName: channel.name,
            },
            null,
          )
          started.enqueue("接続しました", null)
        } catch (error) {
          deps.logger.warn({ err: error, guild: guildId }, "auto join failed")
        }
      }
    },

    /** セッション終了時にタイマーを片付ける */
    forget(session: ReadingSession) {
      cancelLeave(session)
    },
  }
}

export type Reader = ReturnType<typeof createReader>
