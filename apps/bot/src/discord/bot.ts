/**
 * discord.js のクライアントとイベント処理。ロジックは core/ に置き、ここでは Discord との変換だけを行う。
 */
import {
  Client,
  Events,
  GatewayIntentBits,
  type Guild,
  PermissionFlagsBits,
  type Interaction,
  type VoiceBasedChannel,
} from "discord.js"
import type { Logger } from "pino"

import type { createBotSync } from "../core/bot-sync"
import type { CommandContext, Commands, Reply } from "../core/commands"
import type { createGuildSync } from "../core/guild-sync"
import type { Reader } from "../core/reader"
import type { SessionManager } from "../core/sessions"
import { toReplyOptions } from "./embeds"
import type { ProfileSync } from "./profile"

export function createClients(mainToken: string, subTokens: string[]) {
  const main = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      // 特権インテント: Developer Portal で有効化が必要
      GatewayIntentBits.MessageContent,
    ],
  })
  // サブボットは VC で音声を流すだけ（コマンド・メッセージは扱わない）
  const subs = subTokens.map(
    () => new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] }),
  )
  return {
    main,
    subs,
    async login() {
      await main.login(mainToken)
      await Promise.all(subs.map((client, i) => client.login(subTokens[i])))
    },
  }
}

/** Bot の情報と参加しているサーバー（起動時の同期用） */
export const botIdentity = (client: Client<true>) => ({
  id: client.user.id,
  name: client.user.username,
  avatar: client.user.avatar,
  guildIds: [...client.guilds.cache.keys()],
})

export const guildInfo = (guild: Guild) => ({
  discordGuildId: guild.id,
  name: guild.name,
  icon: guild.icon,
  ownerDiscordUserId: guild.ownerId,
  memberCount: guild.memberCount,
})

const humans = (channel: VoiceBasedChannel) => channel.members.filter((m) => !m.user.bot).size

export function createBotPool(clients: Client[]) {
  return {
    /** VC に参加できる空いている Bot（メインボットを優先） */
    pick(guildId: string, voiceChannelId: string, sessions: SessionManager): string | null {
      for (const client of clients) {
        if (!client.isReady()) continue
        if (sessions.get(guildId, client.user.id)) continue
        const channel = client.guilds.cache.get(guildId)?.channels.cache.get(voiceChannelId)
        if (!channel?.isVoiceBased() || !channel.joinable) continue
        if (channel.permissionsFor(client.user)?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
          return client.user.id
        }
      }
      return null
    },
  }
}

