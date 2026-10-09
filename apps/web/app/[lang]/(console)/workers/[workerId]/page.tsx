import { Suspense } from "react"
import type { Metadata } from "next"

import { FormSkeleton, StatCardsSkeleton } from "@/components/common/loading-skeleton"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { getDictionary } from "@/lib/i18n/server"
import { orNotFound } from "@/lib/server/loaders"
import { getWorker, getWorkerGuilds } from "@/services/workers"

import { WorkerDetailView } from "@/features/workers/worker-detail-view"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.workers.title }
}

/** 自鯖Worker のみ。公式Worker の ID は API が 404 を返す（ユーザー決定） */
export default async function WorkerDetailPage({ params }: PageProps<"/[lang]/workers/[workerId]">) {
  const t = await getDictionary()
  return (
    <Suspense
      fallback={
        <>
          <AppHeader crumbs={[{ label: t.nav.workers, href: "/workers" }, { label: "…" }]} />
          <PageBody>
            <Skeleton className="h-10 w-56" />
            <StatCardsSkeleton count={2} />
            <FormSkeleton rows={3} />
          </PageBody>
        </>
      }
    >
      <Detail params={params} />
    </Suspense>
  )
}

async function Detail({ params }: { params: PageProps<"/[lang]/workers/[workerId]">["params"] }) {
  const { workerId } = await params
  const t = await getDictionary()
  const [worker, permissions] = await orNotFound(Promise.all([getWorker(workerId), getWorkerGuilds(workerId)]))

  return (
    <>
      <AppHeader crumbs={[{ label: t.nav.workers, href: "/workers" }, { label: worker.name }]} />
      <PageBody>
        <WorkerDetailView key={worker.id} initial={worker} permissions={permissions} />
      </PageBody>
    </>
  )
}
