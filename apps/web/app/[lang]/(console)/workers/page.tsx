import { Suspense } from "react"
import type { Metadata } from "next"
import { PlusIcon } from "@phosphor-icons/react/ssr"

import { CardGridSkeleton, FormSkeleton } from "@/components/common/loading-skeleton"
import { GuardedLink } from "@/components/common/unsaved-changes"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody, PageHeader } from "@/components/layout/page-header"
import { buttonVariants } from "@/components/ui/button"
import { getDictionary } from "@/lib/i18n/server"
import { listWorkers } from "@/services/workers"

import { WorkerList } from "@/features/workers/worker-list"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.workers.title }
}

export default async function WorkersPage() {
  const t = await getDictionary()
  const addButton = (
    <GuardedLink href="/workers/new" className={buttonVariants()}>
      <PlusIcon data-icon="inline-start" />
      {t.workers.add}
    </GuardedLink>
  )
  return (
    <>
      <AppHeader crumbs={[{ label: t.nav.workers }]} />
      <PageBody>
        <PageHeader title={t.workers.title} description={t.workers.description} actions={addButton} />
        <Suspense
          fallback={
            <>
              <CardGridSkeleton count={2} className="xl:grid-cols-3 2xl:grid-cols-4" />
              <FormSkeleton rows={2} />
            </>
          }
        >
          <Workers />
        </Suspense>
      </PageBody>
    </>
  )
}

async function Workers() {
  return <WorkerList initial={await listWorkers()} />
}
