/**
 * /speaker（マイボイスの変更）の Discord に依存しない部分。
 * Web の設定画面と同じく、全サーバー共通のマイボイスを保存する。
 */
import type { DiscordUserProfile, Repositories } from "@voiloid/database"
import { ENGINE_IDS, VOICE_PARAM_RANGE, isEngineId, type EngineId } from "@voiloid/shared"
import { voiceSettingsSchema, type VoiceSettings } from "@voiloid/shared/contracts"
import type { Logger } from "pino"

import { fmt, messages, type Locale } from "../i18n"
import type { Reply } from "./commands"
import type { ServiceState } from "./service-state"
import type { VoiceCatalog } from "./voice-catalog"

export interface SpeakerStyle {
  id: string
  name: string
}

export interface SpeakerEntry {
  id: string
  name: string
  styles: SpeakerStyle[]
}

export interface SpeakerEngine {
  id: EngineId
  speakers: SpeakerEntry[]
}

export interface SpeakerView {
  /** 現在のマイボイス（未設定なら null） */
  voice: VoiceSettings | null
  /** 選べる声（エンジン → 話者 → スタイル） */
  engines: SpeakerEngine[]
}

export type SpeakerResult = { ok: true; view: SpeakerView } | { ok: false; reply: Reply }

/** 声の選択を変える（engine / speakerId / styleId はそろえて指定する）か、話速などの調整値を変える */
export type SpeakerChange =
  | { kind: "voice"; engine: string; speakerId: string; styleId: string }
  | { kind: "params"; speed: number; pitch: number; intonation: number }
  | { kind: "reset" }

const fail = (description: string): SpeakerResult => ({
  ok: false,
  reply: { tone: "error", description, ephemeral: true },
})

const DEFAULT_PARAMS = {
  speed: VOICE_PARAM_RANGE.speed.default,
  pitch: VOICE_PARAM_RANGE.pitch.default,
  intonation: VOICE_PARAM_RANGE.intonation.default,
}

/** Gateway の一覧（Speaker × Style 単位）を、エンジン → 話者 → スタイルにまとめる */
export function groupVoices(
  voices: { engine: string; speakerId: string; speakerName: string; styleId: string; styleName: string }[],
): SpeakerEngine[] {
  const engines = new Map<EngineId, Map<string, SpeakerEntry>>()
  for (const v of voices) {
    if (!isEngineId(v.engine)) continue
    const speakers = engines.get(v.engine) ?? new Map<string, SpeakerEntry>()
    engines.set(v.engine, speakers)
    const speaker = speakers.get(v.speakerId) ?? { id: v.speakerId, name: v.speakerName, styles: [] }
    speakers.set(v.speakerId, speaker)
    speaker.styles.push({ id: v.styleId, name: v.styleName })
  }
  return ENGINE_IDS.flatMap((id) => {
    const speakers = engines.get(id)
    return speakers ? [{ id, speakers: [...speakers.values()] }] : []
  })
}

/**
 * 声の表示名（「キャラ名（スタイル名）」）。話者 ID は利用者に見せない。
 * 一覧に無い声（Worker がオフラインなど）はエンジン名だけを出す。
 */
export function voiceLabel(
  engines: SpeakerEngine[],
  voice: { engine: string; speakerId: string; styleId: string },
  locale: Locale,
): string {
  const t = messages(locale)
  const speaker = engines.find((e) => e.id === voice.engine)?.speakers.find((s) => s.id === voice.speakerId)
  if (!speaker) return fmt(t.speaker.unavailableVoice, { engine: voice.engine })
  const style = speaker.styles.find((s) => s.id === voice.styleId)
  return style ? fmt(t.speaker.voiceLabel, { speaker: speaker.name, style: style.name }) : speaker.name
}

export function createSpeaker(deps: {
  repos: Repositories
  state: ServiceState
  listVoices: VoiceCatalog
  /** マイボイスの変更を Gateway に知らせる（Discord のユーザー ID） */
  notifyUser: (discordUserId: string) => Promise<void>
  logger: Logger
}) {
  const { repos, state } = deps

  /** 利用者を DB に用意して、現在のマイボイスと選べる声を返す */
  async function load(profile: DiscordUserProfile, locale: Locale): Promise<SpeakerResult & { userId?: string }> {
    const t = messages(locale)
    if (state.isUserSuspended(profile.discordUserId)) return fail(t.errors.suspendedUser)
    // Web にログインしたことがない人でも使えるように、Discord のプロフィールで作成する
    const user = await repos.users.upsertFromDiscord(profile)
    let engines: SpeakerEngine[]
    try {
      engines = groupVoices(await deps.listVoices(user.id))
    } catch (err) {
      deps.logger.warn({ err }, "failed to list voices")
      return fail(t.speaker.listFailed)
    }
    if (engines.length === 0) return fail(t.speaker.noEngine)
    return { ok: true, view: { voice: await repos.users.getVoice(user.id), engines }, userId: user.id }
  }

  return {
    load: (profile: DiscordUserProfile, locale: Locale): Promise<SpeakerResult> => load(profile, locale),

    /** 現在のマイボイス（速度などの入力欄の初期値用） */
    async current(discordUserId: string): Promise<VoiceSettings | null> {
      const user = await repos.users.findByDiscordId(discordUserId)
      return user ? repos.users.getVoice(user.id) : null
    },

    async update(profile: DiscordUserProfile, change: SpeakerChange, locale: Locale): Promise<SpeakerResult> {
      const t = messages(locale)
      const loaded = await load(profile, locale)
      if (!loaded.ok || !loaded.userId) return loaded
      const { view, userId } = loaded

      let next: VoiceSettings | null
      if (change.kind === "reset") {
        next = null
      } else if (change.kind === "voice") {
        const found = view.engines
          .find((e) => e.id === change.engine)
          ?.speakers.find((s) => s.id === change.speakerId)
          ?.styles.some((s) => s.id === change.styleId)
        if (!found) return fail(t.speaker.voiceGone)
        const parsed = voiceSettingsSchema.safeParse({
          engine: change.engine,
          speakerId: change.speakerId,
          styleId: change.styleId,
          ...(view.voice
            ? { speed: view.voice.speed, pitch: view.voice.pitch, intonation: view.voice.intonation }
            : DEFAULT_PARAMS),
        })
        if (!parsed.success) return fail(t.speaker.voiceGone)
        next = parsed.data
      } else {
        if (!view.voice) return fail(t.speaker.chooseFirst)
        const out = (Object.keys(VOICE_PARAM_RANGE) as (keyof typeof VOICE_PARAM_RANGE)[]).filter((key) => {
          const value = change[key]
          return !Number.isFinite(value) || value < VOICE_PARAM_RANGE[key].min || value > VOICE_PARAM_RANGE[key].max
        })
        if (out.length > 0) {
          const { speed, pitch, intonation } = VOICE_PARAM_RANGE
          return fail(
            fmt(t.speaker.outOfRange, {
              speedMin: speed.min,
              speedMax: speed.max,
              pitchMin: pitch.min,
              pitchMax: pitch.max,
              intonationMin: intonation.min,
              intonationMax: intonation.max,
            }),
          )
        }
        next = { ...view.voice, speed: change.speed, pitch: change.pitch, intonation: change.intonation }
      }

      await repos.users.setVoice(userId, next)
      await deps.notifyUser(profile.discordUserId)
      return { ok: true, view: { ...view, voice: next } }
    },
  }
}

export type Speaker = ReturnType<typeof createSpeaker>
