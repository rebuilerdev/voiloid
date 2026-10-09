import { Suspense } from "react"
import type { Metadata } from "next"

import { StatCardsSkeleton } from "@/components/common/loading-skeleton"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody, PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { getDictionary } from "@/lib/i18n/server"
import { getUsage } from "@/services/usage"

import { UsageView } from "@/features/usage/usage-view"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.usage.title }
}

export default async function UsagePage() {
  const t = await getDictionary()
  return (
    <>
      <AppHeader crumbs={[{ label: t.nav.usage }]} />
      <PageBody>
        <PageHeader title={t.usage.title} description={t.usage.description} />
        <Suspense
          fallback={
            <>
              <Skeleton className="h-8 w-48" />
              <StatCardsSkeleton />
              <Skeleton className="h-72 w-full" />
            </>
          }
        >
          <Usage />
        </Suspense>
      </PageBody>
    </>
  )
}

async function Usage() {
  return <UsageView initial={await getUsage("7d")} />
}
