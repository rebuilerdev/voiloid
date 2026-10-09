import { Suspense } from "react"
import type { Metadata } from "next"

import { TableSkeleton } from "@/components/common/loading-skeleton"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody, PageHeader } from "@/components/layout/page-header"
import { getDictionary } from "@/lib/i18n/server"
import { orNotFound } from "@/lib/server/loaders"
import { listAdminGuilds } from "@/services/admin"

import { GuildBrowser } from "@/features/admin/guild-browser"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.admin.guildsTitle }
}

export default async function AdminGuildsPage() {
  const t = await getDictionary()
  return (
    <>
      <AppHeader crumbs={[{ label: t.nav.operator, href: "/admin" }, { label: t.nav.adminGuilds }]} />
      <PageBody>
        <PageHeader title={t.admin.guildsTitle} description={t.admin.guildsDescription} />
        <Suspense fallback={<TableSkeleton rows={8} columns={6} />}>
          <Guilds />
        </Suspense>
      </PageBody>
    </>
  )
}

async function Guilds() {
  return <GuildBrowser initial={await orNotFound(listAdminGuilds())} />
}
