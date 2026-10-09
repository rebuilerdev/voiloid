import { Suspense } from "react"
import type { Metadata } from "next"

import { FormSkeleton } from "@/components/common/loading-skeleton"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody, PageHeader } from "@/components/layout/page-header"
import { fmt } from "@/lib/i18n/config"
import { getDictionary } from "@/lib/i18n/server"
import { getCurrentUser } from "@/lib/server/current-user"
import { orNotFound } from "@/lib/server/loaders"
import { getAdminUser } from "@/services/admin"

import { UserDetail } from "@/features/admin/user-detail"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.admin.usersTitle }
}

export default async function AdminUserPage({ params }: PageProps<"/[lang]/admin/users/[userId]">) {
  const t = await getDictionary()
  return (
    <>
      <AppHeader
        crumbs={[
          { label: t.nav.operator, href: "/admin" },
          { label: t.nav.adminUsers, href: "/admin/users" },
          { label: t.common.details },
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

async function Detail({ params }: { params: PageProps<"/[lang]/admin/users/[userId]">["params"] }) {
  const { userId } = await params
  const [t, user, me] = await Promise.all([getDictionary(), orNotFound(getAdminUser(userId)), getCurrentUser()])
  return (
    <>
      <PageHeader title={user.displayName} description={fmt(t.ops.userDetailDescription, { id: user.id })} />
      <UserDetail key={user.id} initial={user} role={me.operatorRole} currentUserId={me.id} />
    </>
  )
}
