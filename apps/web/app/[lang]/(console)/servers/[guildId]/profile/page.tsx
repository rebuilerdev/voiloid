import { Suspense } from "react"
import type { Metadata } from "next"

import { FormSkeleton } from "@/components/common/loading-skeleton"
import { getDictionary } from "@/lib/i18n/server"
import { getGuildForPage, orNotFound } from "@/lib/server/loaders"
import { getGuildBotProfile } from "@/services/guilds"

import { BotProfileForm } from "@/features/servers/bot-profile-form"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.server.tabs.profile }
}

export default function ProfilePage({ params }: PageProps<"/[lang]/servers/[guildId]/profile">) {
  return (
    <Suspense
      fallback={
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <FormSkeleton rows={3} />
          <FormSkeleton rows={1} />
        </div>
      }
    >
      <Profile params={params} />
    </Suspense>
  )
}

async function Profile({ params }: { params: PageProps<"/[lang]/servers/[guildId]/profile">["params"] }) {
  const { guildId } = await params
  // 403 / 404 は layout が表示する
  if (!(await getGuildForPage(guildId))) return null
  const profile = await orNotFound(getGuildBotProfile(guildId))
  return <BotProfileForm key={guildId} guildId={guildId} profile={profile} />
}
