/**
 * 接続中の Worker と、合成ジョブの送受信。
 */
import { randomUUID } from "node:crypto"

import { AppError } from "@voiloid/shared"
import type { VoiceSettings } from "@voiloid/shared/contracts"
import { redisKeys, type EngineReport, type SynthesizeJob, type WorkerLive } from "@voiloid/shared/protocol"
import type { Redis } from "ioredis"
import type { WebSocket } from "ws"

/** Redis のリアルタイム状態の有効期間（ハートビートで延長する） */
export const LIVE_TTL_SECONDS = 45

export interface PendingJob {
  resolve: (result: JobResult) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

/** 同時処理の上限に達した Worker の、順番待ちの依頼（Gateway で待たせる） */
export interface WaitingJob {
  job: Omit<SynthesizeJob, "type" | "jobId">
  resolve: (result: JobResult) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

export interface JobResult {
  audio: Buffer
  durationMs: number | undefined
}

export interface ConnectedWorker {
  /** Worker の内部 ID */
  id: string
  publicId: string
  name: string
  type: "official" | "private"
  ownerUserId: string | null
  socket: WebSocket
  engines: Map<string, EngineReport>
  /** 実際に使う同時処理の数 = min(Worker の申告, Web で設定した上限) */
  maxConcurrency: number
  /** Worker が申告した同時処理の数（Worker の MAX_CONCURRENCY） */
  reportedConcurrency?: number
  /** Web で設定した同時処理の上限（null / undefined = 上限なし） */
  concurrencyLimit?: number | null
  /** 上限に達したときの順番待ち */
  waiting?: WaitingJob[]
  version: string
  pending: Map<string, PendingJob>
  /** 連続して失敗した回数（振り分けの優先度を下げる） */
  failures: number
  latencyMs: number | undefined
  lastSeenAt: Date
  /** 運営者が止めたエンジン（Worker が動かしていても使わない。接続時と設定の変更時に DB から読む） */
  disabledEngines?: ReadonlySet<string>
  /** 接続に使ったトークンのハッシュ（再発行されたら切断するため） */
  secretHash?: string
}

export class WorkerJobError extends Error {
  constructor(
    message: string,
    readonly workerId: string,
  ) {
    super(message)
    this.name = "WorkerJobError"
  }
}

export class WorkerRegistry {
  private readonly workers = new Map<string, ConnectedWorker>()

  constructor(
    private readonly redis: Redis,
    private readonly jobTimeoutMs: number,
  ) {}

  /** 登録する。同じ Worker の古い接続があれば返す（呼び出し側が切断する） */
  add(worker: ConnectedWorker): ConnectedWorker | undefined {
    const previous = this.workers.get(worker.id)
    this.workers.set(worker.id, worker)
    return previous
  }

  /** 登録を解除する。新しい接続に置き換わっていれば何もしない */
  remove(worker: ConnectedWorker): boolean {
    if (this.workers.get(worker.id) !== worker) return false
    this.workers.delete(worker.id)
    return true
  }

  get(id: string): ConnectedWorker | undefined {
    return this.workers.get(id)
  }

  findByPublicId(publicId: string): ConnectedWorker | undefined {
    return [...this.workers.values()].find((w) => w.publicId === publicId)
  }

  list(): ConnectedWorker[] {
    return [...this.workers.values()]
  }

  /** 声を合成できるか（エンジンが正常で、話者・スタイルを持っている） */
  static supports(worker: ConnectedWorker, voice: Pick<VoiceSettings, "engine" | "speakerId" | "styleId">): boolean {
    const engine = worker.engines.get(voice.engine)
    return (
      engine?.healthy === true &&
      !worker.disabledEngines?.has(voice.engine) &&
      engine.speakers.some((s) => s.id === voice.speakerId && s.styles.some((st) => st.id === voice.styleId))
    )
  }

  /** 使えるエンジン（正常で、運営者が止めていないもの） */
  static healthyEngines(worker: ConnectedWorker): string[] {
    return [...worker.engines.values()]
      .filter((e) => e.healthy && !worker.disabledEngines?.has(e.engine))
      .map((e) => e.engine)
  }

  /** 実際に使う同時処理の数 = min(Worker の申告, Web で設定した上限) */
  static effectiveConcurrency(reported: number, limit: number | null | undefined): number {
    return limit ? Math.min(reported, limit) : reported
  }

  /** 上限を変えたとき: 実際に使う数を更新し、空いた分だけ順番待ちを送る */
  setConcurrencyLimit(worker: ConnectedWorker, limit: number | null): void {
    worker.concurrencyLimit = limit
    worker.maxConcurrency = WorkerRegistry.effectiveConcurrency(
      worker.reportedConcurrency ?? worker.maxConcurrency,
      limit,
    )
    this.next(worker)
    void this.publishLive(worker)
  }

  /** 負荷（送ったジョブ + 順番待ち）/ 同時実行数。小さいほど空いている */
  static load(worker: ConnectedWorker): number {
    return (worker.pending.size + (worker.waiting?.length ?? 0)) / worker.maxConcurrency
  }

