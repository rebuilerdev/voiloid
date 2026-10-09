"use client"

import { SidebarToggle } from "@/components/layout/sidebar-toggle"
import { Separator } from "@/components/ui/separator"

/** error.tsx など Client Component から使う簡易ヘッダー */
export function SimpleHeader({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
      <SidebarToggle />
      <Separator orientation="vertical" className="mr-1 h-4 self-center" />
      <span className="truncate text-xs font-medium">{title}</span>
    </header>
  )
}
