import { Suspense } from "react"
import type { Metadata } from "next"

import { StatCardsSkeleton, TableSkeleton } from "@/components/common/loading-skeleton"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody, PageHeader } from "@/components/layout/page-header"
import { getDictionary } from "@/lib/i18n/server"
import { orNotFound } from "@/lib/server/loaders"
import { getAdminOverview } from "@/services/admin"

import { AdminOverview } from "@/features/admin/admin-overview"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.admin.overviewTitle }
}

/** 運営コンソール: 概要（運営者以外は API が 404 を返し、Not Found になる） */
export default async function AdminOverviewPage() {
  const t = await getDictionary()
  return (
    <>
      <AppHeader crumbs={[{ label: t.nav.operator }, { label: t.nav.adminOverview }]} />
      <PageBody>
        <PageHeader title={t.admin.overviewTitle} description={t.admin.overviewDescription} />
        <Suspense
          fallback={
            <>
              <StatCardsSkeleton count={5} />
              <TableSkeleton rows={5} columns={5} />
            </>
          }
        >
          <Overview />
        </Suspense>
      </PageBody>
    </>
  )
}

async function Overview() {
  return <AdminOverview overview={await orNotFound(getAdminOverview())} />
}
