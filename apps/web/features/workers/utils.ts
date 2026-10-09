import type { StatusTone } from "@/components/common/status-badge"
import type { Worker, WorkerStatus } from "@/types/worker"

export const isWorkerUp = (w: Pick<Worker, "status">) => w.status === "online" || w.status === "busy"

export const workerStatusTone: Record<WorkerStatus, StatusTone> = {
  online: "success",
  busy: "warning",
  offline: "destructive",
  error: "destructive",
}

export type Congestion = "low" | "medium" | "high"

export function congestionOf(running: number, max: number): Congestion {
  const ratio = max === 0 ? 1 : running / max
  if (ratio < 0.5) return "low"
  if (ratio < 0.8) return "medium"
  return "high"
}

export const congestionTone: Record<Congestion, StatusTone> = {
  low: "success",
  medium: "warning",
  high: "destructive",
}

/** 公式Worker の全体サマリー（ユーザー決定: 個別の情報は出さない） */
export function summarizeOfficial(workers: Worker[]) {
  const official = workers.filter((w) => w.type === "official")
  const up = official.filter(isWorkerUp)
  return {
    total: official.length,
    up: up.length,
    allUp: up.length === official.length,
    congestion: congestionOf(
      up.reduce((s, w) => s + w.runningJobs, 0),
      up.reduce((s, w) => s + w.maxConcurrency, 0)
    ),
    engines: [...new Set(up.flatMap((w) => w.engines.map((e) => e.engine)))],
  }
}

export const privateWorkers = (workers: Worker[]) => workers.filter((w) => w.type === "private")
