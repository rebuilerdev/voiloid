"use client"

import { createContext, useContext, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { ThemeProvider } from "next-themes"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createFormatters, type Formatters } from "@/lib/format"
import type { Locale } from "@/lib/i18n/config"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import { onApiMutation } from "@/services/http"

type I18nContextValue = { locale: Locale; t: Dictionary; f: Formatters }

const I18nContext = createContext<I18nContextValue | null>(null)

/** Client Component 用の辞書・フォーマッタ */
export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error("useI18n must be used within <Providers>")
  return value
}

export function Providers({
  locale,
  dictionary,
  children,
}: {
  locale: Locale
  dictionary: Dictionary
  children: React.ReactNode
}) {
  const router = useRouter()
  // 保存・削除などが成功したら、Client Cache（一度開いたページの表示）を捨てて作り直す。
  // 捨てないと、別のページへ移って戻ったときに、最大5分前の内容が出る
  useEffect(() => onApiMutation(() => router.refresh()), [router])

  const i18n = useMemo(
    () => ({ locale, t: dictionary, f: createFormatters(locale) }),
    [locale, dictionary]
  )

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <I18nContext.Provider value={i18n}>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster
          position="bottom-right"
          // sonner 既定の system-ui ではなくアプリのフォント（日本語含む）を使う
          style={
            {
              "--normal-bg": "var(--popover)",
              "--normal-text": "var(--popover-foreground)",
              "--normal-border": "var(--border)",
              "--border-radius": "var(--radius)",
              fontFamily: "var(--font-plex), var(--font-plex-jp), ui-sans-serif, system-ui, sans-serif",
            } as React.CSSProperties
          }
        />
      </I18nContext.Provider>
    </ThemeProvider>
  )
}
