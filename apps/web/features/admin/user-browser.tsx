"use client"

import { useState } from "react"
import { UsersThreeIcon } from "@phosphor-icons/react"

import { EmptyState } from "@/components/common/empty-state"
import { GuardedLink } from "@/components/common/unsaved-changes"
import { RelativeTime } from "@/components/common/relative-time"
import { StatusBadge } from "@/components/common/status-badge"
import { useI18n } from "@/components/providers"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCursorList } from "@/hooks/use-cursor-list"
import { listAdminUsers } from "@/services/admin"
import type { AdminUser, Page } from "@/types/admin"

import { LoadMore } from "@/features/admin/load-more"
import { SearchInput } from "@/features/admin/search-input"

/** ユーザーの一覧（運営者のみ） */
export function UserBrowser({ initial }: { initial: Page<AdminUser> }) {
  const { t, f } = useI18n()
  const [query, setQuery] = useState("")
  const list = useCursorList(initial, ({ query }, cursor) => listAdminUsers({ query, cursor }), { query })

  return (
    <>
      <SearchInput value={query} onChange={setQuery} />
      <Card>
        <CardContent>
          {list.items.length === 0 ? (
            <EmptyState icon={<UsersThreeIcon />} title={t.admin.noResults} />
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.admin.columnUser}</TableHead>
                    <TableHead>{t.admin.columnUserId}</TableHead>
                    <TableHead className="text-right">{t.admin.columnWorkers}</TableHead>
                    <TableHead>{t.admin.columnVoice}</TableHead>
                    <TableHead>{t.admin.columnRegistered}</TableHead>
                    <TableHead>{t.admin.columnUpdated}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.items.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar size="sm">
                            {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt="" />}
                            <AvatarFallback>{u.displayName.slice(0, 1)}</AvatarFallback>
                          </Avatar>
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-1.5 font-medium">
                              <GuardedLink href={`/admin/users/${u.id}`} className="underline-offset-4 hover:underline">
                                {u.displayName}
                              </GuardedLink>
                              {u.isOperator && <Badge>{t.admin.operator}</Badge>}
                              {u.suspended && <StatusBadge tone="destructive">{t.ops.suspended}</StatusBadge>}
                            </span>
                            <span className="block text-muted-foreground">@{u.username}</span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">{u.id}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.number(u.privateWorkers)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={u.hasVoice ? "success" : "muted"}>
                          {u.hasVoice ? t.admin.voiceSet : t.admin.voiceUnset}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{f.date(u.createdAt)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <RelativeTime iso={u.updatedAt} />
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
