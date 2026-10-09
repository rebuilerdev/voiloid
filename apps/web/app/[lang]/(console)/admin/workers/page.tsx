import { Suspense } from "react"
import type { Metadata } from "next"

import { TableSkeleton } from "@/components/common/loading-skeleton"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody, PageHeader } from "@/components/layout/page-header"
import { getDictionary } from "@/lib/i18n/server"
import { getCurrentUser } from "@/lib/server/current-user"
import { orNotFound } from "@/lib/server/loaders"
import { listOfficialWorkers, listPrivateWorkers } from "@/services/admin"
import { canOperate } from "@/types/admin"

import { OfficialWorkers } from "@/features/admin/official-workers"
import { PrivateWorkers } from "@/features/admin/private-workers"
import { WorkerTabs } from "@/features/admin/worker-tabs"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.ops.workersTitle }
}

export default async function AdminWorkersPage() {
  const t = await getDictionary()
  return (
    <>
      <AppHeader crumbs={[{ label: t.nav.operator, href: "/admin" }, { label: t.nav.adminWorkers }]} />
      <PageBody>
        <PageHeader title={t.ops.workersTitle} description={t.ops.workersDescription} />
        <Suspense fallback={<TableSkeleton rows={6} columns={6} />}>
          <Workers />
        </Suspense>
      </PageBody>
    </>
  )
}

async function Workers() {
  const [user, official, privateWorkers] = await Promise.all([
    getCurrentUser(),
    orNotFound(listOfficialWorkers()),
    orNotFound(listPrivateWorkers()),
  ])
  const canEdit = canOperate(user.operatorRole, "editor")
  return (
    <WorkerTabs
      official={<OfficialWorkers initial={official} canEdit={canEdit} />}
      private={<PrivateWorkers initial={privateWorkers} canEdit={canEdit} />}
    />
  )
}
