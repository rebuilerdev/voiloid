/**
 * /speaker のメニュー（セレクトメニュー・ボタン・モーダル）。保存などの処理は core/speaker.ts に置く。
 */
import { VOICE_PARAM_RANGE } from "@voiloid/shared"
import type { VoiceSettings } from "@voiloid/shared/contracts"
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type InteractionEditReplyOptions,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
  type User,
} from "discord.js"

import type { Reply } from "../core/commands"
import { voiceLabel, type Speaker, type SpeakerChange, type SpeakerEngine, type SpeakerView } from "../core/speaker"
import { fmt, localeFromDiscord, messages, type Locale } from "../i18n"
import { toReplyOptions } from "./embeds"

/** セレクトメニューの選択肢の上限 */
const PAGE_SIZE = 25
/** customId は 100 文字まで（speaker:style:<エンジン>:<話者 ID>） */
const MAX_ID_LENGTH = 60
const PREFIX = "speaker"
const COLORS = { success: 0x57f287, info: 0x5865f2 } as const

const id = (...parts: (string | number)[]) => [PREFIX, ...parts].join(":")

export const isSpeakerCustomId = (customId: string) => customId.startsWith(`${PREFIX}:`)

type Rendered = Pick<InteractionEditReplyOptions, "embeds" | "components">

/** customId・選択肢の値に入らない長さの ID の声は出さない */
function selectable(engines: SpeakerEngine[]): SpeakerEngine[] {
  return engines
    .map((e) => ({
      ...e,
      speakers: e.speakers
        .filter((s) => s.id.length <= MAX_ID_LENGTH)
        .map((s) => ({ ...s, styles: s.styles.filter((st) => st.id.length <= MAX_ID_LENGTH) }))
        .filter((s) => s.styles.length > 0),
    }))
    .filter((e) => e.speakers.length > 0)
}

type VoiceKey = { engine: string; speakerId: string; styleId: string }

function find(view: SpeakerView, voice: VoiceKey) {
  const speaker = view.engines.find((e) => e.id === voice.engine)?.speakers.find((s) => s.id === voice.speakerId)
  const style = speaker?.styles.find((s) => s.id === voice.styleId)
  return { speaker, style }
}

function settingsEmbed(view: SpeakerView, locale: Locale, notice?: string) {
  const t = messages(locale)
  const { voice } = view
  const embed = new EmbedBuilder()
    .setColor(notice ? COLORS.success : COLORS.info)
    .setTitle(t.speaker.title)
    .setDescription([notice ?? t.speaker.intro, voice ? null : t.speaker.unset].filter(Boolean).join("\n"))
  if (!voice) return embed
  const { speaker, style } = find(view, voice)
  return embed.addFields(
    { name: t.speaker.engine, value: voice.engine, inline: true },
    { name: t.speaker.speaker, value: speaker?.name ?? t.speaker.unavailable, inline: true },
    { name: t.speaker.style, value: style?.name ?? "-", inline: true },
    { name: t.speaker.speed, value: voice.speed.toFixed(2), inline: true },
    { name: t.speaker.pitch, value: voice.pitch.toFixed(2), inline: true },
    { name: t.speaker.intonation, value: voice.intonation.toFixed(2), inline: true },
  )
}

