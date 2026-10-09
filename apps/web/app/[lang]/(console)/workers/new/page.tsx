import type { Metadata } from "next"

import { AppHeader } from "@/components/layout/app-header"
import { PageBody, PageHeader } from "@/components/layout/page-header"
import { getDictionary } from "@/lib/i18n/server"

import { WorkerSetupWizard } from "@/features/workers/worker-setup-wizard"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.addWorker.title }
}

export default async function AddWorkerPage() {
  const t = await getDictionary()
  return (
    <>
      <AppHeader crumbs={[{ label: t.nav.workers, href: "/workers" }, { label: t.addWorker.title }]} />
      <PageBody className="max-w-3xl">
        <PageHeader title={t.addWorker.title} description={t.addWorker.description} />
        <WorkerSetupWizard />
      </PageBody>
    </>
  )
}
