import { HashIcon, SpeakerHighIcon } from "@phosphor-icons/react/ssr"

import { StatusBadge } from "@/components/common/status-badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import type { Formatters } from "@/lib/format"
import type { GuildDetail } from "@/types/guild"

import { ReadingStatusBadge } from "@/features/servers/reading-status-badge"
import { ServerBots } from "@/features/servers/server-bots"

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 truncate font-heading text-base font-semibold">{children}</CardContent>
    </Card>
  )
}

/** Server Overview（仕様書 §12） */
export function ServerOverview({ guild, t, f }: { guild: GuildDetail; t: Dictionary; f: Formatters }) {
  const o = t.server.overview
  const worker = guild.currentWorkerName === "official" ? t.common.official : guild.currentWorkerName

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={o.readingStatus}>
          <ReadingStatusBadge status={guild.readingStatus} />
        </Stat>
        <Stat label={o.currentVoice}>{guild.voiceName ?? t.common.none}</Stat>
        <Stat label={o.currentWorker}>{worker ?? t.common.none}</Stat>
        <Stat label={o.messagesReadToday}>
          <span className="tabular-nums">{f.number(guild.messagesReadToday)}</span>
        </Stat>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{o.currentSession}</CardTitle>
        </CardHeader>
        <CardContent>
          {guild.session ? (
            <dl className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">{o.textChannel}</dt>
                <dd className="flex items-center gap-1 font-medium">
                  <HashIcon className="size-3.5 text-muted-foreground" aria-hidden />
                  {guild.session.textChannelName}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">{o.voiceChannel}</dt>
                <dd className="flex items-center gap-1 font-medium">
                  <SpeakerHighIcon className="size-3.5 text-muted-foreground" aria-hidden />
                  {guild.session.voiceChannelName}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">{o.sessionStatus}</dt>
                <dd>
                  {guild.session.connected ? (
                    <StatusBadge tone="success">{t.status.connected}</StatusBadge>
                  ) : (
                    <StatusBadge tone="muted">{t.status.notConnected}</StatusBadge>
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <div className="flex items-center gap-3">
              <StatusBadge tone="muted">{t.status.notConnected}</StatusBadge>
              <span className="text-muted-foreground">{o.noSession}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <ServerBots bots={guild.bots} t={t} />
    </div>
  )
}
