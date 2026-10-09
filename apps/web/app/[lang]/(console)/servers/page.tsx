import { Suspense } from "react"
import type { Metadata } from "next"
import { ArrowSquareOutIcon } from "@phosphor-icons/react/ssr"

import { CardGridSkeleton } from "@/components/common/loading-skeleton"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody, PageHeader } from "@/components/layout/page-header"
import { buttonVariants } from "@/components/ui/button"
import { botInviteUrl } from "@/lib/config"
import { getDictionary } from "@/lib/i18n/server"
import { listGuilds } from "@/services/guilds"

import { ServerGrid } from "@/features/servers/server-grid"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.servers.title }
}

export default async function ServersPage() {
  const t = await getDictionary()
  return (
    <>
      <AppHeader crumbs={[{ label: t.nav.servers }]} />
      <PageBody>
        <PageHeader
          title={t.servers.title}
          description={t.servers.description}
          actions={
            <a href={botInviteUrl()} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
              {t.servers.inviteBot}
              <ArrowSquareOutIcon data-icon="inline-end" />
            </a>
          }
        />
        <Suspense fallback={<CardGridSkeleton count={6} className="2xl:grid-cols-4" />}>
          <ServerList />
        </Suspense>
      </PageBody>
    </>
  )
}

async function ServerList() {
  return <ServerGrid guilds={await listGuilds()} />
}
