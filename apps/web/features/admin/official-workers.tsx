"use client"

import { useState } from "react"
import Link from "next/link"
import { PlusIcon, StackIcon } from "@phosphor-icons/react"

import { EmptyState } from "@/components/common/empty-state"
import { RelativeTime } from "@/components/common/relative-time"
import { useI18n } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { usePolling } from "@/hooks/use-polling"
import { fmt } from "@/lib/i18n/config"
import { listOfficialWorkers } from "@/services/admin"
import type { AdminWorker } from "@/types/admin"

import { SearchInput } from "@/features/admin/search-input"
import { MaintenanceBadge, WorkerAdminMenu } from "@/features/admin/worker-admin-menu"
import { WorkerStatusBadge } from "@/features/workers/worker-status-badge"
import { WorkerUpdateBadge } from "@/features/workers/worker-update"
import { cn } from "@/lib/utils"

/** 対応が必要な Worker: 切断・エラー・異常なエンジン・メンテナンス中 */
const needsAttention = (w: AdminWorker) =>
  !w.enabled || w.status === "offline" || w.status === "error" || w.engines.some((e) => e.status !== "healthy")

/**
 * 公式Worker の管理（運営者のみ）。状態は自動更新する。
 * 追加は自鯖Worker と同じ手順の画面（/admin/workers/new）で行う。
 */
export function OfficialWorkers({ initial, canEdit }: { initial: AdminWorker[]; canEdit: boolean }) {
  const { t } = useI18n()
  const [workers, setWorkers] = usePolling(listOfficialWorkers, initial)
  const [query, setQuery] = useState("")
  const [onlyProblems, setOnlyProblems] = useState(false)

  const problems = workers.filter(needsAttention)
  const count = (status: AdminWorker["status"]) => workers.filter((w) => w.status === status).length
  const q = query.trim().toLowerCase()
  const shown = (onlyProblems ? problems : workers).filter(
    (w) => !q || w.name.toLowerCase().includes(q) || w.id.toLowerCase().includes(q),
  )

  const refresh = async () => setWorkers(await listOfficialWorkers())

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} />
          <div className="flex" role="group">
            {[false, true].map((problemsOnly) => (
              <Button
                key={String(problemsOnly)}
                variant="outline"
                aria-pressed={onlyProblems === problemsOnly}
                onClick={() => setOnlyProblems(problemsOnly)}
                className={cn(onlyProblems === problemsOnly && "bg-muted", problemsOnly && problems.length > 0 && "text-warning")}
              >
                {problemsOnly
                  ? fmt(t.admin.filterProblems, { count: problems.length })
                  : fmt(t.admin.filterAll, { count: workers.length })}
              </Button>
            ))}
          </div>
        </div>
        {canEdit && (
          <Link href="/admin/workers/new" className={buttonVariants()}>
            <PlusIcon data-icon="inline-start" />
            {t.admin.addOfficial}
          </Link>
        )}
      </div>
      {workers.length > 0 && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {fmt(t.admin.workerSummary, {
            online: count("online"),
            busy: count("busy"),
            offline: count("offline"),
            error: count("error"),
          })}
        </p>
      )}

      <Card>
        <CardContent>
          {workers.length === 0 ? (
            <EmptyState icon={<StackIcon />} title={t.admin.noOfficialWorkers} description={t.admin.noOfficialWorkersHint} />
          ) : shown.length === 0 ? (
            <EmptyState icon={<StackIcon />} title={onlyProblems && !q ? t.admin.noProblems : t.admin.noResults} />
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.admin.columnName}</TableHead>
                    <TableHead>{t.admin.columnStatus}</TableHead>
                    <TableHead>{t.admin.columnEngines}</TableHead>
                    <TableHead className="text-right">{t.admin.columnLoad}</TableHead>
                    <TableHead className="text-right">{t.admin.columnLatency}</TableHead>
                    <TableHead>{t.admin.columnLastSeen}</TableHead>
                    {canEdit && (
                      <TableHead className="w-12">
                        <span className="sr-only">{t.admin.columnActions}</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell>
                        <Link
                          href={`/admin/workers/${w.id}`}
                          aria-label={fmt(t.ops.openWorker, { name: w.name })}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {w.name}
                        </Link>
                        <span className="block font-mono text-[11px] text-muted-foreground">{w.id}</span>
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <WorkerStatusBadge status={w.status} />
                          <WorkerUpdateBadge worker={w} />
                          <MaintenanceBadge worker={w} />
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {w.engines.map((e) => (
                            <Badge key={e.engine} variant={e.status === "healthy" ? "outline" : "destructive"}>
                              {e.engine}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {w.runningJobs} / {w.maxConcurrency}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {w.latency === undefined ? t.common.none : `${w.latency}ms`}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {w.lastSeenAt ? <RelativeTime iso={w.lastSeenAt} /> : t.common.none}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <WorkerAdminMenu worker={w} onChanged={refresh} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

    </>
  )
}
