import { Suspense } from "react"
import type { Metadata } from "next"

import { StatCardsSkeleton } from "@/components/common/loading-skeleton"
import { getDictionary, getI18n } from "@/lib/i18n/server"
import { getGuildForPage } from "@/lib/server/loaders"

import { ServerOverview } from "@/features/servers/server-overview"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.server.tabs.overview }
}

export default function OverviewPage({ params }: PageProps<"/[lang]/servers/[guildId]">) {
  return (
    <Suspense fallback={<StatCardsSkeleton />}>
      <Overview params={params} />
    </Suspense>
  )
}

async function Overview({ params }: { params: PageProps<"/[lang]/servers/[guildId]">["params"] }) {
  const { guildId } = await params
  const [{ t, f }, guild] = await Promise.all([getI18n(), getGuildForPage(guildId)])
  if (!guild) return null
  return <ServerOverview guild={guild} t={t} f={f} />
}
