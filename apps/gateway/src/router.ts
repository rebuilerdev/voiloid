/**
 * 合成依頼の振り分け。
 * 1. 声を決める（投稿者のマイボイス → サーバーのデフォルト音声。@voiloid/shared の純粋関数）
 * 2. 候補の Worker（接続中・話者を持つ）を優先グループ順・負荷の低い順に試す。失敗したら次の Worker へ
 * 3. 利用記録（UsageEvent）を残す
 */
import { guildVoice, routingSettings, routingWorker, WorkerType, type Repositories } from "@voiloid/database"
import { AppError, DEFAULT_GUILD_VOICE, forbidden, notFound, resolveVoice, type RoutingWorker } from "@voiloid/shared"
import type { Voice, VoiceSettings } from "@voiloid/shared/contracts"
import type { Logger } from "pino"

import { noWorker, WorkerRegistry, type ConnectedWorker, type JobResult } from "./registry"
import { TtlCache } from "./ttl-cache"
import { wavDurationMs } from "./wav"

/** 設定の変更は Pub/Sub で即時に破棄されるため、TTL は保険 */
const CACHE_TTL_MS = 30_000

export interface SynthesisResult {
  audio: Buffer
  workerId: string
  engine: string
  voiceSource: "user" | "guild"
}

interface GuildContext {
  guildId: string
  /** 運営者による利用停止中（合成しない） */
  suspended: boolean
  settings: ReturnType<typeof routingSettings>
  guildVoice: VoiceSettings
  /** DB 上の候補（接続状態は問わない） */
  candidates: RoutingWorker[]
}

interface UserContext {
  id: string | null
  voice: VoiceSettings | null
}

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" })
const countCharacters = (text: string) => Array.from(graphemes.segment(text)).length

