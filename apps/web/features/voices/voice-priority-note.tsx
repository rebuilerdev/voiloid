"use client"

import { InfoIcon } from "@phosphor-icons/react"

import { useI18n } from "@/components/providers"

/** 読み上げる声の決まり方: 1. メンバーのマイボイス → 2. サーバーのデフォルト音声 */
export function VoicePriorityNote() {
  const { t } = useI18n()
  return (
    <div className="flex items-start gap-2 bg-muted/40 p-3 text-xs">
      <InfoIcon className="mt-px size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex flex-col gap-1.5">
        <span className="font-medium">{t.voicePriority.title}</span>
        <ol className="list-inside list-decimal text-muted-foreground">
          <li>{t.voicePriority.member}</li>
          <li>{t.voicePriority.server}</li>
        </ol>
        <p className="text-muted-foreground">{t.voicePriority.fallback}</p>
      </div>
    </div>
  )
}
