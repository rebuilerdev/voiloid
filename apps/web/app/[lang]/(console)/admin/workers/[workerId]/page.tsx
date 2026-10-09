import { Suspense } from "react"
import type { Metadata } from "next"

import { FormSkeleton } from "@/components/common/loading-skeleton"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody } from "@/components/layout/page-header"
import { getDictionary } from "@/lib/i18n/server"
import { getCurrentUser } from "@/lib/server/current-user"
import { orNotFound } from "@/lib/server/loaders"
import { getAdminWorker } from "@/services/admin"
import { canOperate } from "@/types/admin"

import { AdminWorkerDetail } from "@/features/admin/admin-worker-detail"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.ops.workersTitle }
}

/** Worker の詳細（運営者）。公式Worker・自鯖Worker の両方を表示する */
export default async function AdminWorkerPage({ params }: PageProps<"/[lang]/admin/workers/[workerId]">) {
  const t = await getDictionary()
  return (
    <>
      <AppHeader
        crumbs={[
          { label: t.nav.operator, href: "/admin" },
          { label: t.nav.adminWorkers, href: "/admin/workers" },
          { label: t.workerDetail.information },
        ]}
      />
      <PageBody>
        <Suspense fallback={<FormSkeleton rows={6} />}>
          <Detail params={params} />
        </Suspense>
      </PageBody>
    </>
  )
}

async function Detail({ params }: { params: PageProps<"/[lang]/admin/workers/[workerId]">["params"] }) {
  const { workerId } = await params
  const [user, worker] = await Promise.all([getCurrentUser(), orNotFound(getAdminWorker(workerId))])
  return <AdminWorkerDetail key={worker.id} initial={worker} canEdit={canOperate(user.operatorRole, "editor")} />
}
