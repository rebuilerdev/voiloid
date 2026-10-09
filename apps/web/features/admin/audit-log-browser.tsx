"use client"

import { useState } from "react"
import { ListMagnifyingGlassIcon } from "@phosphor-icons/react"

import { EmptyState } from "@/components/common/empty-state"
import { SimpleSelect } from "@/components/common/simple-select"
import { useI18n } from "@/components/providers"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCursorList } from "@/hooks/use-cursor-list"
import { listAuditLogs } from "@/services/admin"
import type { AuditLogEntry, Page } from "@/types/admin"

import { AuditLogTable } from "@/features/admin/audit-log-table"
import { LoadMore } from "@/features/admin/load-more"

const ALL = "all"
const SNOWFLAKE = /^\d{17,20}$/

/** 監査ログ（運営者のみ）。操作の種類・サーバーで絞り込む */
export function AuditLogBrowser({ initial, initialGuildId = "" }: { initial: Page<AuditLogEntry>; initialGuildId?: string }) {
  const { t } = useI18n()
  const [action, setAction] = useState(ALL)
  const [guildId, setGuildId] = useState(initialGuildId)
  // 入力途中の ID では絞り込まない
  const validGuildId = SNOWFLAKE.test(guildId.trim()) ? guildId.trim() : undefined
  const list = useCursorList(
    initial,
    (filter, cursor) => listAuditLogs({ ...filter, cursor }),
    { action: action === ALL ? undefined : action, guildId: validGuildId },
  )

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[16rem_16rem]">
        <Field>
          <FieldLabel htmlFor="audit-action">{t.admin.filterAction}</FieldLabel>
          <SimpleSelect
            id="audit-action"
            value={action}
            onValueChange={setAction}
            options={[
              { value: ALL, label: t.admin.actionAll },
              ...Object.entries(t.admin.actionGroups).map(([value, label]) => ({ value, label })),
            ]}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="audit-guild">{t.admin.filterGuild}</FieldLabel>
          <Input
            id="audit-guild"
            inputMode="numeric"
            value={guildId}
            onChange={(e) => setGuildId(e.target.value)}
            placeholder={t.admin.filterGuildPlaceholder}
          />
        </Field>
      </div>
      <Card>
        <CardContent>
          {list.items.length === 0 ? (
            <EmptyState icon={<ListMagnifyingGlassIcon />} title={t.admin.noResults} />
          ) : (
            <AuditLogTable entries={list.items} />
          )}
          <LoadMore visible={list.nextCursor !== null} loading={list.loading} onClick={list.loadMore} />
        </CardContent>
      </Card>
    </>
  )
}
