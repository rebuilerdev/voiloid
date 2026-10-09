"use client"

import { useState } from "react"
import { PlusIcon, SpinnerGapIcon, StackIcon, WarningIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { CodeBlock } from "@/components/common/copy-button"
import { EmptyState } from "@/components/common/empty-state"
import { RelativeTime } from "@/components/common/relative-time"
import { useI18n } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { usePolling } from "@/hooks/use-polling"
import { fmt } from "@/lib/i18n/config"
import { createOfficialWorker, listOfficialWorkers } from "@/services/admin"
import type { AdminWorker } from "@/types/admin"
import { SELECTABLE_ENGINES, WORKER_NAME_LENGTH } from "@/types/worker"

import { SearchInput } from "@/features/admin/search-input"
import { MaintenanceBadge, officialSetupEnv, validWorkerName, WorkerAdminMenu } from "@/features/admin/worker-admin-menu"
import { WorkerStatusBadge } from "@/features/workers/worker-status-badge"
import { cn } from "@/lib/utils"

/** 対応が必要な Worker: 切断・エラー・異常なエンジン・メンテナンス中 */
const needsAttention = (w: AdminWorker) =>
  !w.enabled || w.status === "offline" || w.status === "error" || w.engines.some((e) => e.status !== "healthy")

type Dialogs = { kind: "add" } | { kind: "issued"; token: string; engines: string[] } | null

/**
 * 公式Worker の管理（運営者のみ）。状態は自動更新する。
 * 発行したトークンは state にだけ保持し、保存しない。
 */
export function OfficialWorkers({ initial, canEdit }: { initial: AdminWorker[]; canEdit: boolean }) {
  const { t } = useI18n()
  const [workers, setWorkers] = usePolling(listOfficialWorkers, initial)
  const [dialog, setDialog] = useState<Dialogs>(null)
  const [query, setQuery] = useState("")
  const [onlyProblems, setOnlyProblems] = useState(false)
  const close = () => setDialog(null)

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
          <Button onClick={() => setDialog({ kind: "add" })}>
            <PlusIcon data-icon="inline-start" />
            {t.admin.addOfficial}
          </Button>
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
                        <span className="font-medium">{w.name}</span>
                        <span className="block font-mono text-[11px] text-muted-foreground">{w.id}</span>
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

      <Dialog open={dialog?.kind === "add"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          {dialog?.kind === "add" && (
            <AddForm
              onCreated={async (token, engines) => {
                toast.success(t.admin.workerCreated)
                setDialog({ kind: "issued", token, engines })
                await refresh()
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === "issued"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-xl">
          {dialog?.kind === "issued" && (
            <>
              <DialogHeader>
                <DialogTitle>{t.admin.tokenTitle}</DialogTitle>
                <DialogDescription className="flex items-start gap-1.5">
                  <WarningIcon weight="fill" className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                  {t.admin.tokenHint}
                </DialogDescription>
              </DialogHeader>
              <CodeBlock code={dialog.token} />
              <p className="text-muted-foreground">{t.admin.setupHint}</p>
              <CodeBlock label=".env" code={officialSetupEnv(dialog.token, dialog.engines)} />
              <DialogFooter>
                <Button onClick={close}>{t.common.close}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function AddForm({ onCreated }: { onCreated: (token: string, engines: string[]) => Promise<void> }) {
  const { t } = useI18n()
  const [name, setName] = useState("")
  const [engines, setEngines] = useState<string[]>(["VOICEVOX"])
  const [pending, setPending] = useState(false)
  const valid = validWorkerName(name) && engines.length > 0

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!valid || pending) return
        setPending(true)
        try {
          const res = await createOfficialWorker({ name: name.trim(), engines })
          await onCreated(res.token, engines)
        } catch {
          toast.error(t.errors.saveFailed)
        } finally {
          setPending(false)
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{t.admin.addOfficial}</DialogTitle>
        <DialogDescription>{t.admin.addOfficialDescription}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="official-worker-name">{t.admin.workerName}</FieldLabel>
          <Input
            id="official-worker-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.admin.workerNamePlaceholder}
            maxLength={WORKER_NAME_LENGTH.max}
            autoFocus
          />
        </Field>
        <FieldSet>
          <FieldLegend variant="label">{t.admin.workerEngines}</FieldLegend>
          <FieldGroup className="gap-2" data-slot="checkbox-group">
            {SELECTABLE_ENGINES.map((engine) => (
              <Field key={engine} orientation="horizontal">
                <Checkbox
                  id={`official-engine-${engine}`}
                  checked={engines.includes(engine)}
                  onCheckedChange={(c) => setEngines((list) => (c ? [...list, engine] : list.filter((x) => x !== engine)))}
                />
                <FieldLabel htmlFor={`official-engine-${engine}`} className="font-normal">
                  {engine}
                </FieldLabel>
              </Field>
            ))}
          </FieldGroup>
        </FieldSet>
      </FieldGroup>
      <DialogFooter>
        <Button type="submit" disabled={!valid || pending}>
          {pending && <SpinnerGapIcon className="animate-spin" />}
          {t.admin.create}
        </Button>
      </DialogFooter>
    </form>
  )
}
