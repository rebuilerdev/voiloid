import { Suspense } from "react"
import type { Metadata } from "next"

import { FormSkeleton } from "@/components/common/loading-skeleton"
import { getDictionary } from "@/lib/i18n/server"
import { getGuildForPage, orNotFound } from "@/lib/server/loaders"
import { getGuildSettings, listGuildSharedWorkers } from "@/services/guilds"

import { WorkerModeForm } from "@/features/servers/worker-mode-form"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.server.tabs.worker }
}

export default function WorkerSettingPage({ params }: PageProps<"/[lang]/servers/[guildId]/worker">) {
  return (
    <Suspense fallback={<FormSkeleton rows={4} />}>
      <WorkerSetting params={params} />
    </Suspense>
  )
}

async function WorkerSetting({ params }: { params: PageProps<"/[lang]/servers/[guildId]/worker">["params"] }) {
  const { guildId } = await params
  // 403 / 404 は layout が表示する
  if (!(await getGuildForPage(guildId))) return null
  // 選択肢は、このサーバーに「サーバーで共有」された自鯖Worker のみ（仕様書 §28）。自分専用の接続は対象外
  const [settings, allowed] = await orNotFound(Promise.all([getGuildSettings(guildId), listGuildSharedWorkers(guildId)]))

  return <WorkerModeForm key={guildId} guildId={guildId} settings={settings} allowedWorkers={allowed} />
}
