"use client"

import { useI18n } from "@/components/providers"
import { Progress } from "@/components/ui/progress"
import type { Worker } from "@/types/worker"

import { isWorkerUp } from "@/features/workers/utils"

/** 実行中 Job / キュー / 平均レイテンシ（仕様書 §35。MVP ではグラフなし） */
export function WorkerMetrics({ worker }: { worker: Worker }) {
  const { t } = useI18n()
  const up = isWorkerUp(worker)
  const running = up ? worker.runningJobs : 0

  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <dt className="text-muted-foreground">{t.workerDetail.runningJobs}</dt>
        <dd className="font-heading text-xl font-semibold tabular-nums">
          {running}
          <span className="text-sm font-normal text-muted-foreground"> / {worker.maxConcurrency}</span>
        </dd>
        <Progress value={(running / worker.maxConcurrency) * 100} aria-label={t.workerDetail.runningJobs} />
      </div>
      <div className="flex flex-col gap-1.5">
        <dt className="text-muted-foreground">{t.workerDetail.queue}</dt>
        <dd className="font-heading text-xl font-semibold tabular-nums">{up ? (worker.queue ?? 0) : t.common.none}</dd>
      </div>
      <div className="flex flex-col gap-1.5">
        <dt className="text-muted-foreground">{t.workerDetail.avgLatency}</dt>
        <dd className="font-heading text-xl font-semibold tabular-nums">
          {up && worker.latency !== undefined ? `${worker.latency}ms` : t.common.none}
        </dd>
      </div>
    </dl>
  )
}
