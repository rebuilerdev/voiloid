"use client"

import { CheckIcon, GearSixIcon, GlobeIcon, SignOutIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"

import { useUnsavedChangesGuard } from "@/components/common/unsaved-changes"
import { UserAvatar } from "@/components/layout/user-avatar"
import { useI18n } from "@/components/providers"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { changeLocale } from "@/lib/i18n/client"
import { locales } from "@/lib/i18n/config"
import type { CurrentUser } from "@/types/user"

/** POST /api/auth/logout をフォーム送信で行う（リダイレクトをブラウザに任せる） */
function submitLogout() {
  const form = document.createElement("form")
  form.method = "post"
  form.action = "/api/auth/logout"
  document.body.append(form)
  form.submit()
}

export function UserMenu({ user }: { user: CurrentUser }) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const guard = useUnsavedChangesGuard()
  const leave = () => !guard || guard.confirmLeave()

  const languageLabel = { ja: t.settings.languageJa, en: t.settings.languageEn }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="rounded-full" aria-label={t.header.userMenu} />}
            />
          }
        >
          <UserAvatar user={user} size="sm" />
        </TooltipTrigger>
        <TooltipContent>{t.header.userMenu}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col">
            <span className="truncate text-xs font-medium text-foreground">{user.displayName}</span>
            <span className="truncate font-normal">@{user.username}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => leave() && router.push("/settings")}>
          <GearSixIcon />
          {t.nav.settings}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <GlobeIcon />
            {t.header.language}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {locales.map((l) => (
              <DropdownMenuItem key={l} onClick={() => l !== locale && leave() && changeLocale(l)}>
                <CheckIcon className={l === locale ? "opacity-100" : "opacity-0"} />
                {languageLabel[l]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => leave() && submitLogout()}>
          <SignOutIcon />
          {t.nav.logout}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
