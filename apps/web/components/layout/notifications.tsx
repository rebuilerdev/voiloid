"use client"

import { BellIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react"

import { GuardedLink } from "@/components/common/unsaved-changes"
import { useI18n } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { usePolling } from "@/hooks/use-polling"
import { fmt } from "@/lib/i18n/config"
import { listWorkers } from "@/services/workers"
import type { Worker } from "@/types/worker"

import { privateWorkers, summarizeOfficial } from "@/features/workers/utils"

type Notice = { id: string; level: "error" | "warning"; message: string; href: string }

/**
 * ヘッダーの通知。専用 API は無いため、Worker 一覧から状態の異常を導出する。
 */
export function Notifications() {
  const { t } = useI18n()
  const [workers] = usePolling<Worker[] | null>(listWorkers, null, { immediate: true })

  const notices: Notice[] = []
  if (workers) {
    for (const w of privateWorkers(workers)) {
      if (w.status === "offline")
        notices.push({ id: w.id, level: "error", message: fmt(t.notifications.workerOffline, { name: w.name }), href: `/workers/${w.id}` })
      if (w.status === "error")
        notices.push({ id: w.id, level: "error", message: fmt(t.notifications.workerError, { name: w.name }), href: `/workers/${w.id}` })
    }
    const official = summarizeOfficial(workers)
    if (official.total > 0 && !official.allUp)
      notices.push({ id: "official", level: "warning", message: t.notifications.officialDegraded, href: "/workers" })
  }

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative"
                  aria-label={notices.length ? `${t.header.notifications} (${notices.length})` : t.header.notifications}
                />
              }
            />
          }
        >
          <BellIcon />
          {notices.length > 0 && (
            <span className="absolute top-1 right-1 flex min-w-3.5 items-center justify-center bg-destructive px-0.5 text-[10px] leading-3.5 font-semibold text-white tabular-nums">
              {notices.length}
            </span>
          )}
        </TooltipTrigger>
        <TooltipContent>{t.header.notifications}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <PopoverTitle className="border-b px-3 py-2 text-xs font-medium">{t.header.notifications}</PopoverTitle>
        {notices.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t.header.noNotifications}</p>
        ) : (
          <ul className="flex flex-col">
            {notices.map((n) => {
              const Icon = n.level === "error" ? XCircleIcon : WarningCircleIcon
              return (
                <li key={n.id} className="border-b last:border-b-0">
                  <GuardedLink href={n.href} className="flex gap-2 px-3 py-2.5 text-xs hover:bg-muted">
                    <Icon
                      weight="fill"
                      aria-hidden
                      className={n.level === "error" ? "mt-0.5 size-4 shrink-0 text-destructive" : "mt-0.5 size-4 shrink-0 text-warning"}
                    />
                    {n.message}
                  </GuardedLink>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
