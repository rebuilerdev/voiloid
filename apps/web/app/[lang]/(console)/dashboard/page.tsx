import { Suspense } from "react"
import type { Metadata } from "next"

import { StatCardsSkeleton, TableSkeleton } from "@/components/common/loading-skeleton"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody, PageHeader } from "@/components/layout/page-header"
import { getDictionary, getI18n } from "@/lib/i18n/server"
import { listGuilds } from "@/services/guilds"
import { getServiceStatus } from "@/services/status"
import { getUsage } from "@/services/usage"
import { listWorkers } from "@/services/workers"

import { RecentServers } from "@/features/dashboard/recent-servers"
import { StatCards } from "@/features/dashboard/stat-cards"
import { WorkerStatusList } from "@/features/dashboard/worker-status-list"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.dashboard.title }
}

export default async function DashboardPage() {
  const t = await getDictionary()
  return (
    <>
      <AppHeader crumbs={[{ label: t.nav.dashboard }]} />
      <PageBody>
        <PageHeader title={t.dashboard.title} description={t.dashboard.description} />
        <Suspense
          fallback={
            <>
              <StatCardsSkeleton />
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <TableSkeleton rows={5} columns={3} />
                </div>
                <TableSkeleton rows={4} columns={2} />
              </div>
            </>
          }
        >
          <DashboardContent />
        </Suspense>
      </PageBody>
    </>
  )
}

async function DashboardContent() {
  const { t, f } = await getI18n()
  const [status, guilds, workers, usage] = await Promise.all([
    getServiceStatus(),
    listGuilds(),
    listWorkers(),
    getUsage("month"),
  ])

  return (
    <>
      <StatCards status={status} guilds={guilds} workers={workers} usage={usage} t={t} f={f} />
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <RecentServers guilds={guilds} t={t} />
        <WorkerStatusList initial={workers} />
      </div>
    </>
  )
}
