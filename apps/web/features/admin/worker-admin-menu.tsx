"use client"

import { useEffect, useState } from "react"
import {
  ArrowsClockwiseIcon,
  DotsThreeIcon,
  LinkBreakIcon,
  PencilSimpleIcon,
  PlayIcon,
  PlugsIcon,
  SpinnerGapIcon,
  TrashIcon,
  WarningIcon,
  WrenchIcon,
} from "@phosphor-icons/react"

import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { CodeBlock } from "@/components/common/copy-button"
import { useI18n } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { WORKER_CONTROL_SERVER } from "@/lib/config"
import { fmt } from "@/lib/i18n/config"
import {
  deleteAdminWorker,
  disconnectAdminWorker,
  getAdminWorkerConnections,
  regenerateAdminWorkerToken,
  updateAdminWorker,
  updateAdminWorkerConnections,
} from "@/services/admin"
import type { AdminWorker, AdminWorkerConnection } from "@/types/admin"
import { WORKER_NAME_LENGTH } from "@/types/worker"

import { runAction } from "@/features/admin/run-action"

/** 公式Worker を動かすマシンに設定する環境変数 */
export function officialSetupEnv(token: string, engines: string[]) {
  return [`CONTROL_SERVER=${WORKER_CONTROL_SERVER}`, `WORKER_TOKEN=${token}`, `WORKER_ENGINES=${engines.join(",")}`].join(
    "\n"
  )
}

export const validWorkerName = (name: string) =>
  name.trim().length >= WORKER_NAME_LENGTH.min && name.trim().length <= WORKER_NAME_LENGTH.max

type Dialogs = "rename" | "disable" | "disconnect" | "connections" | "token" | "delete" | "issued" | null

/**
 * 運営コンソールの Worker 1 台の操作メニュー（公式Worker・自鯖Worker 共通）。
 * 発行したトークンは state にだけ保持し、保存しない。
 */
