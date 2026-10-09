"use client"

import { useState } from "react"
import { DiscordLogoIcon } from "@phosphor-icons/react"

import { EmptyState } from "@/components/common/empty-state"
import { RelativeTime } from "@/components/common/relative-time"
import { StatusBadge } from "@/components/common/status-badge"
import { GuardedLink } from "@/components/common/unsaved-changes"
import { useI18n } from "@/components/providers"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCursorList } from "@/hooks/use-cursor-list"
import { listAdminGuilds } from "@/services/admin"
import type { AdminGuild, Page } from "@/types/admin"

import { LoadMore } from "@/features/admin/load-more"
import { SearchInput } from "@/features/admin/search-input"
import { GuildIcon } from "@/features/servers/guild-icon"
import { ReadingStatusBadge } from "@/features/servers/reading-status-badge"

/** 全サーバーの一覧（運営者のみ）。名前・ID で検索できる */
export function GuildBrowser({ initial }: { initial: Page<AdminGuild> }) {
  const { t, f } = useI18n()
  const [query, setQuery] = useState("")
  const list = useCursorList(initial, ({ query }, cursor) => listAdminGuilds({ query, cursor }), { query })

  return (
    <>
      <SearchInput value={query} onChange={setQuery} />
      <Card>
        <CardContent>
          {list.items.length === 0 ? (
            <EmptyState icon={<DiscordLogoIcon />} title={t.admin.noResults} />
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.admin.columnGuild}</TableHead>
                    <TableHead>{t.admin.columnBot}</TableHead>
                    <TableHead>{t.admin.columnStatus}</TableHead>
                    <TableHead className="text-right">{t.admin.columnMembers}</TableHead>
                    <TableHead className="text-right">{t.admin.columnToday}</TableHead>
                    <TableHead>{t.admin.columnLastActive}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.items.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell>
                        <GuardedLink href={`/admin/guilds/${g.id}`} className="flex items-center gap-2 font-medium underline-offset-4 hover:underline">
                          <GuildIcon guild={g} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate">{g.name}</span>
                            <span className="block font-mono text-[11px] font-normal text-muted-foreground">{g.id}</span>
                          </span>
                        </GuardedLink>
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge tone={g.botInstalled ? "success" : "muted"}>
                            {g.botInstalled ? t.admin.installed : t.admin.removed}
                          </StatusBadge>
                          {g.suspended && <StatusBadge tone="destructive">{t.ops.suspended}</StatusBadge>}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ReadingStatusBadge status={g.readingStatus} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {g.memberCount === undefined ? t.common.none : f.number(g.memberCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{f.number(g.messagesToday)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {g.lastActiveAt ? <RelativeTime iso={g.lastActiveAt} /> : t.common.none}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <LoadMore visible={list.nextCursor !== null} loading={list.loading} onClick={list.loadMore} />
        </CardContent>
      </Card>
    </>
  )
}
