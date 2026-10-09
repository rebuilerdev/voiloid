/**
 * 読み上げに使う Worker と声の決定（純粋関数）。
 *
 * - Control API: 設定上使えるエンジンの表示（全 Worker を渡す）
 * - Worker Gateway: 実際の振り分け（接続中の Worker だけを渡す）
 *
 * 声の決まり方:
 *   1. 投稿者のマイボイス（そのエンジンを投稿者が使え、サーバーでオフにされていない場合のみ）
 *   2. サーバーのデフォルト音声
 * 投稿者が使える Worker = 投稿者が自分専用で接続した Worker + サーバーで使える Worker（Worker モードに従う）
 */
import type { VoiceSettings, WorkerMode } from "../contracts"

export type WorkerScope = "server" | "personal"

export interface RoutingWorker {
  id: string
  type: "official" | "private"
  ownerUserId: string | null
  /** 対象サーバーでの接続。null = 接続されていない */
  scope: WorkerScope | null
  engines: readonly string[]
  /** 公式Worker のみ: true = 接続先に指定したサーバー（scope が null でない）だけを担当する */
  restricted?: boolean
}

export interface RoutingSettings {
  workerMode: WorkerMode
  specificWorkerId: string | null
  fallbackToOfficial: boolean
  /** サーバーでオフにしたエンジン（声の選択肢・読み上げに使わない） */
  disabledEngines?: readonly string[]
}

/** 優先順の Worker グループ。前のグループから順に試し、グループ内は負荷の低いものを選ぶ */
export type WorkerTiers<W extends RoutingWorker = RoutingWorker> = W[][]

const nonEmpty = <W>(tiers: W[][]) => tiers.filter((tier) => tier.length > 0)

/** サーバーの全員が使える Worker（Worker モードに従う） */
export function serverWorkerTiers<W extends RoutingWorker>(
  settings: RoutingSettings,
  workers: readonly W[],
): WorkerTiers<W> {
  // 担当するサーバーを指定した公式Worker は、指定されたサーバーでだけ使う
  const official = workers.filter((w) => w.type === "official" && (!w.restricted || w.scope !== null))
  const shared = workers.filter((w) => w.type === "private" && w.scope === "server")

  switch (settings.workerMode) {
    case "auto":
      return nonEmpty([[...shared, ...official]])
    case "official":
      return nonEmpty([official])
    case "private_preferred":
      return nonEmpty(settings.fallbackToOfficial ? [shared, official] : [shared])
    case "specific": {
      // 指定できるのはサーバーに共有された自鯖Worker のみ
      const worker = shared.find((w) => w.id === settings.specificWorkerId)
      return worker ? [[worker]] : []
    }
  }
}

/** 投稿者本人が自分専用で接続した Worker */
export function personalWorkers<W extends RoutingWorker>(workers: readonly W[], userId: string): W[] {
  return workers.filter((w) => w.type === "private" && w.scope === "personal" && w.ownerUserId === userId)
}

/** 投稿者（userId）が使える Worker。自分専用の Worker を最優先にする */
export function workerTiersFor<W extends RoutingWorker>(
  settings: RoutingSettings,
  workers: readonly W[],
  userId: string | null,
): WorkerTiers<W> {
  const server = serverWorkerTiers(settings, workers)
  return userId === null ? server : nonEmpty([personalWorkers(workers, userId), ...server])
}

/** Worker 群が提供するエンジン（重複なし・昇順）。disabled（サーバーでオフにしたエンジン）は除く */
export function availableEngines(tiers: WorkerTiers, disabled: readonly string[] = []): string[] {
  return [...new Set(tiers.flat().flatMap((w) => w.engines))].filter((e) => !disabled.includes(e)).sort()
}

/** 指定エンジンを持つ Worker だけに絞る */
export function tiersForEngine<W extends RoutingWorker>(tiers: WorkerTiers<W>, engine: string): WorkerTiers<W> {
  return nonEmpty(tiers.map((tier) => tier.filter((w) => w.engines.includes(engine))))
}

export interface ResolvedVoice<W extends RoutingWorker> {
  voice: VoiceSettings
  source: "user" | "guild"
  tiers: WorkerTiers<W>
}

/**
 * 読み上げる声と、それを合成できる Worker を決める。
 * どちらの声も合成できる Worker が無ければ null。
 */
export function resolveVoice<W extends RoutingWorker>(input: {
  userVoice: VoiceSettings | null
  guildVoice: VoiceSettings
  settings: RoutingSettings
  workers: readonly W[]
  userId: string | null
}): ResolvedVoice<W> | null {
  const tiers = workerTiersFor(input.settings, input.workers, input.userId)
  const disabled = input.settings.disabledEngines ?? []

  if (input.userVoice && !disabled.includes(input.userVoice.engine)) {
    const forUser = tiersForEngine(tiers, input.userVoice.engine)
    if (forUser.length > 0) return { voice: input.userVoice, source: "user", tiers: forUser }
  }

  // デフォルト音声のエンジンはオフにできない（API で検証）が、念のため合成しない
  if (disabled.includes(input.guildVoice.engine)) return null
  const forGuild = tiersForEngine(tiers, input.guildVoice.engine)
  return forGuild.length > 0 ? { voice: input.guildVoice, source: "guild", tiers: forGuild } : null
}
