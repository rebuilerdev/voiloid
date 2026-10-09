import { SignOutIcon } from "@phosphor-icons/react/ssr"

import { IconButton } from "@/components/common/icon-button"
import { LogoutForm } from "@/components/layout/logout-form"
import { UserAvatar } from "@/components/layout/user-avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { getDictionary } from "@/lib/i18n/server"
import { getCurrentUser } from "@/lib/server/current-user"

/** サイドバー最下部の Discord ユーザー + Logout（仕様書 §4） */
export async function SidebarUser() {
  const [t, user] = await Promise.all([getDictionary(), getCurrentUser()])

  return (
    <div className="flex items-center gap-2 p-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:p-0">
      <UserAvatar user={user} />
      <div className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
        <span className="truncate text-xs font-medium">{user.displayName}</span>
        <span className="truncate text-xs text-muted-foreground">@{user.username}</span>
      </div>
      <LogoutForm>
        <IconButton type="submit" label={t.nav.logout}>
          <SignOutIcon />
        </IconButton>
      </LogoutForm>
    </div>
  )
}

export function SidebarUserSkeleton() {
  return (
    <div className="flex items-center gap-2 p-1">
      <Skeleton className="size-8 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-1.5 group-data-[collapsible=icon]:hidden">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  )
}
