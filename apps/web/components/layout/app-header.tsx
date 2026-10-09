import { Fragment, Suspense } from "react"

import { GuardedLink } from "@/components/common/unsaved-changes"
import { Notifications } from "@/components/layout/notifications"
import { UserMenu } from "@/components/layout/user-menu"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarToggle } from "@/components/layout/sidebar-toggle"
import { Skeleton } from "@/components/ui/skeleton"
import { getCurrentUser } from "@/lib/server/current-user"

export type Crumb = { label: React.ReactNode; href?: string }

/**
 * ページ上部のバー（仕様書 §5）: パンくず / Primary Action / 通知 / ユーザーアバター
 */
export function AppHeader({ crumbs, action }: { crumbs: Crumb[]; action?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
      <SidebarToggle />
      <Separator orientation="vertical" className="mr-1 h-4 self-center" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((crumb, i) => (
            <Fragment key={i}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem className="min-w-0">
                {crumb.href && i < crumbs.length - 1 ? (
                  <BreadcrumbLink render={<GuardedLink href={crumb.href} />} className="truncate">
                    {crumb.label}
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="truncate font-medium">{crumb.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      {action && <div className="hidden shrink-0 sm:block">{action}</div>}
      <Notifications />
      <Suspense fallback={<Skeleton className="size-8 rounded-full" />}>
        <HeaderUser />
      </Suspense>
    </header>
  )
}

async function HeaderUser() {
  const user = await getCurrentUser()
  return <UserMenu user={user} />
}
