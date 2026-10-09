"use client"

import { GuardedLink } from "@/components/common/unsaved-changes"
import { useI18n } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { Worker } from "@/types/worker"

import { isWorkerUp } from "@/features/workers/utils"
import { WorkerStatusBadge } from "@/features/workers/worker-status-badge"

/** Worker Card（仕様書 §30）: 名前・状態・Engine・実行中 Job・レイテンシ */
export function WorkerCard({ worker }: { worker: Worker }) {
  const { t } = useI18n()
  const up = isWorkerUp(worker)

  return (
    <Card size="sm" className="relative transition-colors hover:bg-muted/40">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <GuardedLink href={`/workers/${worker.id}`} className="truncate after:absolute after:inset-0">
            {worker.name}
          </GuardedLink>
          <WorkerStatusBadge status={worker.status} />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1">
          {worker.engines.map((e) => (
            <Badge key={e.engine} variant="outline">
              {e.engine}
            </Badge>
          ))}
        </div>
        <dl className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">{t.workers.runningJobs}</dt>
            <dd className="flex flex-col gap-1.5">
              <span className="font-heading text-base font-semibold tabular-nums">
                {up ? worker.runningJobs : 0}
                <span className="text-xs font-normal text-muted-foreground"> / {worker.maxConcurrency}</span>
              </span>
              <Progress
                value={up ? (worker.runningJobs / worker.maxConcurrency) * 100 : 0}
                aria-label={t.workers.runningJobs}
              />
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">{t.workers.latency}</dt>
            <dd className="font-heading text-base font-semibold tabular-nums">
              {up && worker.latency !== undefined ? `${worker.latency}ms` : t.common.none}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}