export function WorkerAdminMenu({
  worker,
  onChanged,
  onDeleted,
}: {
  worker: AdminWorker
  onChanged: () => Promise<void>
  /** 削除した後の処理（詳細ページでは一覧に戻る）。省略すると onChanged */
  onDeleted?: () => void
}) {
  const { t } = useI18n()
  const [dialog, setDialog] = useState<Dialogs>(null)
  const [token, setToken] = useState<string | null>(null)
  const close = () => setDialog(null)
  const official = worker.type === "official"

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={t.admin.columnActions}>
              <DotsThreeIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDialog("rename")}>
            <PencilSimpleIcon />
            {t.admin.rename}
          </DropdownMenuItem>
          {worker.enabled ? (
            <DropdownMenuItem onClick={() => setDialog("disable")}>
              <WrenchIcon />
              {t.ops.disable}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() =>
                void runAction(t, () => updateAdminWorker(worker.id, { enabled: true }), t.ops.workerEnabled)
                  .then(onChanged)
                  .catch(() => undefined)
              }
            >
              <PlayIcon />
              {t.ops.enable}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setDialog("disconnect")} disabled={worker.status === "offline"}>
            <LinkBreakIcon />
            {t.ops.disconnect}
          </DropdownMenuItem>
          {!official && (
            <DropdownMenuItem onClick={() => setDialog("connections")}>
              <PlugsIcon />
              {t.ops.connections}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setDialog("token")}>
            <ArrowsClockwiseIcon />
            {t.admin.regenerateToken}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>
            <TrashIcon />
            {t.admin.deleteWorker}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "rename"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          {dialog === "rename" && (
            <RenameForm
              worker={worker}
              onDone={async () => {
                close()
                await onChanged()
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={dialog === "disable"}
        onOpenChange={(o) => !o && close()}
        title={fmt(t.ops.disableTitle, { name: worker.name })}
        description={t.ops.disableDescription}
        confirmLabel={t.ops.disable}
        destructive
        onConfirm={async () => {
          await runAction(t, () => updateAdminWorker(worker.id, { enabled: false }), t.ops.workerDisabled)
          await onChanged()
        }}
      />

      <ConfirmDialog
        open={dialog === "disconnect"}
        onOpenChange={(o) => !o && close()}
        title={fmt(t.ops.disconnectTitle, { name: worker.name })}
        description={t.ops.disconnectDescription}
        confirmLabel={t.ops.disconnect}
        onConfirm={async () => {
          await runAction(t, () => disconnectAdminWorker(worker.id), t.ops.workerDisconnected)
          await onChanged()
        }}
      />

      <Dialog open={dialog === "connections"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-lg">
          {dialog === "connections" && <Connections worker={worker} onChanged={onChanged} />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={dialog === "token"}
        onOpenChange={(o) => !o && close()}
        title={fmt(t.admin.regenerateConfirmTitle, { name: worker.name })}
        description={t.admin.regenerateConfirmDescription}
        confirmLabel={t.admin.regenerateToken}
        destructive
        onConfirm={async () => {
          const result = await runAction(t, () => regenerateAdminWorkerToken(worker.id), t.admin.tokenRegenerated)
          setToken(result.token)
          // ConfirmDialog が閉じた後に表示する
          setTimeout(() => setDialog("issued"), 0)
        }}
      />

      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && close()}
        title={fmt(t.admin.deleteConfirmTitle, { name: worker.name })}
        description={t.admin.deleteConfirmDescription}
        confirmLabel={t.common.delete}
        destructive
        onConfirm={async () => {
          await runAction(t, () => deleteAdminWorker(worker.id), t.admin.workerDeleted)
          if (onDeleted) onDeleted()
          else await onChanged()
        }}
      />

      <Dialog
        open={dialog === "issued"}
        onOpenChange={(o) => {
          if (o) return
          setToken(null)
          close()
        }}
      >
        <DialogContent className="sm:max-w-xl">
          {dialog === "issued" && token && (
            <>
              <DialogHeader>
                <DialogTitle>{t.admin.tokenTitle}</DialogTitle>
                <DialogDescription className="flex items-start gap-1.5">
                  <WarningIcon weight="fill" className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                  {t.admin.tokenHint}
                </DialogDescription>
              </DialogHeader>
              <CodeBlock code={token} />
              {official && (
                <>
                  <p className="text-muted-foreground">{t.admin.setupHint}</p>
                  <CodeBlock label=".env" code={officialSetupEnv(token, worker.engines.map((e) => e.engine))} />
                </>
              )}
              <DialogFooter>
                <Button
                  onClick={() => {
                    setToken(null)
                    close()
                  }}
                >
                  {t.common.close}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Worker 名の横に出す「メンテナンス中」 */
export function MaintenanceBadge({ worker }: { worker: AdminWorker }) {
  const { t } = useI18n()
  if (worker.enabled) return null
  return (
    <Badge variant="outline" className="border-warning text-warning">
      <WrenchIcon data-icon="inline-start" />
      {t.ops.maintenance}
    </Badge>
  )
}

function RenameForm({ worker, onDone }: { worker: AdminWorker; onDone: () => Promise<void> }) {
  const { t } = useI18n()
  const [name, setName] = useState(worker.name)
  const [pending, setPending] = useState(false)
  const valid = validWorkerName(name)

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!valid || pending) return
        setPending(true)
        try {
          await runAction(t, () => updateAdminWorker(worker.id, { name: name.trim() }), t.admin.workerRenamed)
          await onDone()
        } catch {
          // Toast で表示済み
        } finally {
          setPending(false)
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{t.admin.rename}</DialogTitle>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor={`worker-rename-${worker.id}`}>{t.admin.workerName}</FieldLabel>
        <Input
          id={`worker-rename-${worker.id}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={WORKER_NAME_LENGTH.max}
          autoFocus
        />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={!valid || pending || name.trim() === worker.name}>
          {pending && <SpinnerGapIcon className="animate-spin" />}
          {t.common.save}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** 自鯖Worker の接続先（確認と、サーバーから外す） */
function Connections({ worker, onChanged }: { worker: AdminWorker; onChanged: () => Promise<void> }) {
  const { t } = useI18n()
  const [connections, setConnections] = useState<AdminWorkerConnection[] | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getAdminWorkerConnections(worker.id)
      .then((list) => !cancelled && setConnections(list))
      .catch(() => !cancelled && setConnections([]))
    return () => {
      cancelled = true
    }
  }, [worker.id])

  async function remove(guildId: string) {
    if (!connections) return
    const rest = connections.filter((c) => c.guildId !== guildId)
    setPending(guildId)
    try {
      await runAction(
        t,
        () =>
          updateAdminWorkerConnections(worker.id, {
            connections: rest.map((c) => ({ guildId: c.guildId, scope: c.scope })),
          }),
        t.ops.connectionsUpdated
      )
      setConnections(rest)
      await onChanged()
    } catch {
      // Toast で表示済み
    } finally {
      setPending(null)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{fmt(t.ops.connectionsTitle, { name: worker.name })}</DialogTitle>
        <DialogDescription>{t.ops.connectionsDescription}</DialogDescription>
      </DialogHeader>
      {connections === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : connections.length === 0 ? (
        <p className="text-muted-foreground">{t.ops.noConnections}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {connections.map((c) => (
            <li key={c.guildId} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.guildName}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{c.guildId}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Badge variant="outline">{t.workerDetail.scope[c.scope]}</Badge>
                <Button variant="outline" size="sm" disabled={pending !== null} onClick={() => void remove(c.guildId)}>
                  {pending === c.guildId && <SpinnerGapIcon className="animate-spin" />}
                  {t.ops.disconnectGuild}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
