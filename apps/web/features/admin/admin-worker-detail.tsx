"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PlusIcon } from "@phosphor-icons/react"

import { CopyButton } from "@/components/common/copy-button"
import { RelativeTime } from "@/components/common/relative-time"
import { StatusBadge } from "@/components/common/status-badge"
import { useI18n } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { usePolling } from "@/hooks/use-polling"
import { fmt } from "@/lib/i18n/config"
import {
  getAdminWorker,
  getAdminWorkerConnections,
  listAdminGuilds,
  updateAdminWorker,
  updateAdminWorkerConnections,
} from "@/services/admin"
import type { AdminGuild, AdminWorker, AdminWorkerConnection } from "@/types/admin"

import { runAction } from "@/features/admin/run-action"
import { MaintenanceBadge, WorkerAdminMenu } from "@/features/admin/worker-admin-menu"
import { WorkerConcurrencyLimit } from "@/features/workers/worker-concurrency-limit"
import { WorkerMetrics } from "@/features/workers/worker-metrics"
import { WorkerStatusBadge } from "@/features/workers/worker-status-badge"

/**
 * Worker の詳細（運営者）。公式Worker・自鯖Worker の両方を表示し、状態は自動更新する。
 * 公式Worker は担当するサーバーを指定できる。
 */
