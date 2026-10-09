import { Suspense } from "react"
import type { Metadata } from "next"

import { TableSkeleton } from "@/components/common/loading-skeleton"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody, PageHeader } from "@/components/layout/page-header"
import { getDictionary } from "@/lib/i18n/server"
import { orNotFound } from "@/lib/server/loaders"
import { listAuditLogs } from "@/services/admin"

import { AuditLogBrowser } from "@/features/admin/audit-log-browser"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.admin.auditTitle }
}

export default async function AdminAuditPage() {
  const t = await getDictionary()
  return (
    <>
      <AppHeader crumbs={[{ label: t.nav.operator, href: "/admin" }, { label: t.nav.adminAudit }]} />
      <PageBody>
        <PageHeader title={t.admin.auditTitle} description={t.admin.auditDescription} />
        <Suspense fallback={<TableSkeleton rows={10} columns={6} />}>
          <AuditLogs />
        </Suspense>
      </PageBody>
    </>
  )
}

async function AuditLogs() {
  return <AuditLogBrowser initial={await orNotFound(listAuditLogs())} />
}
