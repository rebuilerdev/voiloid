/**
 * スラッシュコマンドの処理（Discord に依存しない部分）。返り値を Discord の Embed に変換して返信する。
 */
import { dictionaryWordKey, type Repositories } from "@voiloid/database"
import { DICTIONARY_LENGTH } from "@voiloid/shared"
import type { Logger } from "pino"

import type { GuildConfigStore } from "./guild-config"
import type { ServiceState } from "./service-state"
import type { SessionManager } from "./sessions"

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
}

const error = (description: string): Reply => ({ tone: "error", description, ephemeral: true })

const channel = (id: string) => `<#${id}>`

const SUSPENDED_GUILD = "このサーバーは運営者により利用停止されています。"
const SUSPENDED_USER = "あなたのアカウントは運営者により利用停止されています。"

export function createCommands(deps: {
  sessions: SessionManager
  configs: GuildConfigStore
  state: ServiceState
  repos: Repositories
  logger: Logger
  appOrigin: string
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
    if (state.isUserSuspended(ctx.userId)) return error(SUSPENDED_USER)
    const config = await configs.get(ctx.guildId)
    if (!config) return error("このサーバーの設定を読み込めませんでした。")
    if (config.suspended) return error(SUSPENDED_GUILD)
    return { id: config.guildId }
  }

  return {
    async join(ctx: CommandContext): Promise<Reply> {
      if (state.isUserSuspended(ctx.userId)) return error(SUSPENDED_USER)
      if (state.readingPaused()) {
        return error("現在、運営者により読み上げが一時停止されています。しばらくしてから再度お試しください。")
      }
      const config = await configs.get(ctx.guildId)
      if (!config) return error("このサーバーの設定を読み込めませんでした。しばらくしてから再度お試しください。")
      if (config.suspended) return error(SUSPENDED_GUILD)

      // チャンネル固定モードは設定されたチャンネル、コマンドモードは実行者の VC と実行したチャンネル
      let target: { voice: { id: string; name: string }; text: { id: string; name: string } }
      if (config.readingMode === "fixed" && config.textChannelId && config.voiceChannelId) {
        const voiceName = deps.channelName(ctx.guildId, config.voiceChannelId)
        const textName = deps.channelName(ctx.guildId, config.textChannelId)
        if (!voiceName || !textName)
          return error("設定された読み上げチャンネルが見つかりません。Web の設定を確認してください。")
        target = {
          voice: { id: config.voiceChannelId, name: voiceName },
          text: { id: config.textChannelId, name: textName },
        }
      } else {
        if (!ctx.memberVoiceChannel) return error("先にボイスチャンネルに参加してください。")
        target = { voice: ctx.memberVoiceChannel, text: { id: ctx.channelId, name: ctx.channelName } }
      }

      const existing = sessions.byVoiceChannel(target.voice.id)
      if (existing) {
        return error(`${channel(target.voice.id)} では既に <@${existing.info.botUserId}> が読み上げ中です。`)
      }
      if (sessions.byTextChannel(target.text.id)) {
        return error(`${channel(target.text.id)} は既に別のボイスチャンネルで読み上げ中です。`)
      }

      const botUserId = deps.pickBot(ctx.guildId, target.voice.id)
      if (!botUserId) {
        return error(
          "参加できる読み上げ Bot がいません。Bot にボイスチャンネルの接続・発言権限があるか確認してください。" +
            "同じサーバーで同時に読み上げられる VC の数は、導入されている Bot の数までです。",
        )
      }

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
        return error("ボイスチャンネルへの接続に失敗しました。")
      }
      session.enqueue("接続しました", null)
      return {
        tone: "success",
        title: "読み上げを開始しました",
        description: `${channel(target.text.id)} の発言を読み上げます。`,
        fields: [
          { name: "ボイスチャンネル", value: channel(target.voice.id) },
          { name: "担当 Bot", value: `<@${botUserId}>` },
        ],
      }
    },

    async leave(ctx: CommandContext): Promise<Reply> {
      const session =
        (ctx.memberVoiceChannel && sessions.byVoiceChannel(ctx.memberVoiceChannel.id)) ??
        sessions.byTextChannel(ctx.channelId)
      if (!session) return error("読み上げ中のボイスチャンネルが見つかりません。")
      const voiceChannelId = session.info.voiceChannelId
      await sessions.stop(session, "leave_command")
      return {
        tone: "info",
        title: "読み上げを終了しました",
        description: `${channel(voiceChannelId)} から退出しました。`,
      }
    },

    skip(ctx: CommandContext): Reply {
      const session =
        (ctx.memberVoiceChannel && sessions.byVoiceChannel(ctx.memberVoiceChannel.id)) ??
        sessions.byTextChannel(ctx.channelId)
      if (!session) return error("読み上げ中のボイスチャンネルが見つかりません。")
      session.clear()
      return { tone: "info", description: "読み上げ中のメッセージをスキップしました。", ephemeral: true }
    },

    async dictAdd(ctx: CommandContext, rawWord: string, rawReading: string): Promise<Reply> {
      const word = rawWord.trim()
      const reading = rawReading.trim()
      if (word.length < DICTIONARY_LENGTH.word.min || word.length > DICTIONARY_LENGTH.word.max) {
        return error(`単語は ${DICTIONARY_LENGTH.word.max} 文字以内で入力してください。`)
      }
      if (reading.length < DICTIONARY_LENGTH.reading.min || reading.length > DICTIONARY_LENGTH.reading.max) {
        return error(`読み方は ${DICTIONARY_LENGTH.reading.max} 文字以内で入力してください。`)
      }
      const guild = await editableGuild(ctx)
      if (!("id" in guild)) return guild
      const { id } = guild

      const existing = await repos.dictionary.findByWord(id, word)
      const max = state.dictionaryMaxEntries()
      if (!existing && (await repos.dictionary.count(id)) >= max) {
        return error(`辞書に登録できるのは ${max} 件までです。`)
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
      return { tone: "success", title: "辞書に登録しました", description: `**${word}** → **${reading}**` }
    },

    async dictRemove(ctx: CommandContext, rawWord: string): Promise<Reply> {
      const word = rawWord.trim()
      const guild = await editableGuild(ctx)
      if (!("id" in guild)) return guild
      const { id } = guild
      const entry = await repos.dictionary.findByWord(id, word)
      if (!entry || !(await repos.dictionary.deleteByWord(id, word))) {
        return error(`**${word}** は辞書に登録されていません。`)
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
      return { tone: "success", title: "辞書から削除しました", description: `**${entry.word}**` }
    },

    async dictList(ctx: CommandContext): Promise<Reply> {
      const id = await guildId(ctx.guildId)
      const entries = id ? await repos.dictionary.list(id) : []
      if (entries.length === 0) {
        return {
          tone: "info",
          title: "辞書",
          description: "まだ単語が登録されていません。`/dict add` で登録できます。",
        }
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
        title: `辞書（${entries.length} 件）`,
        description: lines.join("\n") + (rest > 0 ? `\n…ほか ${rest} 件（Web で確認できます: ${deps.appOrigin}）` : ""),
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
      const user = await repos.users.findByDiscordId(ctx.userId)
      const voice = user ? await repos.users.getVoice(user.id) : null
      return {
        tone: "info",
        title: "あなたの読み上げ音声",
        description: voice
          ? `${voice.engine}（話者 ID: ${voice.speakerId} / スタイル: ${voice.styleId}、話速 ${voice.speed}）`
          : "未設定です。各サーバーのデフォルト音声で読み上げます。",
        fields: [{ name: "変更", value: `${deps.appOrigin}/settings でマイボイスを設定できます。` }],
        ephemeral: true,
      }
    },
  }
}

export type Commands = ReturnType<typeof createCommands>