/** エンジン・話者の選択画面 */
export function renderMenu(
  view: SpeakerView,
  locale: Locale,
  options: { engineId?: string; page?: number; notice?: string } = {},
): Rendered {
  const t = messages(locale)
  const engines = selectable(view.engines)
  const engine = engines.find((e) => e.id === (options.engineId ?? view.voice?.engine)) ?? engines[0]
  if (!engine) return { embeds: [settingsEmbed(view, locale, options.notice)], components: [] }

  const pageCount = Math.ceil(engine.speakers.length / PAGE_SIZE)
  const page = Math.min(Math.max(options.page ?? currentPage(view, engine), 0), pageCount - 1)
  const isCurrentEngine = view.voice?.engine === engine.id

  const rows: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[] = []
  if (engines.length > 1) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(id("engine"))
          .setPlaceholder(t.speaker.selectEngine)
          .addOptions(engines.map((e) => ({ label: e.id, value: e.id, default: e.id === engine.id }))),
      ),
    )
  }
  rows.push(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(id("select", engine.id, page))
        .setPlaceholder(
          fmt(t.speaker.selectSpeaker, { engine: engine.id }) + (pageCount > 1 ? ` (${page + 1}/${pageCount})` : ""),
        )
        .addOptions(
          engine.speakers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((s) => ({
            label: s.name.slice(0, 100),
            value: s.id,
            description: s.styles
              .map((st) => st.name)
              .join(" / ")
              .slice(0, 100),
            default: isCurrentEngine && view.voice?.speakerId === s.id,
          })),
        ),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(id("page", engine.id, page - 1))
        .setLabel(t.speaker.previous)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(id("page", engine.id, page + 1))
        .setLabel(t.speaker.next)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= pageCount - 1),
      new ButtonBuilder()
        .setCustomId(id("tune"))
        .setLabel(t.speaker.tune)
        .setEmoji("🎚️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!view.voice),
      new ButtonBuilder()
        .setCustomId(id("reset"))
        .setLabel(t.speaker.reset)
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!view.voice),
    ),
  )
  return { embeds: [settingsEmbed(view, locale, options.notice)], components: rows }
}

/** 現在の声がある話者のページ */
function currentPage(view: SpeakerView, engine: SpeakerEngine) {
  if (view.voice?.engine !== engine.id) return 0
  const index = engine.speakers.findIndex((s) => s.id === view.voice?.speakerId)
  return index < 0 ? 0 : Math.floor(index / PAGE_SIZE)
}

/** スタイルの選択画面 */
export function renderStyles(view: SpeakerView, locale: Locale, engineId: string, speakerId: string): Rendered | null {
  const t = messages(locale)
  const engine = selectable(view.engines).find((e) => e.id === engineId)
  const index = engine?.speakers.findIndex((s) => s.id === speakerId) ?? -1
  const speaker = engine?.speakers[index]
  if (!engine || !speaker) return null
  const select = new StringSelectMenuBuilder()
    .setCustomId(id("style", engine.id, speaker.id))
    .setPlaceholder(fmt(t.speaker.selectStyle, { speaker: speaker.name }).slice(0, 150))
    .addOptions(
      speaker.styles.slice(0, PAGE_SIZE).map((st) => ({
        label: st.name.slice(0, 100),
        value: st.id,
        default:
          view.voice?.engine === engine.id && view.voice.speakerId === speaker.id && view.voice.styleId === st.id,
      })),
    )
  const back = new ButtonBuilder()
    .setCustomId(id("page", engine.id, Math.floor(index / PAGE_SIZE)))
    .setLabel(t.speaker.back)
    .setStyle(ButtonStyle.Secondary)
  return {
    embeds: [settingsEmbed(view, locale).setDescription(fmt(t.speaker.chooseStyle, { speaker: speaker.name }))],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      new ActionRowBuilder<ButtonBuilder>().addComponents(back),
    ],
  }
}

export function tuneModal(voice: VoiceSettings | null, locale: Locale) {
  const t = messages(locale)
  const input = (key: keyof typeof VOICE_PARAM_RANGE) => {
    const range = VOICE_PARAM_RANGE[key]
    return new LabelBuilder()
      .setLabel(fmt(t.speaker.range, { label: t.speaker[key], min: range.min, max: range.max, default: range.default }))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId(key)
          .setStyle(TextInputStyle.Short)
          .setValue(String(voice?.[key] ?? range.default))
          .setRequired(true),
      )
  }
  return new ModalBuilder()
    .setCustomId(id("tuneModal"))
    .setTitle(t.speaker.tuneTitle)
    .addLabelComponents(input("speed"), input("pitch"), input("intonation"))
}

const profileOf = (user: User) => ({
  discordUserId: user.id,
  username: user.username,
  globalName: user.globalName,
  avatar: user.avatar,
})

