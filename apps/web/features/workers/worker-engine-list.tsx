"use client"

import { StatusBadge } from "@/components/common/status-badge"
import { useI18n } from "@/components/providers"
import { fmt } from "@/lib/i18n/config"
import type { WorkerEngine } from "@/types/worker"

/** Engine ごとの Healthy / Unhealthy とバージョン（仕様書 §34） */
export function WorkerEngineList({ engines }: { engines: WorkerEngine[] }) {
  const { t } = useI18n()
  return (
    <ul className="flex flex-col divide-y">
      {engines.map((e) => (
        <li key={e.engine} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <div className="flex min-w-0 flex-col">
            <span className="font-medium">{e.engine}</span>
            {e.version && (
              <span className="text-muted-foreground tabular-nums">{fmt(t.workerDetail.version, { version: e.version })}</span>
            )}
          </div>
          <StatusBadge tone={e.status === "healthy" ? "success" : "destructive"}>{t.status[e.status]}</StatusBadge>
        </li>
      ))}
    </ul>
  )
}