  /**
   * 合成を依頼する。同時処理の上限に達していれば、空くまで Gateway で待たせる
   * （待ちがジョブのタイムアウトを超えたら失敗にし、呼び出し側が次の Worker を試す）。
   */
  dispatch(worker: ConnectedWorker, job: Omit<SynthesizeJob, "type" | "jobId">): Promise<JobResult> {
    return new Promise<JobResult>((resolve, reject) => {
      if (worker.pending.size < worker.maxConcurrency && !worker.waiting?.length) {
        this.send(worker, job, resolve, reject)
        return
      }
      const waiting = (worker.waiting ??= [])
      const entry: WaitingJob = {
        job,
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = waiting.indexOf(entry)
          if (index >= 0) waiting.splice(index, 1)
          void this.publishLive(worker)
          reject(new WorkerJobError(`worker ${worker.publicId} is busy`, worker.id))
        }, this.jobTimeoutMs),
      }
      waiting.push(entry)
      void this.publishLive(worker)
    })
  }

  private send(
    worker: ConnectedWorker,
    job: Omit<SynthesizeJob, "type" | "jobId">,
    resolve: (result: JobResult) => void,
    reject: (error: Error) => void,
  ): void {
    const jobId = randomUUID()
    const timer = setTimeout(() => {
      worker.pending.delete(jobId)
      this.next(worker)
      void this.publishLive(worker)
      reject(new WorkerJobError(`worker ${worker.publicId} timed out`, worker.id))
    }, this.jobTimeoutMs)
    worker.pending.set(jobId, { resolve, reject, timer })
    void this.publishLive(worker)
    const message: SynthesizeJob = { type: "synthesize", jobId, ...job }
    worker.socket.send(JSON.stringify(message), (error) => {
      if (!error) return
      clearTimeout(timer)
      worker.pending.delete(jobId)
      this.next(worker)
      reject(new WorkerJobError(`failed to send a job to ${worker.publicId}`, worker.id))
    })
  }

  /** 空いた分だけ、順番待ちのジョブを送る */
  private next(worker: ConnectedWorker): void {
    while (worker.waiting?.length && worker.pending.size < worker.maxConcurrency) {
      const entry = worker.waiting.shift()
      if (!entry) return
      clearTimeout(entry.timer)
      this.send(worker, entry.job, entry.resolve, entry.reject)
    }
  }

  /** Worker から結果が届いた */
  complete(
    worker: ConnectedWorker,
    result: { jobId: string } & ({ ok: true; audio: string; durationMs?: number } | { ok: false; error: string }),
  ): void {
    const job = worker.pending.get(result.jobId)
    if (!job) return
    worker.pending.delete(result.jobId)
    clearTimeout(job.timer)
    this.next(worker)
    void this.publishLive(worker)
    if (result.ok) {
      job.resolve({ audio: Buffer.from(result.audio, "base64"), durationMs: result.durationMs })
    } else {
      job.reject(new WorkerJobError(result.error, worker.id))
    }
  }

  /** 切断時: 実行中・順番待ちのジョブをすべて失敗にする */
  failAll(worker: ConnectedWorker, reason: string): void {
    for (const job of worker.pending.values()) {
      clearTimeout(job.timer)
      job.reject(new WorkerJobError(reason, worker.id))
    }
    worker.pending.clear()
    for (const entry of worker.waiting ?? []) {
      clearTimeout(entry.timer)
      entry.reject(new WorkerJobError(reason, worker.id))
    }
    if (worker.waiting) worker.waiting.length = 0
  }

  liveState(worker: ConnectedWorker): WorkerLive {
    const running = Math.min(worker.pending.size, worker.maxConcurrency)
    const unhealthy = [...worker.engines.values()].some((e) => !e.healthy)
    return {
      status: worker.pending.size >= worker.maxConcurrency ? "busy" : unhealthy ? "degraded" : "online",
      runningJobs: running,
      // 上限を下げた直後は、送り済みのジョブが上限を超えていることがある
      queue: Math.max(0, worker.pending.size - worker.maxConcurrency) + (worker.waiting?.length ?? 0),
      maxConcurrency: worker.maxConcurrency,
      latencyMs: worker.latencyMs,
      lastSeenAt: worker.lastSeenAt.toISOString(),
    }
  }

  /** Control API が表示するリアルタイム状態を Redis に書く */
  async publishLive(worker: ConnectedWorker): Promise<void> {
    if (this.workers.get(worker.id) !== worker) return
    await this.redis
      .set(redisKeys.workerLive(worker.id), JSON.stringify(this.liveState(worker)), "EX", LIVE_TTL_SECONDS)
      .catch(() => undefined)
  }

  async clearLive(worker: ConnectedWorker): Promise<void> {
    await this.redis.del(redisKeys.workerLive(worker.id)).catch(() => undefined)
  }
}

export const noWorker = () => new AppError("SERVICE_UNAVAILABLE", "No worker is available to synthesize this voice.")
