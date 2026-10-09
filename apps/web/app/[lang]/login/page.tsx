import { Suspense } from "react"
import type { Metadata } from "next"

import { AppLogo } from "@/components/common/app-logo"
import { Card, CardContent } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { getDictionary } from "@/lib/i18n/server"
import { cn } from "@/lib/utils"

import { LoginButton } from "@/features/auth/login-button"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.login.title }
}

/** Login（仕様書 §71） */
export default async function LoginPage() {
  const t = await getDictionary()

  return (
    <main className="flex flex-1 items-center justify-center bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_60%)] p-4">
      <Card className="w-full max-w-sm gap-6 py-8">
        <CardContent className="flex flex-col items-center gap-6 px-8 text-center">
          <div className="flex items-center gap-2">
            <AppLogo className="size-9" />
            <span className="font-heading text-xl font-semibold">{t.common.appName}</span>
          </div>
          <h1 className="font-heading text-2xl leading-snug font-semibold">
            {t.login.taglineLine1}
            <br />
            {t.login.taglineLine2}
          </h1>
          <Suspense fallback={<span className={cn(buttonVariants({ size: "lg" }), "h-10 w-full opacity-50")} />}>
            <LoginButton />
          </Suspense>
          <p className="text-xs text-muted-foreground">{t.login.note}</p>
        </CardContent>
      </Card>
    </main>
  )
}
