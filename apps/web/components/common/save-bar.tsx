"use client"

import { SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react"

import { useI18n } from "@/components/providers"
import { Button } from "@/components/ui/button"

/**
 * 画面下部に固定表示する保存バー（仕様書 §79）。変更がある時だけ表示する。
 * 親の <form> の submit で保存する。
 */
export function SaveBar({
  dirty,
  saving,
  onDiscard,
  disabled,
}: {
  dirty: boolean
  saving: boolean
  onDiscard: () => void
  /** 入力エラーがある場合など */
  disabled?: boolean
}) {
  const { t } = useI18n()
  if (!dirty) return null
  return (
    <div
      role="region"
      aria-label={t.common.unsavedChanges}
      className="sticky bottom-0 z-20 -mx-4 mt-auto border-t bg-background/95 px-4 py-3 backdrop-blur animate-in fade-in slide-in-from-bottom-2 md:-mx-6 md:px-6"
    >
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <WarningCircleIcon weight="fill" className="size-4 text-warning" />
          {t.common.unsavedChanges}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDiscard} disabled={saving}>
            {t.common.discard}
          </Button>
          <Button type="submit" disabled={saving || disabled}>
            {saving && <SpinnerGapIcon className="animate-spin" />}
            {saving ? t.common.saving : t.common.saveChanges}
          </Button>
        </div>
      </div>
    </div>
  )
}
