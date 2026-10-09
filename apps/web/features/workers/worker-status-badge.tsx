"use client"

import { StatusBadge } from "@/components/common/status-badge"
import { useI18n } from "@/components/providers"
import type { WorkerStatus } from "@/types/worker"

import { workerStatusTone } from "@/features/workers/utils"

/** Online / Busy / Offline / Engine Error（仕様書 §31） */
export function WorkerStatusBadge({ status }: { status: WorkerStatus }) {
  const { t } = useI18n()
  return <StatusBadge tone={workerStatusTone[status]}>{t.status[status]}</StatusBadge>
}