export function createRouter(deps: { repos: Repositories; registry: WorkerRegistry; logger: Logger }) {
  const { repos, registry, logger } = deps
  const guildCache = new TtlCache<GuildContext | null>(CACHE_TTL_MS)
  const userCache = new TtlCache<UserContext>(CACHE_TTL_MS)

  async function guildContext(discordGuildId: string): Promise<GuildContext | null> {
    return guildCache.getOrLoad(discordGuildId, async () => {
      const guild = await repos.guilds.findByDiscordId(discordGuildId)
      if (!guild?.botInstalled) return null
      const settings = await repos.guildSettings.getOrCreate(guild.id)
      const candidates = await repos.workers.listRoutingCandidates([guild.id])
      return {
        guildId: guild.id,
        suspended: guild.suspendedAt !== null,
        settings: routingSettings(settings),
        guildVoice: guildVoice(settings) ?? { ...DEFAULT_GUILD_VOICE },
        candidates: candidates.map(routingWorker),
      }
    })
  }

  async function userContext(discordUserId: string, guildId: string): Promise<UserContext> {
    return userCache.getOrLoad(`${discordUserId}:${guildId}`, async () => {
      const user = await repos.users.findByDiscordId(discordUserId)
      if (!user) return { id: null, voice: null }
      return { id: user.id, voice: await repos.users.getVoiceForGuild(discordUserId, guildId) }
    })
  }

  /** 接続中の Worker のうち、その声を合成できるもの */
  function connected(tiers: RoutingWorker[][], voice: VoiceSettings): ConnectedWorker[][] {
    return tiers
      .map((tier) =>
        tier.flatMap((w) => {
          const worker = registry.get(w.id)
          return worker && WorkerRegistry.supports(worker, voice) ? [worker] : []
        }),
      )
      .filter((tier) => tier.length > 0)
  }

  /** グループの順に、グループ内は空いている Worker から試す */
  async function run(tiers: ConnectedWorker[][], voice: VoiceSettings, text: string) {
    for (const tier of tiers) {
      const ordered = [...tier].sort(
        (a, b) => a.failures - b.failures || WorkerRegistry.load(a) - WorkerRegistry.load(b),
      )
      for (const worker of ordered) {
        try {
          const result = await registry.dispatch(worker, {
            engine: voice.engine,
            speakerId: voice.speakerId,
            styleId: voice.styleId,
            text,
            speed: voice.speed,
            pitch: voice.pitch,
            intonation: voice.intonation,
          })
          worker.failures = 0
          return { worker, result }
        } catch (error) {
          worker.failures++
          logger.warn({ worker: worker.publicId, err: error }, "synthesis failed, trying the next worker")
        }
      }
    }
    // 個々の Worker のエラー内容は返さない（ログに残す）
    throw new AppError("SERVICE_UNAVAILABLE", "Synthesis failed on all available workers.")
  }

  function record(
    context: GuildContext,
    discordUserId: string | null,
    voice: VoiceSettings,
    text: string,
    outcome: { worker: ConnectedWorker; result: JobResult } | null,
  ) {
    const worker = outcome?.worker
    repos.usage
      .record({
        userId: discordUserId,
        guildId: context.guildId,
        workerId: worker?.id ?? null,
        workerType: worker ? (worker.type === "official" ? WorkerType.OFFICIAL : WorkerType.PRIVATE) : null,
        engineId: voice.engine,
        characters: countCharacters(text),
        audioDurationMs: outcome ? (outcome.result.durationMs ?? wavDurationMs(outcome.result.audio)) : null,
        success: outcome !== null,
      })
      .catch((error: unknown) => logger.error({ err: error }, "failed to record usage"))
  }

  return {
    /** Bot からの合成依頼 */
    async synthesize(input: { guildId: string; userId: string | null; text: string }): Promise<SynthesisResult> {
      const context = await guildContext(input.guildId)
      if (!context) throw notFound("Guild")
      if (context.suspended) throw forbidden("This server has been suspended by the service operator.")
      const user = input.userId ? await userContext(input.userId, context.guildId) : { id: null, voice: null }

      // 接続中の Worker だけを、Worker が申告した正常なエンジンで判定する
      const workers = context.candidates.flatMap((w) => {
        const live = registry.get(w.id)
        return live ? [{ ...w, engines: WorkerRegistry.healthyEngines(live) }] : []
      })
      const resolveFor = (userVoice: VoiceSettings | null) =>
        resolveVoice({
          userVoice,
          guildVoice: context.guildVoice,
          settings: context.settings,
          workers,
          userId: user.id,
        })

      // エンジン単位で決めた声を、話者を持つ Worker に絞る。マイボイスを合成できなければデフォルト音声にする
      let resolved = resolveFor(user.voice)
      let tiers = resolved ? connected(resolved.tiers, resolved.voice) : []
      if (resolved?.source === "user" && tiers.length === 0) {
        resolved = resolveFor(null)
        tiers = resolved ? connected(resolved.tiers, resolved.voice) : []
      }
      if (!resolved || tiers.length === 0) {
        record(context, input.userId, user.voice ?? context.guildVoice, input.text, null)
        throw noWorker()
      }

      try {
        const outcome = await run(tiers, resolved.voice, input.text)
        record(context, input.userId, resolved.voice, input.text, outcome)
        return {
          audio: outcome.result.audio,
          workerId: outcome.worker.publicId,
          engine: resolved.voice.engine,
          voiceSource: resolved.source,
        }
      } catch (error) {
        record(context, input.userId, resolved.voice, input.text, null)
        throw error
      }
    },

    /** Control API からのプレビュー。公式Worker と本人の自鯖Worker で合成する */
    async preview(input: { userId: string; voice: VoiceSettings; text: string }): Promise<Buffer> {
      const usable = registry
        .list()
        .filter(
          (w) => (w.type === "official" || w.ownerUserId === input.userId) && WorkerRegistry.supports(w, input.voice),
        )
      // 自分の Worker を優先する
      const tiers = [usable.filter((w) => w.type === "private"), usable.filter((w) => w.type === "official")].filter(
        (t) => t.length > 0,
      )
      if (tiers.length === 0) throw noWorker()
      return (await run(tiers, input.voice, input.text)).result.audio
    },

    /** 声の一覧（公式Worker + 本人の自鯖Worker） */
    voices(userId: string): Voice[] {
      const voices = new Map<string, Voice>()
      for (const worker of registry.list()) {
        if (worker.type !== "official" && worker.ownerUserId !== userId) continue
        for (const engine of worker.engines.values()) {
          if (!engine.healthy || worker.disabledEngines?.has(engine.engine)) continue
          for (const speaker of engine.speakers) {
            for (const style of speaker.styles) {
              voices.set(`${engine.engine}:${speaker.id}:${style.id}`, {
                engine: engine.engine,
                speakerId: speaker.id,
                speakerName: speaker.name,
                styleId: style.id,
                styleName: style.name,
              })
            }
          }
        }
      }
      return [...voices.values()]
    },

    /** 設定変更の通知を受けてキャッシュを破棄する */
    invalidateGuild(discordGuildId: string) {
      guildCache.delete(discordGuildId)
    },
    invalidateUser(discordUserId: string) {
      userCache.deleteWhere((key) => key.startsWith(`${discordUserId}:`))
    },
    invalidateAll() {
      guildCache.clear()
      userCache.clear()
    },
  }
}

export type Router = ReturnType<typeof createRouter>
