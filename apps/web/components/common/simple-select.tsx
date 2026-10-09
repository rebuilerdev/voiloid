"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export type SelectOption = { value: string; label: string; disabled?: boolean }

/** 文字列値の単一選択（Base UI Select の定型をまとめたもの） */
export function SimpleSelect({
  id,
  options,
  value,
  onValueChange,
  placeholder,
  disabled,
  invalid,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string
  options: SelectOption[]
  value: string | null
  onValueChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  "aria-label"?: string
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(v) => v !== null && onValueChange(v)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        className={cn("w-full", className)}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
