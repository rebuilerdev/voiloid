import { Suspense } from "react"
import type { Metadata } from "next"

import { CardGridSkeleton } from "@/components/common/loading-skeleton"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody, PageHeader } from "@/components/layout/page-header"
import { getDictionary } from "@/lib/i18n/server"
import { listVoices } from "@/services/voices"

import { VoiceBrowser } from "@/features/voices/voice-browser"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.voices.title }
}

export default async function VoicesPage() {
  const t = await getDictionary()
  return (
    <>
      <AppHeader crumbs={[{ label: t.nav.voices }]} />
      <PageBody>
        <PageHeader title={t.voices.title} description={t.voices.description} />
        <Suspense fallback={<CardGridSkeleton count={6} />}>
          <Voices />
        </Suspense>
      </PageBody>
    </>
  )
}

async function Voices() {
  return <VoiceBrowser voices={await listVoices()} />
}
