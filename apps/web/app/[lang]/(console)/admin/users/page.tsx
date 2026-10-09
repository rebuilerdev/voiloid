import { Suspense } from "react"
import type { Metadata } from "next"

import { TableSkeleton } from "@/components/common/loading-skeleton"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody, PageHeader } from "@/components/layout/page-header"
import { getDictionary } from "@/lib/i18n/server"
import { orNotFound } from "@/lib/server/loaders"
import { listAdminUsers } from "@/services/admin"

import { UserBrowser } from "@/features/admin/user-browser"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.admin.usersTitle }
}

export default async function AdminUsersPage() {
  const t = await getDictionary()
  return (
    <>
      <AppHeader crumbs={[{ label: t.nav.operator, href: "/admin" }, { label: t.nav.adminUsers }]} />
      <PageBody>
        <PageHeader title={t.admin.usersTitle} description={t.admin.usersDescription} />
        <Suspense fallback={<TableSkeleton rows={8} columns={6} />}>
          <Users />
        </Suspense>
      </PageBody>
    </>
  )
}

async function Users() {
  return <UserBrowser initial={await orNotFound(listAdminUsers())} />
}
