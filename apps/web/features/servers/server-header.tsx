import { ArrowSquareOutIcon, WarningIcon } from "@phosphor-icons/react/ssr"

import { Notice } from "@/components/common/notice"
import { buttonVariants } from "@/components/ui/button"
import { botInviteUrl } from "@/lib/config"
import { fmt } from "@/lib/i18n/config"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import type { Formatters } from "@/lib/format"
import type { GuildDetail } from "@/types/guild"

import { GuildIcon } from "@/features/servers/guild-icon"
import { BotStatusBadge } from "@/features/servers/reading-status-badge"

/** Server Header（仕様書 §11） */
export function ServerHeader({ guild, t, f }: { guild: GuildDetail; t: Dictionary; f: Formatters }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <GuildIcon guild={guild} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate font-heading text-lg font-semibold">{guild.name}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {guild.memberCount !== undefined && (
              <span className="tabular-nums">{fmt(t.common.members, { count: f.number(guild.memberCount) })}</span>
            )}
            <BotStatusBadge guild={guild} />
          </div>
        </div>
      </div>
      {/* 利用停止中のサーバーは運営者だけが開ける（サーバー管理者には 403） */}
      {guild.suspended && (
        <Notice tone="destructive">
          <span className="font-medium">{t.ops.guildSuspendedBanner}</span>
          <span className="block text-muted-foreground">{t.ops.guildSuspendedOperator}</span>
        </Notice>
      )}
      {!guild.botInstalled && (
        <div className="flex flex-wrap items-center gap-3 border-l-2 border-warning bg-muted/40 p-3 text-xs">
          <WarningIcon weight="fill" className="size-4 text-warning" aria-hidden />
          <span className="flex-1">{t.server.botNotInstalledBanner}</span>
          <a href={botInviteUrl(guild.id)} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm" })}>
            {t.servers.addBot}
            <ArrowSquareOutIcon data-icon="inline-end" />
          </a>
        </div>
      )}
    </div>
  )
}
