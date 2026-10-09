"use client"

import { useRouter } from "next/navigation"

import { Notice } from "@/components/common/notice"
import { useI18n } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { fmt } from "@/lib/i18n/config"
import { canOperate, type AdminGuildDetail, type OperatorRole } from "@/types/admin"
import type { WorkerMode } from "@/types/guild"

import { AuditLogTable } from "@/features/admin/audit-log-table"
import { GuildActions, RemoveGuildWorkerButton } from "@/features/admin/guild-actions"
import { ReadingStatusBadge } from "@/features/servers/reading-status-badge"
import { UsageBarChart } from "@/features/usage/usage-bar-chart"
import { WorkerStatusBadge } from "@/features/workers/worker-status-badge"

const workerModeKey: Record<WorkerMode, "auto" | "official" | "privatePreferred" | "specific"> = {
  auto: "auto",
  official: "official",
  private_preferred: "privatePreferred",
  specific: "specific",
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

/** サーバーの詳細（運営者のみ）。editor 以上は操作できる */
export function GuildDetail({ guild, role }: { guild: AdminGuildDetail; role: OperatorRole | null }) {
  const { t, f } = useI18n()
  const router = useRouter()
  const { settings } = guild
  const canEdit = canOperate(role, "editor")

  return (
    <>
      {guild.suspension && (
        <Notice tone="destructive">
          <span className="font-medium">{t.ops.suspended}</span>
          <span className="block text-muted-foreground">
            {fmt(t.ops.suspendedDetail, {
              date: f.date(guild.suspension.at),
              name: guild.suspension.by?.name ?? t.admin.system,
              reason: guild.suspension.reason,
            })}
          </span>
        </Notice>
      )}
      <GuildActions guild={guild} role={role} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.admin.settingsTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Row label={t.admin.columnStatus}>
                <ReadingStatusBadge status={guild.readingStatus} />
              </Row>
              <Row label={t.admin.readingMode}>{settings.readingMode === "fixed" ? t.general.fixed : t.general.command}</Row>
              <Row label={t.admin.workerMode}>{t.workerMode[workerModeKey[settings.workerMode]]}</Row>
              <Row label={t.admin.fallback}>{settings.fallbackToOfficial ? t.admin.on : t.admin.off}</Row>
              <Row label={t.admin.maxCharacters}>{f.number(settings.maxCharacters)}</Row>
              <Row label={t.admin.defaultVoice}>
                <span className="font-mono text-[11px]">
                  {settings.voice.engine} / {settings.voice.speakerId} / {settings.voice.styleId}
                </span>
              </Row>
              <Row label={t.admin.owner}>
                <span className="font-mono text-[11px]">{guild.ownerId}</span>
              </Row>
              <Row label={t.admin.registeredAt}>{f.date(guild.createdAt)}</Row>
              <Row label={t.admin.columnMembers}>{guild.memberCount === undefined ? t.common.none : f.number(guild.memberCount)}</Row>
              <Row label={t.dictionary.title}>{fmt(t.admin.dictionaryEntries, { count: guild.dictionaryEntries })}</Row>
            </dl>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t.admin.sessions}</CardTitle>
            </CardHeader>
            <CardContent>
              {guild.sessions.length === 0 ? (
                <p className="text-muted-foreground">{t.admin.noSessions}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {guild.sessions.map((s) => (
                    <li key={`${s.textChannelName}:${s.voiceChannelName}`}>
                      #{s.textChannelName} → {s.voiceChannelName}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.admin.connectedWorkers}</CardTitle>
            </CardHeader>
            <CardContent>
              {guild.workers.length === 0 ? (
                <p className="text-muted-foreground">{t.admin.noConnectedWorkers}</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {guild.workers.map((w) => (
                    <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <span className="font-medium">{w.name}</span>
                        {w.ownerName && <span className="block text-muted-foreground">{w.ownerName}</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge variant="outline">{t.workerDetail.scope[w.scope]}</Badge>
                        <WorkerStatusBadge status={w.status} />
                        {canEdit && (
                          <RemoveGuildWorkerButton guildId={guild.id} worker={w} onRemoved={() => router.refresh()} />
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.admin.usage30d}</CardTitle>
          <CardDescription>
            {fmt(t.common.characters, { count: f.number(guild.usage30Days.characters) })} ·{" "}
            {fmt(t.admin.requests, { count: f.number(guild.usage30Days.requests) })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsageBarChart data={guild.usage30Days.daily} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.admin.guildAudit}</CardTitle>
        </CardHeader>
        <CardContent>
          {guild.auditLogs.length === 0 ? (
            <p className="text-muted-foreground">{t.admin.noResults}</p>
          ) : (
            <AuditLogTable entries={guild.auditLogs} showGuild={false} />
          )}
        </CardContent>
      </Card>
    </>
  )
}
