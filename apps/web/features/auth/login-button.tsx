"use client"

import { DiscordLogoIcon } from "@phosphor-icons/react"
import { useSearchParams } from "next/navigation"

import { useI18n } from "@/components/providers"
import { cn } from "@/lib/utils"

// rebuiler.dev のボタンと同じ、黒い丸ボタン
const pill =
  "inline-flex h-12 items-center justify-center gap-3 rounded-full bg-black px-8 text-sm text-white dark:bg-white dark:text-black"

/** [Discordでログイン]。ログイン後は元のページ（?next=）へ戻る */
export function LoginButton() {
  const { t } = useI18n()
  const next = useSearchParams().get("next")
  const href = next ? `/api/auth/login?next=${encodeURIComponent(next)}` : "/api/auth/login"

  return (
    <a
      href={href}
      className={cn(
        pill,
        "transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-black/40 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-white/50"
      )}
    >
      <DiscordLogoIcon weight="fill" className="size-5" />
      {t.login.loginWithDiscord}
    </a>
  )
}

/** 読み込み中の見た目（ボタンと同じ大きさ） */
export function LoginButtonFallback() {
  return <span aria-hidden className={cn(pill, "w-56 opacity-50")} />
}
