"use client"

import { Suspense } from "react"
import { usePathname } from "next/navigation"
import {
  BookOpenTextIcon,
  CpuIcon,
  IdentificationCardIcon,
  InfoIcon,
  SlidersHorizontalIcon,
  WaveformIcon,
} from "@phosphor-icons/react"

import { GuardedLink } from "@/components/common/unsaved-changes"
import { useI18n } from "@/components/providers"
import { stripLocale } from "@/lib/i18n/path"
import { cn } from "@/lib/utils"

const tabs = [
  { segment: "", key: "overview", icon: InfoIcon },
  { segment: "general", key: "general", icon: SlidersHorizontalIcon },
  { segment: "voice", key: "voice", icon: WaveformIcon },
  { segment: "dictionary", key: "dictionary", icon: BookOpenTextIcon },
  { segment: "worker", key: "worker", icon: CpuIcon },
  { segment: "profile", key: "profile", icon: IdentificationCardIcon },
] as const

function Tabs({ guildId, pathname }: { guildId: string; pathname: string | null }) {
  const { t } = useI18n()
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label={t.server.navLabel}>
      {tabs.map((tab) => {
        const href = tab.segment ? `/servers/${guildId}/${tab.segment}` : `/servers/${guildId}`
        const active = pathname === href
        return (
          <GuardedLink
            key={tab.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon weight={active ? "fill" : "regular"} className="size-4" />
            {t.server.tabs[tab.key]}
          </GuardedLink>
        )
      })}
    </nav>
  )
}

function ActiveTabs({ guildId }: { guildId: string }) {
  return <Tabs guildId={guildId} pathname={stripLocale(usePathname())} />
}

/** サブナビ: Overview / General / Voice / Dictionary / Worker（仕様書 §11）/ Profile */
export function ServerNavigation({ guildId }: { guildId: string }) {
  return (
    <Suspense fallback={<Tabs guildId={guildId} pathname={null} />}>
      <ActiveTabs guildId={guildId} />
    </Suspense>
  )
}
