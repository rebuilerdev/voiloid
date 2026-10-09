import { Suspense } from "react"
import type { Metadata } from "next"

import { FormSkeleton } from "@/components/common/loading-skeleton"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody, PageHeader } from "@/components/layout/page-header"
import { getDictionary } from "@/lib/i18n/server"
import { getCurrentUser } from "@/lib/server/current-user"
import { orNotFound } from "@/lib/server/loaders"
import { getSystemSettings } from "@/services/admin"
import { listVoices } from "@/services/voices"

import { SystemSettings } from "@/features/admin/system-settings"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.ops.systemTitle }
}

export default async function AdminSystemPage() {
  const t = await getDictionary()
  return (
    <>
      <AppHeader crumbs={[{ label: t.nav.operator, href: "/admin" }, { label: t.nav.adminSystem }]} />
      <PageBody>
        <PageHeader title={t.ops.systemTitle} description={t.ops.systemDescription} />
        <Suspense fallback={<FormSkeleton rows={8} />}>
          <Settings />
        </Suspense>
      </PageBody>
    </>
  )
}

async function Settings() {
  const [settings, voices, user] = await Promise.all([
    orNotFound(getSystemSettings()),
    // 声の一覧が取れなくても設定は表示する
    listVoices().catch(() => []),
    getCurrentUser(),
  ])
  return <SystemSettings initial={settings} voices={voices} role={user.operatorRole} />
}
