import { Suspense } from "react"
import type { Metadata } from "next"

import { FormSkeleton } from "@/components/common/loading-skeleton"
import { getDictionary } from "@/lib/i18n/server"
import { getGuildForPage, orNotFound } from "@/lib/server/loaders"
import { getGuildChannels, getGuildSettings } from "@/services/guilds"

import { GeneralSettingsForm } from "@/features/servers/general-settings-form"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.server.tabs.general }
}

export default function GeneralPage({ params }: PageProps<"/[lang]/servers/[guildId]/general">) {
  return (
    <Suspense fallback={<FormSkeleton rows={6} />}>
      <General params={params} />
    </Suspense>
  )
}

async function General({ params }: { params: PageProps<"/[lang]/servers/[guildId]/general">["params"] }) {
  const { guildId } = await params
  // 403 / 404 は layout が表示する
  if (!(await getGuildForPage(guildId))) return null
  const [settings, channels] = await orNotFound(Promise.all([getGuildSettings(guildId), getGuildChannels(guildId)]))
  return <GeneralSettingsForm key={guildId} guildId={guildId} settings={settings} channels={channels} />
}
