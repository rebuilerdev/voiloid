import { DiscordLogoIcon, SignOutIcon } from "@phosphor-icons/react/ssr"

import { CopyButton } from "@/components/common/copy-button"
import { LogoutForm } from "@/components/layout/logout-form"
import { UserAvatar } from "@/components/layout/user-avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import type { CurrentUser } from "@/types/user"

/** Account（仕様書 §48） */
export function AccountCard({ user, t }: { user: CurrentUser; t: Dictionary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.account}</CardTitle>
        <CardDescription>{t.settings.accountHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <UserAvatar user={user} size="lg" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{user.displayName}</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <DiscordLogoIcon className="size-3.5" aria-hidden />
              Discord
            </span>
          </div>
        </div>
        <dl className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-y-2">
          <dt className="text-muted-foreground">{t.settings.username}</dt>
          <dd>@{user.username}</dd>
          <dt className="text-muted-foreground">{t.settings.userId}</dt>
          <dd className="flex min-w-0 items-center gap-1">
            <code className="truncate font-mono tabular-nums">{user.id}</code>
            <CopyButton value={user.id} label={`${t.common.copy}: ${t.settings.userId}`} />
          </dd>
        </dl>
      </CardContent>
      <CardFooter className="justify-end">
        <LogoutForm>
          <Button type="submit" variant="outline">
            <SignOutIcon data-icon="inline-start" />
            {t.nav.logout}
          </Button>
        </LogoutForm>
      </CardFooter>
    </Card>
  )
}
