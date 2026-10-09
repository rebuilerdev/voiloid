import { ArrowSquareOutIcon } from "@phosphor-icons/react/ssr"

import { AppLogo } from "@/components/common/app-logo"
import { StatusBadge } from "@/components/common/status-badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import { fmt } from "@/lib/i18n/config"
import type { GuildBot } from "@/types/guild"

/** サーバーにいる Bot（メイン・サブボット）と、いない Bot の個別の招待 */
export function ServerBots({ bots, t }: { bots: GuildBot[]; t: Dictionary }) {
  const o = t.server.overview
  // サブボットが無ければ、メインの Bot はサーバーヘッダーの表示で足りる
  if (!bots.some((b) => b.role === "sub")) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{o.bots}</CardTitle>
        <CardDescription>{o.botsDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul aria-label={o.bots} className="flex flex-col divide-y">
          {bots.map((bot) => (
            <li key={bot.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <Avatar>
                {bot.avatarUrl && <AvatarImage src={bot.avatarUrl} alt="" />}
                <AvatarFallback>
                  <AppLogo className="size-full" />
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate font-medium">{bot.name}</span>
                <Badge variant="outline">{bot.role === "main" ? o.mainBot : o.subBot}</Badge>
              </div>
              {bot.present ? (
                <StatusBadge tone="success">{o.present}</StatusBadge>
              ) : (
                <>
                  <StatusBadge tone="muted" className="max-sm:hidden">
                    {o.absent}
                  </StatusBadge>
                  <a
                    href={bot.inviteUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={fmt(o.inviteLabel, { name: bot.name })}
                    className={buttonVariants({ size: "sm" })}
                  >
                    {o.invite}
                    <ArrowSquareOutIcon data-icon="inline-end" />
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
