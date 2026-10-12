import { Suspense } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { FormSkeleton } from "@/components/common/loading-skeleton"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody, PageHeader } from "@/components/layout/page-header"
import { getDictionary } from "@/lib/i18n/server"
import { getCurrentUser } from "@/lib/server/current-user"
import { canOperate } from "@/types/admin"

import { WorkerSetupWizard } from "@/features/workers/worker-setup-wizard"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.admin.addOfficial }
}

/** 公式Worker の追加（editor 以上）。自鯖Worker と同じ手順・同じ画面 */
export default async function AddOfficialWorkerPage() {
  const t = await getDictionary()
  return (
    <>
      <AppHeader
        crumbs={[
          { label: t.nav.operator, href: "/admin" },
          { label: t.nav.adminWorkers, href: "/admin/workers" },
          { label: t.admin.addOfficial },
        ]}
      />
      <PageBody className="max-w-3xl">
        <PageHeader title={t.admin.addOfficial} description={t.admin.addOfficialDescription} />
        <Suspense fallback={<FormSkeleton rows={2} />}>
          <Wizard />
        </Suspense>
      </PageBody>
    </>
  )
}

async function Wizard() {
  const user = await getCurrentUser()
  if (!canOperate(user.operatorRole, "editor")) notFound()
  return <WorkerSetupWizard kind="official" />
}
