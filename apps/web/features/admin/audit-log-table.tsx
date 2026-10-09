"use client"

import { RelativeTime } from "@/components/common/relative-time"
import { GuardedLink } from "@/components/common/unsaved-changes"
import { useI18n } from "@/components/providers"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { AuditLogEntry } from "@/types/admin"

/** 監査ログの内容（metadata）を 1 行の要約にする */
function summarize(metadata: unknown): string {
  if (metadata === null || metadata === undefined) return ""
  if (typeof metadata !== "object") return String(metadata)
  return Object.entries(metadata as Record<string, unknown>)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" / ")
}

/** 監査ログの表（運営コンソールの概要・サーバー詳細・監査ログで共用） */
export function AuditLogTable({ entries, showGuild = true }: { entries: AuditLogEntry[]; showGuild?: boolean }) {
  const { t, f } = useI18n()
  return (
    <div className="min-w-0 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-36">{t.admin.columnTime}</TableHead>
            <TableHead>{t.admin.columnAction}</TableHead>
            <TableHead>{t.admin.columnActor}</TableHead>
            {showGuild && <TableHead>{t.admin.columnGuild}</TableHead>}
            <TableHead>{t.admin.columnTarget}</TableHead>
            <TableHead>{t.admin.columnDetails}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap" title={f.dateTime(entry.createdAt)}>
                <RelativeTime iso={entry.createdAt} />
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <span className="font-medium">{t.admin.actions[entry.action] ?? entry.action}</span>
                <span className="block font-mono text-[11px] text-muted-foreground">{entry.action}</span>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {entry.actor ? (
                  <>
                    {entry.actor.name}
                    <span className="block font-mono text-[11px] text-muted-foreground">{entry.actor.id}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">{t.admin.system}</span>
                )}
              </TableCell>
              {showGuild && (
                <TableCell className="whitespace-nowrap">
                  {entry.guild ? (
                    <GuardedLink href={`/admin/guilds/${entry.guild.id}`} className="underline-offset-4 hover:underline">
                      {entry.guild.name}
                    </GuardedLink>
                  ) : (
                    t.common.none
                  )}
                </TableCell>
              )}
              <TableCell className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                {entry.targetType}
                {entry.targetId ? `:${entry.targetId}` : ""}
              </TableCell>
              <TableCell className="max-w-80 truncate text-muted-foreground" title={summarize(entry.metadata)}>
                {summarize(entry.metadata) || t.common.none}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
