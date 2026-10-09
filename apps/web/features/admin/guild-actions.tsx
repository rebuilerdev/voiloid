"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PauseIcon, PencilSimpleIcon, PlayIcon, ProhibitIcon, SignOutIcon, StopIcon } from "@phosphor-icons/react"

import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { ReasonDialog } from "@/components/common/reason-dialog"
import { useI18n } from "@/components/providers"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { fmt } from "@/lib/i18n/config"
import { leaveGuild, removeGuildWorker, stopGuildSessions, suspendGuild, unsuspendGuild } from "@/services/admin"
import { canOperate, type AdminGuildDetail, type OperatorRole } from "@/types/admin"

import { runAction } from "@/features/admin/run-action"

type Dialogs = "stop" | "suspend" | "unsuspend" | "leave" | null

/** サーバーの操作（運営者）: 設定の編集・読み上げの強制終了・利用停止・Bot の退出 */
export function GuildActions({ guild, role }: { guild: AdminGuildDetail; role: OperatorRole | null }) {
  const { t } = useI18n()
  const router = useRouter()
  const [dialog, setDialog] = useState<Dialogs>(null)
  const close = () => setDialog(null)
  const canEdit = canOperate(role, "editor")
  const canAdmin = canOperate(role, "admin")
  const name = guild.name

  if (!canEdit) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.ops.guildActions}</CardTitle>
        <CardDescription>{t.ops.editSettingsHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {guild.botInstalled && (
          <Link href={`/servers/${guild.id}`} className={buttonVariants({ variant: "outline" })}>
            <PencilSimpleIcon data-icon="inline-start" />
            {t.ops.editSettings}
          </Link>
        )}
        {guild.botInstalled && (
          <Button variant="outline" onClick={() => setDialog("stop")} disabled={guild.sessions.length === 0}>
            <StopIcon data-icon="inline-start" />
            {t.ops.stopSessions}
          </Button>
        )}
        {guild.suspended ? (
          <Button variant="outline" onClick={() => setDialog("unsuspend")}>
            <PlayIcon data-icon="inline-start" />
            {t.ops.unsuspendGuild}
          </Button>
        ) : (
          <Button variant="outline" className="text-destructive" onClick={() => setDialog("suspend")}>
            <PauseIcon data-icon="inline-start" />
            {t.ops.suspendGuild}
          </Button>
        )}
        {canAdmin && guild.botInstalled && (
          <Button variant="destructive" onClick={() => setDialog("leave")}>
            <SignOutIcon data-icon="inline-start" />
            {t.ops.leaveGuild}
          </Button>
        )}
      </CardContent>

      <ConfirmDialog
        open={dialog === "stop"}
        onOpenChange={(o) => !o && close()}
        title={fmt(t.ops.stopSessionsTitle, { name })}
        description={t.ops.stopSessionsDescription}
        confirmLabel={t.ops.stopSessions}
        destructive
        onConfirm={async () => {
          await runAction(t, () => stopGuildSessions(guild.id), t.ops.sessionsStopped)
          router.refresh()
        }}
      />
      <ReasonDialog
        open={dialog === "suspend"}
        onOpenChange={(o) => !o && close()}
        title={fmt(t.ops.suspendGuildTitle, { name })}
        description={t.ops.suspendGuildDescription}
        confirmLabel={t.ops.suspendGuild}
        onConfirm={async (reason) => {
          await runAction(t, () => suspendGuild(guild.id, reason), t.ops.guildSuspended)
          router.refresh()
        }}
      />
      <ConfirmDialog
        open={dialog === "unsuspend"}
        onOpenChange={(o) => !o && close()}
        title={t.ops.unsuspendGuild}
        description={name}
        confirmLabel={t.ops.unsuspendGuild}
        onConfirm={async () => {
          await runAction(t, () => unsuspendGuild(guild.id), t.ops.guildUnsuspended)
          router.refresh()
        }}
      />
      <ReasonDialog
        open={dialog === "leave"}
        onOpenChange={(o) => !o && close()}
        title={fmt(t.ops.leaveGuildTitle, { name })}
        description={t.ops.leaveGuildDescription}
        confirmLabel={t.ops.leaveGuild}
        onConfirm={async (reason) => {
          await runAction(t, () => leaveGuild(guild.id, reason), t.ops.guildLeft)
          router.refresh()
        }}
      />
    </Card>
  )
}

/** サーバーから自鯖Worker の接続を外すボタン */
export function RemoveGuildWorkerButton({
  guildId,
  worker,
  onRemoved,
}: {
  guildId: string
  worker: { id: string; name: string }
  onRemoved: () => Promise<void> | void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <ProhibitIcon data-icon="inline-start" />
        {t.ops.removeWorker}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={fmt(t.ops.removeWorkerTitle, { name: worker.name })}
        description={t.ops.removeWorkerDescription}
        confirmLabel={t.ops.removeWorker}
        destructive
        onConfirm={async () => {
          await runAction(t, () => removeGuildWorker(guildId, worker.id), t.ops.workerRemoved)
          await onRemoved()
        }}
      />
    </>
  )
}
