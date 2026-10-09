"use client"

import { StatusBadge, type StatusTone } from "@/components/common/status-badge"
import { useI18n } from "@/components/providers"
import type { Guild, ReadingStatus } from "@/types/guild"

const tone: Record<ReadingStatus, StatusTone> = { active: "success", idle: "muted", disabled: "muted" }

/** 読み上げ状態: Active / Idle / Disabled */
export function ReadingStatusBadge({ status }: { status?: ReadingStatus }) {
  const { t } = useI18n()
  if (!status) return <span className="text-xs text-muted-foreground">{t.common.none}</span>
  return (
    <StatusBadge tone={tone[status]} iconOnlyColor={status !== "active"}>
      {t.status[status]}
    </StatusBadge>
  )
}

/** Bot の導入・稼働状態 */
export function BotStatusBadge({ guild }: { guild: Pick<Guild, "botInstalled" | "botStatus"> }) {
  const { t } = useI18n()
  if (!guild.botInstalled) return <StatusBadge tone="muted">{t.status.botNotInstalled}</StatusBadge>
  return guild.botStatus === "offline" ? (
    <StatusBadge tone="destructive">{t.status.botOffline}</StatusBadge>
  ) : (
    <StatusBadge tone="success">{t.status.botOnline}</StatusBadge>
  )
}
