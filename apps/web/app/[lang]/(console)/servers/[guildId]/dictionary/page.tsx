import { Suspense } from "react"
import type { Metadata } from "next"

import { TableSkeleton } from "@/components/common/loading-skeleton"
import { PageHeader } from "@/components/layout/page-header"
import { getDictionary } from "@/lib/i18n/server"
import { getGuildForPage, orNotFound } from "@/lib/server/loaders"
import { listDictionary } from "@/services/dictionary"

import { DictionaryManager } from "@/features/dictionary/dictionary-manager"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.server.tabs.dictionary }
}

export default async function DictionaryPage({ params }: PageProps<"/[lang]/servers/[guildId]/dictionary">) {
  const t = await getDictionary()
  return (
    <>
      <PageHeader title={t.dictionary.title} description={t.dictionary.description} />
      <Suspense fallback={<TableSkeleton rows={5} columns={4} />}>
        <Dictionary params={params} />
      </Suspense>
    </>
  )
}

async function Dictionary({ params }: { params: PageProps<"/[lang]/servers/[guildId]/dictionary">["params"] }) {
  const { guildId } = await params
  // 403 / 404 は layout が表示する
  if (!(await getGuildForPage(guildId))) return null
  const entries = await orNotFound(listDictionary(guildId))
  return <DictionaryManager key={guildId} guildId={guildId} initial={entries} />
}
