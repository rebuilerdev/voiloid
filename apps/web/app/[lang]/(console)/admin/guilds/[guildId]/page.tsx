import { Suspense } from "react"
import type { Metadata } from "next"

import { FormSkeleton } from "@/components/common/loading-skeleton"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody, PageHeader } from "@/components/layout/page-header"
import { fmt } from "@/lib/i18n/config"
import { getDictionary } from "@/lib/i18n/server"
import { getCurrentUser } from "@/lib/server/current-user"
import { orNotFound } from "@/lib/server/loaders"
import { getAdminGuild } from "@/services/admin"

import { GuildDetail } from "@/features/admin/guild-detail"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.admin.guildsTitle }
}

export default async function AdminGuildPage({ params }: PageProps<"/[lang]/admin/guilds/[guildId]">) {
  const t = await getDictionary()
  return (
    <>
      <AppHeader
        crumbs={[
          { label: t.nav.operator, href: "/admin" },
          { label: t.nav.adminGuilds, href: "/admin/guilds" },
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

async function Detail({ params }: { params: PageProps<"/[lang]/admin/guilds/[guildId]">["params"] }) {
  const { guildId } = await params
  const [t, guild, user] = await Promise.all([getDictionary(), orNotFound(getAdminGuild(guildId)), getCurrentUser()])
  return (
    <>
      <PageHeader title={guild.name} description={fmt(t.admin.guildDetailDescription, { id: guild.id })} />
      <GuildDetail guild={guild} role={user.operatorRole} />
    </>
  )
}
