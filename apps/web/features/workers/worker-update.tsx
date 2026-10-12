"use client"

import { ArrowCircleUpIcon, WarningIcon } from "@phosphor-icons/react"

import { CodeBlock } from "@/components/common/copy-button"
import { StatusBadge } from "@/components/common/status-badge"
import { useI18n } from "@/components/providers"
import { fmt } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"
import type { Worker } from "@/types/worker"

const UPDATE_COMMAND = "docker compose pull\ndocker compose up -d"

/** 状態の横に出す「更新あり」「要更新」 */
export function WorkerUpdateBadge({ worker }: { worker: Pick<Worker, "update"> }) {
  const { t } = useI18n()
  if (!worker.update) return null
  return (
    <StatusBadge tone={worker.update === "required" ? "destructive" : "warning"}>
      {t.workerUpdate[worker.update]}
    </StatusBadge>
  )
}

/**
 * Worker の詳細に出す更新の案内。
 * available = 今のままでも使えるが、更新すると使える機能がある / required = 古いため接続できない
 */
export function WorkerUpdateNotice({ worker }: { worker: Pick<Worker, "update" | "version"> }) {
  const { t } = useI18n()
  if (!worker.update) return null
  const required = worker.update === "required"
  const Icon = required ? WarningIcon : ArrowCircleUpIcon
  return (
    <section
      role={required ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-2 border-l-2 bg-muted/40 p-3 text-xs",
        required ? "border-destructive" : "border-warning"
      )}
    >
      <div className="flex items-start gap-2">
        <Icon
          weight="fill"
          className={cn("mt-0.5 size-4 shrink-0", required ? "text-destructive" : "text-warning")}
          aria-hidden
        />
        <div className="flex flex-col gap-1">
          <span className="font-medium">{required ? t.workerUpdate.requiredTitle : t.workerUpdate.availableTitle}</span>
          <span className="text-muted-foreground">
            {required ? t.workerUpdate.requiredHint : t.workerUpdate.availableHint}
            {worker.version && ` ${fmt(t.workerUpdate.current, { version: worker.version })}`}
          </span>
        </div>
      </div>
      <p className="text-muted-foreground">{t.workerUpdate.howTo}</p>
      <CodeBlock label="shell" code={UPDATE_COMMAND} />
    </section>
  )
}
