"use client"

import { useEffect } from "react"
import { ArrowClockwiseIcon } from "@phosphor-icons/react"

import { ErrorState } from "@/components/common/error-state"
import { SimpleHeader } from "@/components/layout/simple-header"
import { useI18n } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { fmt } from "@/lib/i18n/config"
import type { Dictionary } from "@/lib/i18n/dictionaries"

export type RouteErrorProps = { error: Error & { digest?: string }; retry: () => void }

/** error.tsx 用の表示: 「〇〇の読み込みに失敗しました [再試行]」（仕様書 §53） */
export function RouteError({
  error,
  retry,
  resource,
  header,
}: RouteErrorProps & {
  resource: keyof Dictionary["resources"]
  /** ページ全体が置き換わる場合はヘッダーを出す（ナビゲーション名のキー） */
  header?: keyof Dictionary["nav"]
}) {
  const { t } = useI18n()

  useEffect(() => {
    // 詳細は開発者向けにのみ出力し、画面には出さない
    console.error(error)
  }, [error])

  const state = (
    <ErrorState
      title={fmt(t.errors.loadFailed, { resource: t.resources[resource] })}
      description={t.errors.loadFailedHint}
      action={
        <Button variant="outline" onClick={() => retry()}>
          <ArrowClockwiseIcon data-icon="inline-start" />
          {t.common.retry}
        </Button>
      }
    />
  )

  if (!header) return state
  return (
    <>
      <SimpleHeader title={t.nav[header]} />
      {state}
    </>
  )
}
