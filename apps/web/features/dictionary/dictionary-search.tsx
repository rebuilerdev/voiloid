"use client"

import { MagnifyingGlassIcon } from "@phosphor-icons/react"

import { useI18n } from "@/components/providers"
import { Input } from "@/components/ui/input"

export function DictionarySearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n()
  return (
    <div className="relative w-full sm:max-w-xs">
      <MagnifyingGlassIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t.dictionary.searchPlaceholder}
        aria-label={t.dictionary.searchPlaceholder}
        className="pl-8"
      />
    </div>
  )
}
