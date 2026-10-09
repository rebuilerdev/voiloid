import { Suspense } from "react"
import type { Metadata } from "next"

import { FormSkeleton } from "@/components/common/loading-skeleton"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody, PageHeader } from "@/components/layout/page-header"
import { getDictionary } from "@/lib/i18n/server"
import { getCurrentUser } from "@/lib/server/current-user"
import { listMyGuilds } from "@/services/me"
import { listVoices } from "@/services/voices"

import { AccountCard } from "@/features/settings/account-card"
import { AppearanceForm } from "@/features/settings/appearance-form"
import { MyVoiceForm } from "@/features/settings/my-voice-form"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.settings.title }
}

/** Settings（仕様書 §47）: Account / マイボイス（Default Voice）/ Appearance */
export default async function SettingsPage() {
  const t = await getDictionary()
  return (
    <>
      <AppHeader crumbs={[{ label: t.nav.settings }]} />
      <PageBody>
        <PageHeader title={t.settings.title} description={t.settings.description} />
        <Suspense fallback={<FormSkeleton rows={2} />}>
          <Account />
        </Suspense>
        <Suspense fallback={<FormSkeleton rows={5} />}>
          <MyVoice />
        </Suspense>
        <AppearanceForm />
      </PageBody>
    </>
  )
}

async function Account() {
  const [t, user] = await Promise.all([getDictionary(), getCurrentUser()])
  return <AccountCard user={user} t={t} />
}

async function MyVoice() {
  const [user, voices, guilds] = await Promise.all([getCurrentUser(), listVoices(), listMyGuilds()])
  return <MyVoiceForm initial={user.voice} voices={voices} guilds={guilds} />
}
