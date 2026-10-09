"use client"

import { useState } from "react"
import Link from "next/link"
import { HardDrivesIcon } from "@phosphor-icons/react"

import { EmptyState } from "@/components/common/empty-state"
import { RelativeTime } from "@/components/common/relative-time"
import { useI18n } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCursorList } from "@/hooks/use-cursor-list"
import { fmt } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"
import { listPrivateWorkers } from "@/services/admin"
import type { AdminWorker, AdminWorkerFilter, Page } from "@/types/admin"

import { LoadMore } from "@/features/admin/load-more"
import { SearchInput } from "@/features/admin/search-input"
import { MaintenanceBadge, WorkerAdminMenu } from "@/features/admin/worker-admin-menu"
import { WorkerStatusBadge } from "@/features/workers/worker-status-badge"

const FILTERS: (AdminWorkerFilter | undefined)[] = [undefined, "connected", "disconnected", "disabled"]

/** ユーザーの自鯖Worker（運営者のみ）。所有者・名前・ID で検索し、状態で絞り込む */
export function PrivateWorkers({ initial, canEdit }: { initial: Page<AdminWorker>; canEdit: boolean }) {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<AdminWorkerFilter | undefined>(undefined)
  const list = useCursorList(initial, (filter, cursor) => listPrivateWorkers({ ...filter, cursor }), { query, status })

  // 操作の後は、読み込み済みの範囲を読み直す
  async function refresh() {
    const page = await listPrivateWorkers({ query, status })
    list.setItems(page.items)
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} />
        <div className="flex flex-wrap" role="group">
          {FILTERS.map((f) => (
            <Button
              key={f ?? "all"}
              variant="outline"
              aria-pressed={status === f}
              onClick={() => setStatus(f)}
              className={cn(status === f && "bg-muted")}
            >
              {t.ops.workerFilter[f ?? "all"]}
            </Button>
          ))}
        </div>
      </div>
      <Card>
        <CardContent>
          {list.items.length === 0 ? (
            <EmptyState icon={<HardDrivesIcon />} title={query || status ? t.admin.noResults : t.ops.noPrivateWorkers} />
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.admin.columnName}</TableHead>
                    <TableHead>{t.ops.columnOwner}</TableHead>
                    <TableHead>{t.admin.columnStatus}</TableHead>
                    <TableHead>{t.admin.columnEngines}</TableHead>
                    <TableHead className="text-right">{t.ops.columnConnections}</TableHead>
                    <TableHead>{t.admin.columnLastSeen}</TableHead>
                    {canEdit && (
                      <TableHead className="w-12">
                        <span className="sr-only">{t.admin.columnActions}</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.items.map((w) => (
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
                        {w.owner ? (
                          <Link href={`/admin/users/${w.owner.id}`} className="underline-offset-4 hover:underline">
                            {w.owner.name}
                          </Link>
                        ) : (
                          t.common.none
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <WorkerStatusBadge status={w.status} />
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
                        {fmt(t.ops.connectionsCount, { count: w.connections })}
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
          <LoadMore visible={list.nextCursor !== null} loading={list.loading} onClick={list.loadMore} />
        </CardContent>
      </Card>
    </>
  )
}