const errorView = (reply: Reply): Rendered => ({ embeds: toReplyOptions(reply).embeds, components: [] })

export function createSpeakerMenu(speaker: Speaker) {
  /** 保存して、結果をメニューに反映する */
  async function save(
    interaction: MessageComponentInteraction | ModalSubmitInteraction,
    change: SpeakerChange,
    notice: (view: SpeakerView) => string,
    engineId?: string,
  ) {
    const locale = localeFromDiscord(interaction.locale)
    const result = await speaker.update(profileOf(interaction.user), change, locale)
    await interaction.editReply(
      result.ok ? renderMenu(result.view, locale, { engineId, notice: notice(result.view) }) : errorView(result.reply),
    )
  }

  return {
    /** /speaker コマンド（本人にだけ表示する） */
    async open(interaction: ChatInputCommandInteraction) {
      const locale = localeFromDiscord(interaction.locale)
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })
      const result = await speaker.load(profileOf(interaction.user), locale)
      await interaction.editReply(result.ok ? renderMenu(result.view, locale) : errorView(result.reply))
    },

    /** speaker:* のボタン・セレクトメニュー・モーダル */
    async handle(interaction: MessageComponentInteraction | ModalSubmitInteraction) {
      const [, action, engineId = "", arg = ""] = interaction.customId.split(":")
      const locale = localeFromDiscord(interaction.locale)
      const t = messages(locale)

      // モーダルは最初の応答で開く必要がある（deferUpdate の前）
      if (action === "tune" && interaction.isButton()) {
        await interaction.showModal(tuneModal(await speaker.current(interaction.user.id), locale))
        return
      }
      if (interaction.isModalSubmit() && !interaction.isFromMessage()) return
      await interaction.deferUpdate()

      if (interaction.isModalSubmit()) {
        const value = (key: string) => Number(interaction.fields.getTextInputValue(key).trim())
        const change = {
          kind: "params",
          speed: value("speed"),
          pitch: value("pitch"),
          intonation: value("intonation"),
        } as const
        await save(interaction, change, () => fmt(t.speaker.tuned, change))
        return
      }

      if (action === "reset") {
        await save(interaction, { kind: "reset" }, () => t.speaker.resetDone)
        return
      }

      const changed = (view: SpeakerView, change: VoiceKey) =>
        fmt(t.speaker.changed, { voice: voiceLabel(view.engines, change, locale) })
      const selected = interaction.isStringSelectMenu() ? interaction.values[0] : undefined
      if (action === "style" && selected) {
        const change = { kind: "voice", engine: engineId, speakerId: arg, styleId: selected } as const
        await save(interaction, change, (view) => changed(view, change), engineId)
        return
      }

      const result = await speaker.load(profileOf(interaction.user), locale)
      if (!result.ok) {
        await interaction.editReply(errorView(result.reply))
        return
      }
      const { view } = result
      if (action === "engine" && selected) {
        await interaction.editReply(renderMenu(view, locale, { engineId: selected, page: 0 }))
        return
      }
      if (action === "page") {
        await interaction.editReply(renderMenu(view, locale, { engineId, page: Number(arg) }))
        return
      }
      if (action === "select" && selected) {
        const speakerEntry = view.engines.find((e) => e.id === engineId)?.speakers.find((s) => s.id === selected)
        // スタイルが 1 つしかなければそのまま確定する
        if (speakerEntry?.styles.length === 1 && speakerEntry.styles[0]) {
          const change = {
            kind: "voice",
            engine: engineId,
            speakerId: selected,
            styleId: speakerEntry.styles[0].id,
          } as const
          await save(interaction, change, (v) => changed(v, change), engineId)
          return
        }
        await interaction.editReply(
          renderStyles(view, locale, engineId, selected) ?? renderMenu(view, locale, { engineId }),
        )
        return
      }
      await interaction.editReply(renderMenu(view, locale))
    },
  }
}

export type SpeakerMenu = ReturnType<typeof createSpeakerMenu>