export function registerEvents(deps: {
  main: Client
  allClients: Client[]
  commands: Commands
  reader: Reader
  sessions: SessionManager
  guildSync: ReturnType<typeof createGuildSync>
  botSync: ReturnType<typeof createBotSync>
  profileSync: ProfileSync
  logger: Logger
}) {
  const { main, commands, reader, sessions, logger } = deps

  main.on(Events.GuildCreate, (guild) => void deps.guildSync.joined(guildInfo(guild)).catch(() => undefined))
  main.on(Events.GuildUpdate, (_old, guild) => void deps.guildSync.updated(guildInfo(guild)).catch(() => undefined))
  main.on(Events.GuildDelete, (guild) => {
    void deps.guildSync.left(guild.id).catch(() => undefined)
    for (const session of sessions.inGuild(guild.id)) void sessions.stop(session, "guild_removed")
  })

  // 各 Bot（サブボットを含む）のサーバーへの参加・退出を記録する
  for (const client of deps.allClients) {
    client.on(Events.GuildCreate, (guild) => {
      if (!client.user) return
      void deps.botSync.joined(client.user.id, guild.id).catch(() => undefined)
      // 後から招待したサブボットにも、サーバーのプロフィールを反映する
      if (client !== main) {
        void deps.profileSync
          .apply(guild.id, client.user.id)
          .catch((error: unknown) => logger.warn({ err: error, guild: guild.id }, "failed to sync the bot profile"))
      }
    })
    client.on(Events.GuildDelete, (guild) => {
      if (client.user) void deps.botSync.left(client.user.id, guild.id).catch(() => undefined)
    })
  }

  main.on(Events.MessageCreate, (message) => {
    if (!message.inGuild() || message.system) return
    void reader
      .onMessage({
        guildId: message.guildId,
        channelId: message.channelId,
        authorId: message.author.id,
        authorIsBot: message.author.bot,
        content: message.cleanContent,
        attachments: message.attachments.size,
      })
      .catch((error: unknown) => logger.warn({ err: error }, "failed to read a message"))
  })

  main.on(Events.VoiceStateUpdate, (oldState, newState) => {
    // 読み上げ Bot 自身が別の VC に移動された
    const botIds = new Set(deps.allClients.flatMap((c) => (c.user ? [c.user.id] : [])))
    if (botIds.has(newState.id) && newState.channel && oldState.channelId !== newState.channelId) {
      const session = sessions.get(newState.guild.id, newState.id)
      if (session) void sessions.moved(session, newState.channel.id, newState.channel.name)
    }
    for (const channel of new Set([oldState.channel, newState.channel])) {
      if (!channel) continue
      void reader
        .onVoiceChannelChanged(channel.guild.id, { id: channel.id, name: channel.name, humans: humans(channel) })
        .catch((error: unknown) => logger.warn({ err: error }, "failed to handle a voice state update"))
    }
  })

  main.on(Events.InteractionCreate, (interaction) => void handleInteraction(interaction))

  function context(interaction: Interaction): CommandContext | null {
    if (!interaction.inCachedGuild()) return null
    const member = interaction.member
    const voice = member.voice.channel
    const channel = interaction.channel
    return {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      channelId: interaction.channelId ?? "",
      channelName: channel && "name" in channel ? channel.name : "",
      memberVoiceChannel: voice ? { id: voice.id, name: voice.name } : null,
    }
  }

  async function handleInteraction(interaction: Interaction) {
    try {
      if (interaction.isAutocomplete() && interaction.commandName === "dict" && interaction.guildId) {
        await interaction.respond(
          await commands.dictAutocomplete(interaction.guildId, interaction.options.getFocused()),
        )
        return
      }
      if (!interaction.isChatInputCommand()) return
      const ctx = context(interaction)
      if (!ctx) return

      let reply: Reply
      switch (interaction.commandName) {
        case "join":
          await interaction.deferReply()
          reply = await commands.join(ctx)
          await interaction.editReply({ embeds: toReplyOptions(reply).embeds })
          return
        case "leave":
          reply = await commands.leave(ctx)
          break
        case "skip":
          reply = commands.skip(ctx)
          break
        case "voice":
          reply = await commands.voice(ctx)
          break
        case "dict": {
          const sub = interaction.options.getSubcommand()
          reply =
            sub === "add"
              ? await commands.dictAdd(
                  ctx,
                  interaction.options.getString("word", true),
                  interaction.options.getString("reading", true),
                )
              : sub === "remove"
                ? await commands.dictRemove(ctx, interaction.options.getString("word", true))
                : await commands.dictList(ctx)
          break
        }
        default:
          return
      }
      await interaction.reply(toReplyOptions(reply))
    } catch (error) {
      logger.error({ err: error }, "interaction failed")
      if (interaction.isRepliable()) {
        const reply = toReplyOptions({ tone: "error", description: "処理中にエラーが発生しました。", ephemeral: true })
        await (
          interaction.deferred || interaction.replied ? interaction.followUp(reply) : interaction.reply(reply)
        ).catch(() => undefined)
      }
    }
  }
}

export function channelName(client: Client, guildId: string, channelId: string): string | null {
  return client.guilds.cache.get(guildId)?.channels.cache.get(channelId)?.name ?? null
}
