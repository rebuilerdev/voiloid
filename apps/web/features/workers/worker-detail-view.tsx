"use client"

import { useState } from "react"
import { PencilSimpleIcon, WarningOctagonIcon } from "@phosphor-icons/react"

import { CopyButton } from "@/components/common/copy-button"
import { RelativeTime } from "@/components/common/relative-time"
import { useI18n } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { usePolling } from "@/hooks/use-polling"
import { getWorker, updateWorker } from "@/services/workers"
import type { Worker, WorkerGuildConnection } from "@/types/worker"

import { WorkerDangerZone } from "@/features/workers/worker-danger-zone"
import { WorkerEngineList } from "@/features/workers/worker-engine-list"
import { WorkerGuildConnections } from "@/features/workers/worker-guild-connections"
import { WorkerConcurrencyLimit } from "@/features/workers/worker-concurrency-limit"
import { WorkerMetrics } from "@/features/workers/worker-metrics"
import { WorkerRenameDialog } from "@/features/workers/worker-rename-dialog"
import { WorkerStatusBadge } from "@/features/workers/worker-status-badge"

/** Worker Detail（仕様書 §32〜38）。状態は自動更新する */
export function WorkerDetailView({
  initial,
  permissions,
}: {
  initial: Worker
  permissions: WorkerGuildConnection[]
}) {
  const { t, f } = useI18n()
  const [worker, setWorker] = usePolling(() => getWorker(initial.id), initial)
  const [renaming, setRenaming] = useState(false)

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="truncate font-heading text-lg font-semibold">{worker.name}</h1>
          <WorkerStatusBadge status={worker.status} />
        </div>
        <Button variant="outline" onClick={() => setRenaming(true)}>
          <PencilSimpleIcon data-icon="inline-start" />
          {t.workerDetail.edit}
        </Button>
      </div>

      {(worker.status === "offline" || worker.status === "error") && (
        <div role="status" className="flex items-start gap-2 border-l-2 border-destructive bg-muted/40 p-3 text-xs">
          <WarningOctagonIcon weight="fill" className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          {worker.status === "offline" ? t.workerDetail.offlineNotice : t.workerDetail.errorNotice}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.workerDetail.information}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-y-3">
              <dt className="text-muted-foreground">{t.workerDetail.workerId}</dt>
              <dd className="flex min-w-0 items-center gap-1">
                <code className="truncate font-mono">{worker.id}</code>
                <CopyButton value={worker.id} label={`${t.common.copy}: ${t.workerDetail.workerId}`} />
              </dd>
              <dt className="text-muted-foreground">{t.workerDetail.type}</dt>
              <dd>
                <Badge variant="secondary">
                  {worker.type === "private" ? t.workerDetail.typePrivate : t.workerDetail.typeOfficial}
                </Badge>
              </dd>
              <dt className="text-muted-foreground">{t.workerDetail.created}</dt>
              <dd className="tabular-nums">{worker.createdAt ? f.date(worker.createdAt) : t.common.none}</dd>
              <dt className="text-muted-foreground">{t.workerDetail.lastSeen}</dt>
              <dd className="tabular-nums">{worker.lastSeenAt ? <RelativeTime iso={worker.lastSeenAt} /> : t.common.none}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.workerDetail.engines}</CardTitle>
          </CardHeader>
          <CardContent>
            <WorkerEngineList engines={worker.engines} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.workerDetail.performance}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <WorkerMetrics worker={worker} />
          <WorkerConcurrencyLimit
            key={worker.concurrencyLimit ?? "none"}
            worker={worker}
            canEdit
            save={(limit) => updateWorker(worker.id, { concurrencyLimit: limit })}
            onSaved={setWorker}
          />
        </CardContent>
      </Card>

      <WorkerGuildConnections workerId={worker.id} initial={permissions} />

      <WorkerDangerZone worker={worker} />

      <WorkerRenameDialog worker={worker} open={renaming} onOpenChange={setRenaming} onRenamed={setWorker} />
    </>
  )
}
