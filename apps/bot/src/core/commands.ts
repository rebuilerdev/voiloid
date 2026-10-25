/**
 * スラッシュコマンドの処理（Discord に依存しない部分）。返り値を Discord の Embed に変換して返信する。
 */
import { dictionaryWordKey, type Repositories } from "@voiloid/database"
import { DICTIONARY_LENGTH } from "@voiloid/shared"
import type { Logger } from "pino"

import { fmt, messages, type Locale } from "../i18n"
import type { GuildConfigStore } from "./guild-config"
import type { ServiceState } from "./service-state"
import type { SessionManager } from "./sessions"
import { groupVoices, voiceLabel } from "./speaker"
import type { VoiceCatalog } from "./voice-catalog"

export interface Reply {
  tone: "success" | "info" | "error"
  title?: string
  description: string
  fields?: { name: string; value: string }[]
  /** 本人にだけ表示する */
  ephemeral?: boolean
}

export interface CommandContext {
  guildId: string
  userId: string
  channelId: string
  channelName: string
  /** 実行者が参加している VC */
  memberVoiceChannel: { id: string; name: string } | null
  /** 返信の言語（実行者の Discord の言語） */
  locale: Locale
}

const error = (description: string): Reply => ({ tone: "error", description, ephemeral: true })

const channel = (id: string) => `<#${id}>`

