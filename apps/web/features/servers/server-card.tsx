"use client"

import { ArrowSquareOutIcon, GearSixIcon } from "@phosphor-icons/react"

import { StatusBadge } from "@/components/common/status-badge"
import { GuardedLink } from "@/components/common/unsaved-changes"
import { useI18n } from "@/components/providers"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { botInviteUrl } from "@/lib/config"
import { fmt } from "@/lib/i18n/config"
import type { Guild } from "@/types/guild"

import { GuildIcon } from "@/features/servers/guild-icon"
import { BotStatusBadge, ReadingStatusBadge } from "@/features/servers/reading-status-badge"

/** Server Card（仕様書 §9, §10） */
export function ServerCard({ guild }: { guild: Guild }) {
  const { t, f } = useI18n()

  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row items-center gap-3">
        <GuildIcon guild={guild} size="lg" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <CardTitle className="truncate">{guild.name}</CardTitle>
          {guild.memberCount !== undefined && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {fmt(t.common.members, { count: f.number(guild.memberCount) })}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {guild.botInstalled ? (
          <dl className="grid grid-cols-[5rem_1fr] gap-y-1.5">
            <dt className="text-muted-foreground">{t.servers.bot}</dt>
            <dd>
              <BotStatusBadge guild={guild} />
            </dd>
            <dt className="text-muted-foreground">{t.servers.reading}</dt>
            <dd>
              {guild.suspended ? (
                <StatusBadge tone="destructive">{t.ops.suspended}</StatusBadge>
              ) : (
                <ReadingStatusBadge status={guild.readingStatus} />
              )}
            </dd>
            <dt className="text-muted-foreground">{t.servers.voice}</dt>
            <dd className="truncate">{guild.voiceName ?? t.common.none}</dd>
          </dl>
        ) : (
          <div className="flex flex-col gap-1.5">
            <BotStatusBadge guild={guild} />
            <p className="text-muted-foreground">{t.servers.botNotInstalledHint}</p>
          </div>
        )}
      </CardContent>
      <CardFooter className="mt-auto justify-end">
        {guild.botInstalled ? (
          <GuardedLink href={`/servers/${guild.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <GearSixIcon data-icon="inline-start" />
            {t.common.manage}
          </GuardedLink>
        ) : (
          <a
            href={botInviteUrl(guild.id)}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ size: "sm" })}
          >
            {t.servers.addBot}
            <ArrowSquareOutIcon data-icon="inline-end" />
          </a>
        )}
      </CardFooter>
    </Card>
  )
}
