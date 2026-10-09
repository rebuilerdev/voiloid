"use client"

import { SpinnerGapIcon } from "@phosphor-icons/react"

import { useI18n } from "@/components/providers"
import { Button } from "@/components/ui/button"

export function LoadMore({ visible, loading, onClick }: { visible: boolean; loading: boolean; onClick: () => void }) {
  const { t } = useI18n()
  if (!visible) return null
  return (
    <div className="flex justify-center pt-2">
      <Button variant="outline" onClick={onClick} disabled={loading}>
        {loading && <SpinnerGapIcon className="animate-spin" />}
        {t.admin.loadMore}
      </Button>
    </div>
  )
}
