import { Suspense } from "react"
import type { Metadata } from "next"

import { FormSkeleton } from "@/components/common/loading-skeleton"
import { getDictionary } from "@/lib/i18n/server"
import { getGuildForPage, orNotFound } from "@/lib/server/loaders"
import { getGuildSettings } from "@/services/guilds"
import { listVoices } from "@/services/voices"

import { GuildEngineSettings } from "@/features/servers/guild-engine-settings"
import { GuildVoiceForm } from "@/features/servers/guild-voice-form"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.server.tabs.voice }
}

export default function VoicePage({ params }: PageProps<"/[lang]/servers/[guildId]/voice">) {
  return (
    <Suspense
      fallback={
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <FormSkeleton rows={5} />
          <FormSkeleton rows={2} />
        </div>
      }
    >
      <Voice params={params} />
    </Suspense>
  )
}

async function Voice({ params }: { params: PageProps<"/[lang]/servers/[guildId]/voice">["params"] }) {
  const { guildId } = await params
  // 403 / 404 は layout が表示する
  const guild = await getGuildForPage(guildId)
  if (!guild) return null
  const [settings, voices] = await orNotFound(Promise.all([getGuildSettings(guildId), listVoices()]))
  return (
    <div className="flex flex-col gap-4">
      <GuildVoiceForm
        key={guildId}
        guildId={guildId}
        voice={settings.voice}
        voices={voices}
        availableEngines={guild.availableEngines}
      />
      <GuildEngineSettings
        key={`${guildId}:${settings.disabledEngines.join()}`}
        guildId={guildId}
        disabledEngines={settings.disabledEngines}
        defaultEngine={settings.voice.engine}
        availableEngines={guild.availableEngines}
      />
    </div>
  )
}
