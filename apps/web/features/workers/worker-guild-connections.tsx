"use client"

import { useId, useState } from "react"
import { SpinnerGapIcon, UserIcon, UsersThreeIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { SimpleSelect } from "@/components/common/simple-select"
import { useRegisterDirty } from "@/components/common/unsaved-changes"
import { useI18n } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { updateWorkerGuilds } from "@/services/workers"
import type { WorkerGuildConnection, WorkerGuildScope } from "@/types/worker"

type Scopes = Record<string, WorkerGuildScope>

const toScopes = (list: WorkerGuildConnection[]): Scopes =>
  Object.fromEntries(list.map((g) => [g.guildId, g.scope]))

/**
 * 接続するサーバー（仕様書 §36 を拡張）。
 * サーバーで共有 = 全員の読み上げに使う（管理権限が必要）/ 自分専用 = 自分のメッセージだけに使う
 */
export function WorkerGuildConnections({
  workerId,
  initial,
}: {
  workerId: string
  initial: WorkerGuildConnection[]
}) {
  const { t } = useI18n()
  const key = useId()
  const [saved, setSaved] = useState(() => toScopes(initial))
  const [scopes, setScopes] = useState(saved)
  const [saving, setSaving] = useState(false)
  const dirty = initial.some((g) => saved[g.guildId] !== scopes[g.guildId])
  useRegisterDirty(key, dirty)

  const managed = initial.filter((g) => g.canManage)
  const memberOnly = initial.filter((g) => !g.canManage)

  async function save() {
    setSaving(true)
    try {
      await updateWorkerGuilds(workerId, {
        connections: initial.flatMap((g) => {
          const scope = scopes[g.guildId]
          return scope === "none" ? [] : [{ guildId: g.guildId, scope }]
        }),
      })
      setSaved(scopes)
      toast.success(t.toast.connectionsSaved)
    } catch {
      toast.error(t.errors.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  function group({ title, guilds }: { title: string; guilds: WorkerGuildConnection[] }) {
    if (guilds.length === 0) return null
    return (
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        <ul className="flex flex-col divide-y ring-1 ring-border">
          {guilds.map((g) => (
            <li key={g.guildId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <label htmlFor={`scope-${g.guildId}`} className="min-w-0 truncate">
                {g.guildName}
              </label>
              <SimpleSelect
                id={`scope-${g.guildId}`}
                className="w-44"
                options={[
                  { value: "none", label: t.workerDetail.scope.none },
                  { value: "server", label: t.workerDetail.scope.server, disabled: !g.canManage },
                  { value: "personal", label: t.workerDetail.scope.personal },
                ]}
                value={scopes[g.guildId] ?? "none"}
                onValueChange={(v) => setScopes((s) => ({ ...s, [g.guildId]: v as WorkerGuildScope }))}
              />
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.workerDetail.connections}</CardTitle>
        <CardDescription>{t.workerDetail.connectionsHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-2 bg-muted/40 p-3 sm:grid-cols-2">
          <div className="flex items-start gap-2">
            <UsersThreeIcon className="mt-px size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <dt className="font-medium">{t.workerDetail.scope.server}</dt>
              <dd className="text-muted-foreground">{t.workerDetail.scope.serverHint}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <UserIcon className="mt-px size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <dt className="font-medium">{t.workerDetail.scope.personal}</dt>
              <dd className="text-muted-foreground">{t.workerDetail.scope.personalHint}</dd>
            </div>
          </div>
        </dl>
        {initial.length === 0 ? (
          <p className="text-muted-foreground">{t.workerDetail.noServers}</p>
        ) : (
          <>
            {group({ title: t.workerDetail.managedServers, guilds: managed })}
            {group({ title: t.workerDetail.memberServers, guilds: memberOnly })}
          </>
        )}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" onClick={() => setScopes(saved)} disabled={!dirty || saving}>
          {t.common.discard}
        </Button>
        <Button onClick={save} disabled={!dirty || saving}>
          {saving && <SpinnerGapIcon className="animate-spin" />}
          {t.common.save}
        </Button>
      </CardFooter>
    </Card>
  )
}
