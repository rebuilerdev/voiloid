import { Suspense } from "react"
import Link from "next/link"
import { ArrowLeftIcon, PlugIcon } from "@phosphor-icons/react/ssr"

import { EmptyState } from "@/components/common/empty-state"
import { ErrorState } from "@/components/common/error-state"
import { FormSkeleton } from "@/components/common/loading-skeleton"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody } from "@/components/layout/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getI18n } from "@/lib/i18n/server"
import { getGuildCached } from "@/lib/server/loaders"
import { listGuilds } from "@/services/guilds"
import { isApiError } from "@/services/http"

import { ServerHeader } from "@/features/servers/server-header"
import { ServerNavigation } from "@/features/servers/server-navigation"
import { ServerTabCrumb } from "@/features/servers/server-tab-crumb"

/**
 * Server Detail 共通: Server Header + サブナビ（仕様書 §11）。
 * Guild の存在・権限を確認してから子ページを描画する。
 */
export default function ServerLayout({ children, params }: LayoutProps<"/[lang]/servers/[guildId]">) {
  return (
    <Suspense fallback={<ServerShellSkeleton />}>
      <ServerShell params={params}>{children}</ServerShell>
    </Suspense>
  )
}

async function ServerShell({
  params,
  children,
}: {
  params: LayoutProps<"/[lang]/servers/[guildId]">["params"]
  children: React.ReactNode
}) {
  const { guildId } = await params
  const { t, f } = await getI18n()

  let guild
  try {
    guild = await getGuildCached(guildId)
  } catch (error) {
    // 404 は子ページが notFound() を投げて Not Found 画面にする（layout は子を描画し続ける）
    if (isApiError(error) && error.status === 404) return children
    if (isApiError(error) && error.status === 403) {
      // 運営者による利用停止中（サーバー一覧で分かる）か、権限エラー（仕様書 §54）
      const suspended = await listGuilds()
        .then((guilds) => guilds.some((g) => g.id === guildId && g.suspended))
        .catch(() => false)
      return (
        <>
          <AppHeader crumbs={[{ label: t.nav.servers, href: "/servers" }, { label: t.errors.forbiddenTitle }]} />
          <PageBody>
            <ErrorState
              kind="forbidden"
              title={suspended ? t.ops.guildSuspendedBanner : t.errors.forbiddenServer}
              description={suspended ? undefined : t.errors.forbiddenHint}
              action={
                <Link href="/servers" className={buttonVariants({ variant: "outline" })}>
                  <ArrowLeftIcon data-icon="inline-start" />
                  {t.nav.servers}
                </Link>
              }
            />
            {/* 子ページは 403 の場合 null を返す */}
            {children}
          </PageBody>
        </>
      )
    }
    throw error
  }

  return (
    <>
      <AppHeader
        crumbs={[
          { label: t.nav.servers, href: "/servers" },
          { label: guild.name, href: `/servers/${guild.id}` },
          ...(guild.botInstalled ? [{ label: <ServerTabCrumb /> }] : []),
        ]}
      />
      <div className="border-b">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 pt-4 md:px-6 md:pt-6">
          <ServerHeader guild={guild} t={t} f={f} />
          {guild.botInstalled ? <ServerNavigation guildId={guild.id} /> : <div className="h-2" />}
        </div>
      </div>
      <PageBody>
        {!guild.botInstalled && (
          <EmptyState icon={<PlugIcon />} title={t.status.botNotInstalled} description={t.servers.botNotInstalledHint} />
        )}
        {/* 子ページは Bot 未導入の場合 null を返す */}
        {children}
      </PageBody>
    </>
  )
}

function ServerShellSkeleton() {
  return (
    <>
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <Skeleton className="size-7" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="border-b">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 pt-4 md:px-6 md:pt-6">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
          <Skeleton className="h-9 w-96 max-w-full" />
        </div>
      </div>
      <PageBody>
        <FormSkeleton />
      </PageBody>
    </>
  )
}
