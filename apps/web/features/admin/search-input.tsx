"use client"

import { MagnifyingGlassIcon } from "@phosphor-icons/react"

import { useI18n } from "@/components/providers"
import { Input } from "@/components/ui/input"

export function SearchInput({ value, onChange, label }: { value: string; onChange: (value: string) => void; label?: string }) {
  const { t } = useI18n()
  return (
    <div className="relative max-w-sm">
      <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t.admin.searchPlaceholder}
        aria-label={label ?? t.admin.searchPlaceholder}
        className="pl-8"
      />
    </div>
  )
}
