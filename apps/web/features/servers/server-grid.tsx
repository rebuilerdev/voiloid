"use client"

import { useState } from "react"
import { DiscordLogoIcon, MagnifyingGlassIcon } from "@phosphor-icons/react"

import { EmptyState } from "@/components/common/empty-state"
import { useI18n } from "@/components/providers"
import { Input } from "@/components/ui/input"
import { fmt } from "@/lib/i18n/config"
import type { Guild } from "@/types/guild"

import { ServerCard } from "@/features/servers/server-card"

export function ServerGrid({ guilds }: { guilds: Guild[] }) {
  const { t } = useI18n()
  const [query, setQuery] = useState("")

  if (guilds.length === 0) {
    return <EmptyState icon={<DiscordLogoIcon />} title={t.servers.emptyTitle} description={t.servers.emptyDescription} />
  }

  const q = query.trim().toLowerCase()
  // Bot 導入済みを先に並べる
  const shown = guilds
    .filter((g) => !q || g.name.toLowerCase().includes(q))
    .sort((a, b) => Number(b.botInstalled) - Number(a.botInstalled))

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full max-w-xs">
        <MagnifyingGlassIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.servers.searchPlaceholder}
          aria-label={t.servers.searchPlaceholder}
          className="pl-8"
        />
      </div>
      {shown.length === 0 ? (
        <p className="py-12 text-center text-xs text-muted-foreground">{fmt(t.servers.noMatch, { query })}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {shown.map((g) => (
            <ServerCard key={g.id} guild={g} />
          ))}
        </div>
      )}
    </div>
  )
}