export function AdminWorkerDetail({ initial, canEdit }: { initial: AdminWorker; canEdit: boolean }) {
  const { t, f } = useI18n()
  const router = useRouter()
  const [worker, setWorker] = usePolling(() => getAdminWorker(initial.id), initial)
  const refresh = async () => setWorker(await getAdminWorker(worker.id))
  const official = worker.type === "official"

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="truncate font-heading text-lg font-semibold">{worker.name}</h1>
          <span className="flex flex-wrap items-center gap-1.5">
            <WorkerStatusBadge status={worker.status} />
            <MaintenanceBadge worker={worker} />
          </span>
        </div>
        {canEdit && (
          <WorkerAdminMenu worker={worker} onChanged={refresh} onDeleted={() => router.push("/admin/workers")} />
        )}
      </div>

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
                  {official ? t.workerDetail.typeOfficial : t.workerDetail.typePrivate}
                </Badge>
              </dd>
              {worker.owner && (
                <>
                  <dt className="text-muted-foreground">{t.ops.columnOwner}</dt>
                  <dd className="truncate">
                    <Link href={`/admin/users/${worker.owner.id}`} className="underline-offset-4 hover:underline">
                      {worker.owner.name}
                    </Link>
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">{t.workerDetail.created}</dt>
              <dd className="tabular-nums">{worker.createdAt ? f.date(worker.createdAt) : t.common.none}</dd>
              <dt className="text-muted-foreground">{t.workerDetail.lastSeen}</dt>
              <dd className="tabular-nums">
                {worker.lastSeenAt ? <RelativeTime iso={worker.lastSeenAt} /> : t.common.none}
              </dd>
            </dl>
          </CardContent>
        </Card>

        <WorkerEngines worker={worker} canEdit={canEdit} onChanged={setWorker} />
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
            canEdit={canEdit}
            save={(limit) => updateAdminWorker(worker.id, { concurrencyLimit: limit })}
            onSaved={setWorker}
          />
        </CardContent>
      </Card>

      {official && <GuildScope worker={worker} canEdit={canEdit} onChanged={setWorker} />}
    </>
  )
}

/** エンジンの状態と、運営者によるオンオフ */
function WorkerEngines({
  worker,
  canEdit,
  onChanged,
}: {
  worker: AdminWorker
  canEdit: boolean
  onChanged: (worker: AdminWorker) => void
}) {
  const { t } = useI18n()
  const [pending, setPending] = useState<string | null>(null)

  async function toggle(engine: string, on: boolean) {
    const next = on ? worker.disabledEngines.filter((e) => e !== engine) : [...worker.disabledEngines, engine]
    setPending(engine)
    try {
      onChanged(
        await runAction(
          t,
          () => updateAdminWorker(worker.id, { disabledEngines: next }),
          fmt(on ? t.ops.engineTurnedOn : t.ops.engineTurnedOff, { engine })
        )
      )
    } catch {
      // Toast で表示済み
    } finally {
      setPending(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.workerDetail.engines}</CardTitle>
        {canEdit && <CardDescription>{t.ops.workerEnginesHint}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {worker.engines.map((e) => {
            const on = !worker.disabledEngines.includes(e.engine)
            return (
              <li key={e.engine} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium">{e.engine}</span>
                  {e.version && (
                    <span className="text-muted-foreground tabular-nums">
                      {fmt(t.workerDetail.version, { version: e.version })}
                    </span>
                  )}
                </div>
                <span className="flex shrink-0 items-center gap-3">
                  <StatusBadge tone={e.status === "healthy" ? "success" : "destructive"}>{t.status[e.status]}</StatusBadge>
                  {canEdit && (
                    <Switch
                      checked={on}
                      disabled={pending !== null}
                      aria-label={fmt(t.ops.engineSwitchLabel, { engine: e.engine })}
                      onCheckedChange={(checked) => void toggle(e.engine, checked)}
                    />
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

/** 公式Worker の担当: 全サーバー / 指定したサーバーだけ */
function GuildScope({
  worker,
  canEdit,
  onChanged,
}: {
  worker: AdminWorker
  canEdit: boolean
  onChanged: (worker: AdminWorker) => void
}) {
  const { t } = useI18n()
  const [saving, setSaving] = useState(false)
  const [assigned, setAssigned] = useState<AdminWorkerConnection[] | null>(null)
  const selected = worker.guildScope === "selected"

  useEffect(() => {
    let cancelled = false
    getAdminWorkerConnections(worker.id)
      .then((list) => !cancelled && setAssigned(list))
      .catch(() => !cancelled && setAssigned([]))
    return () => {
      cancelled = true
    }
  }, [worker.id])

  async function changeScope(scope: "all" | "selected") {
    setSaving(true)
    try {
      onChanged(await runAction(t, () => updateAdminWorker(worker.id, { guildScope: scope }), t.ops.guildScopeUpdated))
    } catch {
      // Toast で表示済み
    } finally {
      setSaving(false)
    }
  }

  async function saveGuilds(next: AdminWorkerConnection[]) {
    setSaving(true)
    try {
      await runAction(
        t,
        () =>
          updateAdminWorkerConnections(worker.id, {
            connections: next.map((c) => ({ guildId: c.guildId, scope: "server" as const })),
          }),
        t.ops.guildScopeUpdated
      )
      setAssigned(next)
    } catch {
      // Toast で表示済み
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.ops.guildScopeTitle}</CardTitle>
        <CardDescription>{t.ops.guildScopeDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <RadioGroup
          value={worker.guildScope ?? "all"}
          onValueChange={(scope) => void changeScope(scope as "all" | "selected")}
          disabled={!canEdit || saving}
          className="grid gap-2 sm:grid-cols-2"
        >
          {(["all", "selected"] as const).map((scope) => (
            <FieldLabel
              key={scope}
              htmlFor={`guild-scope-${scope}`}
              className="has-data-checked:bg-primary/5 has-data-checked:ring-primary/40"
            >
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>{scope === "all" ? t.ops.guildScopeAll : t.ops.guildScopeSelected}</FieldTitle>
                  <FieldDescription>
                    {scope === "all" ? t.ops.guildScopeAllHint : t.ops.guildScopeSelectedHint}
                  </FieldDescription>
                </FieldContent>
                <RadioGroupItem id={`guild-scope-${scope}`} value={scope} />
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>

        {selected &&
          (assigned === null ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : (
            <>
              {assigned.length === 0 ? (
                <p role="status" className="text-warning">
                  {t.ops.noAssignedGuilds}
                </p>
              ) : (
                <ul aria-label={t.ops.guildScopeTitle} className="flex flex-col divide-y">
                  {assigned.map((c) => (
                    <li key={c.guildId} className="flex items-center justify-between gap-2 py-2 first:pt-0">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.guildName}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{c.guildId}</span>
                      </span>
                      {canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={saving}
                          onClick={() => void saveGuilds(assigned.filter((a) => a.guildId !== c.guildId))}
                        >
                          {t.ops.disconnectGuild}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && (
                <GuildPicker
                  exclude={assigned.map((a) => a.guildId)}
                  disabled={saving}
                  onPick={(g) => void saveGuilds([...assigned, { guildId: g.id, guildName: g.name, scope: "server" }])}
                />
              )}
            </>
          ))}
      </CardContent>
    </Card>
  )
}

/** サーバーを名前で検索して追加する */
function GuildPicker({
  exclude,
  disabled,
  onPick,
}: {
  exclude: string[]
  disabled: boolean
  onPick: (guild: AdminGuild) => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<AdminGuild[] | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (!q) return
    let cancelled = false
    const timer = setTimeout(() => {
      listAdminGuilds({ query: q })
        .then((page) => !cancelled && setResults(page.items))
        .catch(() => !cancelled && setResults([]))
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const shown = query.trim() ? (results ?? []).filter((g) => g.botInstalled && !exclude.includes(g.id)) : []

  return (
    <div className="flex flex-col gap-2">
      <Input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          if (!e.target.value.trim()) setResults(null)
        }}
        placeholder={t.ops.searchGuild}
        aria-label={t.ops.searchGuild}
        className="sm:max-w-sm"
      />
      {query.trim() && results !== null && (
        <ul className="flex flex-col divide-y border">
          {shown.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">{t.ops.noGuildFound}</li>
          ) : (
            shown.slice(0, 8).map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 truncate">{g.name}</span>
                <Button size="sm" variant="outline" disabled={disabled} onClick={() => onPick(g)}>
                  <PlusIcon data-icon="inline-start" />
                  {t.ops.addGuild}
                </Button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
