"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowCounterClockwiseIcon, PauseIcon, PlayIcon, SignOutIcon, TrashIcon } from "@phosphor-icons/react"

import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { Notice } from "@/components/common/notice"
import { ReasonDialog } from "@/components/common/reason-dialog"
import { RelativeTime } from "@/components/common/relative-time"
import { StatusBadge } from "@/components/common/status-badge"
import { useI18n } from "@/components/providers"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { fmt } from "@/lib/i18n/config"
import {
  deleteAdminUser,
  getAdminUser,
  logoutAdminUser,
  setAdminUserVoice,
  suspendUser,
  unsuspendUser,
} from "@/services/admin"
import { canOperate, type AdminUserDetail, type OperatorRole } from "@/types/admin"

import { runAction } from "@/features/admin/run-action"
import { MaintenanceBadge, WorkerAdminMenu } from "@/features/admin/worker-admin-menu"
import { WorkerStatusBadge } from "@/features/workers/worker-status-badge"

type Dialogs = "voice" | "logout" | "suspend" | "unsuspend" | "delete" | null

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  )
}

/** ユーザーの詳細と操作（運営者のみ） */
export function UserDetail({
  initial,
  role,
  currentUserId,
}: {
  initial: AdminUserDetail
  role: OperatorRole | null
  currentUserId: string
}) {
  const { t, f } = useI18n()
  const router = useRouter()
  const [user, setUser] = useState(initial)
  const [dialog, setDialog] = useState<Dialogs>(null)
  const close = () => setDialog(null)
  const canEdit = canOperate(role, "editor")
  const canAdmin = canOperate(role, "admin")
  // 自分自身・owner は利用停止・削除できない（API も拒否する）
  const protectedUser = user.id === currentUserId || user.operatorRole === "owner"
  const name = user.displayName

  const reload = async () => setUser(await getAdminUser(user.id))

  return (
    <>
      {user.suspension && (
        <Notice tone="destructive">
          <span className="font-medium">{t.ops.suspended}</span>
          <span className="block text-muted-foreground">
            {fmt(t.ops.suspendedDetail, {
              date: f.date(user.suspension.at),
              name: user.suspension.by?.name ?? t.admin.system,
              reason: user.suspension.reason,
            })}
          </span>
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Avatar>
                {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
                <AvatarFallback>{user.displayName.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0">
                <span className="block truncate">{user.displayName}</span>
                <span className="block text-xs font-normal text-muted-foreground">@{user.username}</span>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Row label={t.admin.columnUserId}>
                <span className="font-mono text-[11px]">{user.id}</span>
              </Row>
              <Row label={t.ops.role}>
                {user.operatorRole ? <Badge>{t.ops.roles[user.operatorRole]}</Badge> : t.common.none}
              </Row>
              <Row label={t.admin.columnStatus}>
                <StatusBadge tone={user.suspended ? "destructive" : "success"}>
                  {user.suspended ? t.ops.suspended : t.ops.active}
                </StatusBadge>
              </Row>
              <Row label={t.ops.loginSessions}>{fmt(t.ops.sessionsCount, { count: f.number(user.sessions) })}</Row>
              <Row label={t.admin.columnVoice}>
                {user.voice ? (
                  <span className="font-mono text-[11px]">
                    {user.voice.engine} / {user.voice.speakerId} / {user.voice.styleId}
                  </span>
                ) : (
                  t.admin.voiceUnset
                )}
              </Row>
              <Row label={t.admin.columnRegistered}>{f.date(user.createdAt)}</Row>
              <Row label={t.admin.columnUpdated}>
                <RelativeTime iso={user.updatedAt} />
              </Row>
            </dl>
          </CardContent>
        </Card>

        {canEdit && (
          <Card>
            <CardHeader>
              <CardTitle>{t.ops.dangerZone}</CardTitle>
              {protectedUser && <CardDescription>{t.ops.protectedUser}</CardDescription>}
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-2">
              <Button variant="outline" onClick={() => setDialog("voice")} disabled={!user.voice}>
                <ArrowCounterClockwiseIcon data-icon="inline-start" />
                {t.ops.resetVoice}
              </Button>
              <Button variant="outline" onClick={() => setDialog("logout")} disabled={user.sessions === 0}>
                <SignOutIcon data-icon="inline-start" />
                {t.ops.logoutUser}
              </Button>
              {user.suspended ? (
                <Button variant="outline" onClick={() => setDialog("unsuspend")}>
                  <PlayIcon data-icon="inline-start" />
                  {t.ops.unsuspendUser}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={() => setDialog("suspend")}
                  disabled={protectedUser}
                >
                  <PauseIcon data-icon="inline-start" />
                  {t.ops.suspendUser}
                </Button>
              )}
              {canAdmin && (
                <Button variant="destructive" onClick={() => setDialog("delete")} disabled={protectedUser}>
                  <TrashIcon data-icon="inline-start" />
                  {t.ops.deleteUser}
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.ops.userWorkers}</CardTitle>
        </CardHeader>
        <CardContent>
          {user.workers.length === 0 ? (
            <p className="text-muted-foreground">{t.ops.noUserWorkers}</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {user.workers.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">{w.name}</span>
                    <span className="block font-mono text-[11px] text-muted-foreground">{w.id}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground">{fmt(t.ops.connectionsCount, { count: w.connections })}</span>
                    <WorkerStatusBadge status={w.status} />
                    <MaintenanceBadge worker={w} />
                    {canEdit && <WorkerAdminMenu worker={w} onChanged={reload} />}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={dialog === "voice"}
        onOpenChange={(o) => !o && close()}
        title={fmt(t.ops.resetVoiceTitle, { name })}
        description={t.ops.resetVoiceDescription}
        confirmLabel={t.ops.resetVoice}
        onConfirm={async () => {
          await runAction(t, () => setAdminUserVoice(user.id, null), t.ops.voiceReset)
          await reload()
        }}
      />
      <ConfirmDialog
        open={dialog === "logout"}
        onOpenChange={(o) => !o && close()}
        title={fmt(t.ops.logoutUserTitle, { name })}
        description={t.ops.logoutUserDescription}
        confirmLabel={t.ops.logoutUser}
        destructive
        onConfirm={async () => {
          await runAction(t, () => logoutAdminUser(user.id), (r) => fmt(t.ops.loggedOut, { count: r.sessions }))
          await reload()
        }}
      />
      <ReasonDialog
        open={dialog === "suspend"}
        onOpenChange={(o) => !o && close()}
        title={fmt(t.ops.suspendUserTitle, { name })}
        description={t.ops.suspendUserDescription}
        confirmLabel={t.ops.suspendUser}
        onConfirm={async (reason) => {
          await runAction(t, () => suspendUser(user.id, reason), t.ops.userSuspended)
          await reload()
        }}
      />
      <ConfirmDialog
        open={dialog === "unsuspend"}
        onOpenChange={(o) => !o && close()}
        title={t.ops.unsuspendUser}
        description={name}
        confirmLabel={t.ops.unsuspendUser}
        onConfirm={async () => {
          await runAction(t, () => unsuspendUser(user.id), t.ops.userUnsuspended)
          await reload()
        }}
      />
      <ReasonDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && close()}
        title={fmt(t.ops.deleteUserTitle, { name })}
        description={t.ops.deleteUserDescription}
        confirmLabel={t.ops.deleteUser}
        onConfirm={async (reason) => {
          await runAction(t, () => deleteAdminUser(user.id, reason), t.ops.userDeleted)
          router.push("/admin/users")
        }}
      />
    </>
  )
}
