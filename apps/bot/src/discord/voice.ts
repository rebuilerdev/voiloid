/**
 * @discordjs/voice による VC 接続と再生。
 * WAV を 48kHz ステレオの PCM に変換し（core/pcm.ts）、@discordjs/opus で Opus にして流す。FFmpeg は使わない。
 */
import { Readable } from "node:stream"

import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  StreamType,
  VoiceConnectionStatus,
} from "@discordjs/voice"
import type { Client } from "discord.js"
import type { Logger } from "pino"

import { wavToDiscordPcm } from "../core/pcm"
import type { VoiceConnector, VoiceHandle } from "../core/sessions"

const READY_TIMEOUT_MS = 20_000
const RECONNECT_TIMEOUT_MS = 5_000
/** 1 回の再生の上限（異常な音声で詰まらないようにする） */
const MAX_PLAYBACK_MS = 120_000

export function createVoiceConnector(clients: Map<string, Client<true>>, logger: Logger): VoiceConnector {
  return {
    async connect({ botUserId, guildId, voiceChannelId }) {
      const client = clients.get(botUserId)
      const guild = client?.guilds.cache.get(guildId)
      if (!guild) throw new Error(`bot ${botUserId} is not in guild ${guildId}`)

      const connection = joinVoiceChannel({
        channelId: voiceChannelId,
        guildId,
        adapterCreator: guild.voiceAdapterCreator,
        // 複数の Bot が同じサーバーで別々に接続できるようにする
        group: botUserId,
        selfDeaf: true,
      })
      try {
        await entersState(connection, VoiceConnectionStatus.Ready, READY_TIMEOUT_MS)
      } catch (error) {
        connection.destroy()
        throw error
      }

      const player = createAudioPlayer()
      connection.subscribe(player)
      player.on("error", (error) => logger.warn({ err: error, guild: guildId }, "audio player error"))

      const disconnectedCallbacks: (() => void)[] = []
      connection.on(VoiceConnectionStatus.Disconnected, () => {
        // 別の VC への移動などで一時的に切れた場合は再接続を待つ
        Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, RECONNECT_TIMEOUT_MS),
          entersState(connection, VoiceConnectionStatus.Connecting, RECONNECT_TIMEOUT_MS),
        ]).catch(() => {
          if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy()
          for (const callback of disconnectedCallbacks) callback()
        })
      })

      const handle: VoiceHandle = {
        play(audio) {
          let pcm: Buffer
          try {
            pcm = wavToDiscordPcm(audio)
          } catch (error) {
            // 変換できない音声は再生せず、セッションは次のメッセージへ進む
            return Promise.reject(error instanceof Error ? error : new Error(String(error)))
          }
          return new Promise<void>((resolve) => {
            const resource = createAudioResource(Readable.from([pcm]), { inputType: StreamType.Raw })
            const timer = setTimeout(() => player.stop(true), MAX_PLAYBACK_MS)
            const done = () => {
              clearTimeout(timer)
              player.off(AudioPlayerStatus.Idle, done)
              player.off("error", done)
              resolve()
            }
            player.on(AudioPlayerStatus.Idle, done)
            player.on("error", done)
            player.play(resource)
          })
        },
        stop() {
          player.stop(true)
        },
        destroy() {
          player.stop(true)
          if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy()
        },
        onDisconnected(callback) {
          disconnectedCallbacks.push(callback)
        },
      }
      return handle
    },
  }
}
