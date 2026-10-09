"use client"

import { Suspense } from "react"
import { usePathname } from "next/navigation"

import { useI18n } from "@/components/providers"
import { stripLocale } from "@/lib/i18n/path"

const segments = ["general", "voice", "dictionary", "worker", "profile"] as const

function Label() {
  const { t } = useI18n()
  const last = stripLocale(usePathname()).split("/").at(-1)
  const tab = segments.find((s) => s === last) ?? "overview"
  return <>{t.server.tabs[tab]}</>
}

/** パンくずの末尾: 現在のタブ名（Servers / サーバー名 / Voice） */
export function ServerTabCrumb() {
  return (
    <Suspense fallback={null}>
      <Label />
    </Suspense>
  )
}
