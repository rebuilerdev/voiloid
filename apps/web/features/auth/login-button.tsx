"use client"

import { DiscordLogoIcon } from "@phosphor-icons/react"
import { useSearchParams } from "next/navigation"

import { useI18n } from "@/components/providers"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** [Discordでログイン]。ログイン後は元のページ（?next=）へ戻る */
export function LoginButton() {
  const { t } = useI18n()
  const next = useSearchParams().get("next")
  const href = next ? `/api/auth/login?next=${encodeURIComponent(next)}` : "/api/auth/login"

  return (
    <a
      href={href}
      className={cn(
        buttonVariants({ size: "lg" }),
        "h-11 w-full bg-[#5865F2] text-sm text-white hover:bg-[#4752C4]"
      )}
    >
      <DiscordLogoIcon weight="fill" className="size-5" />
      {t.login.loginWithDiscord}
    </a>
  )
}
