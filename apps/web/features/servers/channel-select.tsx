"use client"

import { SimpleSelect } from "@/components/common/simple-select"
import type { GuildChannel } from "@/types/guild"

/** 指定した種類（Text / Voice）のチャンネルだけを選択肢にする（仕様書 §13） */
export function ChannelSelect({
  id,
  channels,
  type,
  value,
  onChange,
  placeholder,
  invalid,
}: {
  id: string
  channels: GuildChannel[]
  type: GuildChannel["type"]
  value?: string
  onChange: (id: string) => void
  placeholder: string
  invalid?: boolean
}) {
  const options = channels
    .filter((c) => c.type === type)
    .map((c) => ({ value: c.id, label: type === "text" ? `# ${c.name}` : c.name }))
  return (
    <SimpleSelect
      id={id}
      options={options}
      value={value ?? null}
      onValueChange={onChange}
      placeholder={placeholder}
      invalid={invalid}
    />
  )
}
