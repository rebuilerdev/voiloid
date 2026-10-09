import { ArrowRightIcon, DiscordLogoIcon } from "@phosphor-icons/react/ssr"

import { EmptyState } from "@/components/common/empty-state"
import { GuardedLink } from "@/components/common/unsaved-changes"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import type { Guild } from "@/types/guild"

import { GuildIcon } from "@/features/servers/guild-icon"
import { ReadingStatusBadge } from "@/features/servers/reading-status-badge"

/** Recent Servers（仕様書 §7）。行クリックで Server Detail へ */
export function RecentServers({ guilds, t }: { guilds: Guild[]; t: Dictionary }) {
  const recent = guilds.filter((g) => g.botInstalled).slice(0, 5)

  return (
    <Card className="pb-0 lg:col-span-2">
      <CardHeader>
        <CardTitle>{t.dashboard.recentServers}</CardTitle>
        <CardDescription>{t.dashboard.recentServersHint}</CardDescription>
        <CardAction>
          <GuardedLink href="/servers" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {t.common.viewAll}
            <ArrowRightIcon data-icon="inline-end" />
          </GuardedLink>
        </CardAction>
      </CardHeader>
      <CardContent className="border-t px-0">
        {recent.length === 0 ? (
          <EmptyState
            icon={<DiscordLogoIcon />}
            title={t.dashboard.noServersTitle}
            description={t.dashboard.noServersDescription}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[420px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">{t.dashboard.columnServer}</TableHead>
                  <TableHead>{t.dashboard.columnStatus}</TableHead>
                  <TableHead className="pr-4">{t.dashboard.columnVoice}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((g) => (
                  <TableRow key={g.id} className="relative">
                    <TableCell className="pl-4">
                      <GuardedLink
                        href={`/servers/${g.id}`}
                        className="flex items-center gap-2 font-medium after:absolute after:inset-0"
                      >
                        <GuildIcon guild={g} size="sm" />
                        <span className="truncate">{g.name}</span>
                      </GuardedLink>
                    </TableCell>
                    <TableCell>
                      <ReadingStatusBadge status={g.readingStatus} />
                    </TableCell>
                    <TableCell className="pr-4">{g.voiceName ?? t.common.none}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
