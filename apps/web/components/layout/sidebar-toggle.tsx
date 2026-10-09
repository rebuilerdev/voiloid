"use client"

import { useI18n } from "@/components/providers"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** サイドバー開閉（ショートカット: Ctrl/⌘ + B） */
export function SidebarToggle() {
  const { t } = useI18n()
  return (
    <Tooltip>
      <TooltipTrigger render={<SidebarTrigger className="-ml-1" aria-label={t.nav.toggleSidebar} />} />
      <TooltipContent>{t.nav.toggleSidebar}</TooltipContent>
    </Tooltip>
  )
}
