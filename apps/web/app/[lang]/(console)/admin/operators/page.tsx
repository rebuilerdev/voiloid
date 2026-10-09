import { Suspense } from "react"
import type { Metadata } from "next"

import { TableSkeleton } from "@/components/common/loading-skeleton"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody, PageHeader } from "@/components/layout/page-header"
import { getDictionary } from "@/lib/i18n/server"
import { getCurrentUser } from "@/lib/server/current-user"
import { orNotFound } from "@/lib/server/loaders"
import { listOperators } from "@/services/admin"

import { OperatorList } from "@/features/admin/operator-list"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.ops.operatorsTitle }
}

export default async function AdminOperatorsPage() {
  const t = await getDictionary()
  return (
    <>
      <AppHeader crumbs={[{ label: t.nav.operator, href: "/admin" }, { label: t.nav.adminOperators }]} />
      <PageBody>
        <PageHeader title={t.ops.operatorsTitle} description={t.ops.operatorsDescription} />
        <Suspense fallback={<TableSkeleton rows={4} columns={4} />}>
          <Operators />
        </Suspense>
      </PageBody>
    </>
  )
}

async function Operators() {
  const [operators, user] = await Promise.all([orNotFound(listOperators()), getCurrentUser()])
  return <OperatorList initial={operators} role={user.operatorRole} currentUserId={user.id} />
}