export function createCommands(deps: {
  sessions: SessionManager
  configs: GuildConfigStore
  state: ServiceState
  repos: Repositories
  logger: Logger
  appOrigin: string
  /** 声の一覧（/voice でキャラ名を表示するため） */
  listVoices: VoiceCatalog
  /** このサーバーのこの VC に参加できる、空いている Bot（メインボットを優先） */
  pickBot: (guildId: string, voiceChannelId: string) => string | null
  /** チャンネル名（存在しなければ null） */
  channelName: (guildId: string, channelId: string) => string | null
}) {
  const { sessions, configs, repos, state } = deps

  async function guildId(discordGuildId: string): Promise<string | null> {
    return (await configs.get(discordGuildId))?.guildId ?? null
  }

  /** 辞書を変更できるか（利用停止中のサーバー・ユーザーはできない） */
  async function editableGuild(ctx: CommandContext): Promise<{ id: string } | Reply> {
    const t = messages(ctx.locale)
    if (state.isUserSuspended(ctx.userId)) return error(t.errors.suspendedUser)
    const config = await configs.get(ctx.guildId)
    if (!config) return error(t.errors.configUnavailable)
    if (config.suspended) return error(t.errors.suspendedGuild)
    return { id: config.guildId }
  }

  return {
    async join(ctx: CommandContext): Promise<Reply> {
      const t = messages(ctx.locale)
      if (state.isUserSuspended(ctx.userId)) return error(t.errors.suspendedUser)
      if (state.readingPaused()) return error(t.join.paused)
      const config = await configs.get(ctx.guildId)
      if (!config) return error(t.join.configUnavailable)
      if (config.suspended) return error(t.errors.suspendedGuild)

      // チャンネル固定モードは設定されたチャンネル、コマンドモードは実行者の VC と実行したチャンネル
      let target: { voice: { id: string; name: string }; text: { id: string; name: string } }
      if (config.readingMode === "fixed" && config.textChannelId && config.voiceChannelId) {
        const voiceName = deps.channelName(ctx.guildId, config.voiceChannelId)
        const textName = deps.channelName(ctx.guildId, config.textChannelId)
        if (!voiceName || !textName) return error(t.join.fixedChannelMissing)
        target = {
          voice: { id: config.voiceChannelId, name: voiceName },
          text: { id: config.textChannelId, name: textName },
        }
      } else {
        if (!ctx.memberVoiceChannel) return error(t.join.notInVoice)
        target = { voice: ctx.memberVoiceChannel, text: { id: ctx.channelId, name: ctx.channelName } }
      }

      const existing = sessions.byVoiceChannel(target.voice.id)
      if (existing) {
        return error(fmt(t.join.voiceBusy, { channel: channel(target.voice.id), bot: `<@${existing.info.botUserId}>` }))
      }
      if (sessions.byTextChannel(target.text.id)) {
        return error(fmt(t.join.textBusy, { channel: channel(target.text.id) }))
      }

      const botUserId = deps.pickBot(ctx.guildId, target.voice.id)
      if (!botUserId) return error(t.join.noBot)

      let session
      try {
        session = await sessions.start(
          {
            guildId: ctx.guildId,
            botUserId,
            textChannelId: target.text.id,
            textChannelName: target.text.name,
            voiceChannelId: target.voice.id,
            voiceChannelName: target.voice.name,
          },
          ctx.userId,
        )
      } catch (err) {
        deps.logger.warn({ err, guild: ctx.guildId }, "failed to join the voice channel")
        return error(t.join.connectFailed)
      }
      session.enqueue("接続しました", null)
      return {
        tone: "success",
        title: t.join.title,
        description: fmt(t.join.description, { channel: channel(target.text.id) }),
        fields: [
          { name: t.join.voiceChannel, value: channel(target.voice.id) },
          { name: t.join.bot, value: `<@${botUserId}>` },
        ],
      }
    },

    async leave(ctx: CommandContext): Promise<Reply> {
      const t = messages(ctx.locale)
      const session =
        (ctx.memberVoiceChannel && sessions.byVoiceChannel(ctx.memberVoiceChannel.id)) ??
        sessions.byTextChannel(ctx.channelId)
      if (!session) return error(t.leave.notReading)
      const voiceChannelId = session.info.voiceChannelId
      await sessions.stop(session, "leave_command")
      return {
        tone: "info",
        title: t.leave.title,
        description: fmt(t.leave.description, { channel: channel(voiceChannelId) }),
      }
    },

    skip(ctx: CommandContext): Reply {
      const t = messages(ctx.locale)
      const session =
        (ctx.memberVoiceChannel && sessions.byVoiceChannel(ctx.memberVoiceChannel.id)) ??
        sessions.byTextChannel(ctx.channelId)
      if (!session) return error(t.leave.notReading)
      session.clear()
      return { tone: "info", description: t.skip.done, ephemeral: true }
    },

    async dictAdd(ctx: CommandContext, rawWord: string, rawReading: string): Promise<Reply> {
      const t = messages(ctx.locale)
      const word = rawWord.trim()
      const reading = rawReading.trim()
      if (word.length < DICTIONARY_LENGTH.word.min || word.length > DICTIONARY_LENGTH.word.max) {
        return error(fmt(t.dict.wordLength, { max: DICTIONARY_LENGTH.word.max }))
      }
      if (reading.length < DICTIONARY_LENGTH.reading.min || reading.length > DICTIONARY_LENGTH.reading.max) {
        return error(fmt(t.dict.readingLength, { max: DICTIONARY_LENGTH.reading.max }))
      }
      const guild = await editableGuild(ctx)
      if (!("id" in guild)) return guild
      const { id } = guild

      const existing = await repos.dictionary.findByWord(id, word)
      const max = state.dictionaryMaxEntries()
      if (!existing && (await repos.dictionary.count(id)) >= max) {
        return error(fmt(t.dict.full, { max }))
      }
      const user = await repos.users.findByDiscordId(ctx.userId)
      const entry = await repos.dictionary.upsertByWord(id, { word, reading }, user?.id ?? null)
      await repos.audit.record({
        actorUserId: user?.id ?? null,
        guildId: id,
        action: existing ? "dictionary.update" : "dictionary.create",
        targetType: "dictionary",
        targetId: entry.id,
        metadata: { via: "discord", discordUserId: ctx.userId },
      })
      configs.invalidate(ctx.guildId)
      return { tone: "success", title: t.dict.added, description: `**${word}** → **${reading}**` }
    },

    async dictRemove(ctx: CommandContext, rawWord: string): Promise<Reply> {
      const t = messages(ctx.locale)
      const word = rawWord.trim()
      const guild = await editableGuild(ctx)
      if (!("id" in guild)) return guild
      const { id } = guild
      const entry = await repos.dictionary.findByWord(id, word)
      if (!entry || !(await repos.dictionary.deleteByWord(id, word))) {
        return error(fmt(t.dict.notFound, { word }))
      }
      const user = await repos.users.findByDiscordId(ctx.userId)
      await repos.audit.record({
        actorUserId: user?.id ?? null,
        guildId: id,
        action: "dictionary.delete",
        targetType: "dictionary",
        targetId: entry.id,
        metadata: { via: "discord", discordUserId: ctx.userId },
      })
      configs.invalidate(ctx.guildId)
      return { tone: "success", title: t.dict.removed, description: `**${entry.word}**` }
    },

    async dictList(ctx: CommandContext): Promise<Reply> {
      const t = messages(ctx.locale)
      const id = await guildId(ctx.guildId)
      const entries = id ? await repos.dictionary.list(id) : []
      if (entries.length === 0) {
        return { tone: "info", title: t.dict.title, description: t.dict.empty }
      }
      // Embed の本文は 4096 文字まで
      const lines: string[] = []
      let length = 0
      for (const e of entries) {
        const line = `\`${e.word}\` → ${e.reading}`
        if (length + line.length > 3800) break
        lines.push(line)
        length += line.length + 1
      }
      const rest = entries.length - lines.length
      return {
        tone: "info",
        title: fmt(t.dict.listTitle, { count: entries.length }),
        description: lines.join("\n") + (rest > 0 ? `\n${fmt(t.dict.more, { count: rest, url: deps.appOrigin })}` : ""),
      }
    },

    /** /dict remove の補完 */
    async dictAutocomplete(discordGuildId: string, focused: string): Promise<{ name: string; value: string }[]> {
      const id = await guildId(discordGuildId)
      if (!id) return []
      const key = dictionaryWordKey(focused)
      return (await repos.dictionary.list(id))
        .filter((e) => dictionaryWordKey(e.word).includes(key))
        .slice(0, 25)
        .map((e) => ({ name: `${e.word} → ${e.reading}`.slice(0, 100), value: e.word.slice(0, 100) }))
    },

    async voice(ctx: CommandContext): Promise<Reply> {
      const t = messages(ctx.locale)
      const user = await repos.users.findByDiscordId(ctx.userId)
      const voice = user ? await repos.users.getVoice(user.id) : null
      const change = { name: t.voice.change, value: fmt(t.voice.changeHint, { url: `${deps.appOrigin}/settings` }) }
      if (!user || !voice) {
        return { tone: "info", title: t.voice.title, description: t.voice.unset, fields: [change], ephemeral: true }
      }
      // キャラ名は Worker が提供する一覧から引く（取得できなければ「現在利用できません」と表示する）
      const voices = await deps.listVoices(user.id).catch((err: unknown) => {
        deps.logger.warn({ err }, "failed to list voices")
        return []
      })
      return {
        tone: "info",
        title: t.voice.title,
        description: `**${voiceLabel(groupVoices(voices), voice, ctx.locale)}**`,
        fields: [
          { name: t.speaker.engine, value: voice.engine },
          { name: t.speaker.speed, value: voice.speed.toFixed(2) },
          { name: t.speaker.pitch, value: voice.pitch.toFixed(2) },
          { name: t.speaker.intonation, value: voice.intonation.toFixed(2) },
          change,
        ],
        ephemeral: true,
      }
    },
  }
}

export type Commands = ReturnType<typeof createCommands>
