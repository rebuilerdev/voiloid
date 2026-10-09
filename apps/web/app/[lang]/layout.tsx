import type { Metadata } from "next"
import { Geist_Mono, IBM_Plex_Sans, IBM_Plex_Sans_JP } from "next/font/google"

import "@/app/globals.css"
// Server Component からの API 呼び出し（Cookie 転送・モック）を登録する
import "@/services/server-transport"

import { Providers } from "@/components/providers"
import { locales } from "@/lib/i18n/config"
import { getI18n } from "@/lib/i18n/server"
import { cn } from "@/lib/utils"

const ibmPlexSans = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-plex" })
// 日本語グリフ用（IBM Plex Sans と同じデザインファミリー）
const ibmPlexSansJp = IBM_Plex_Sans_JP({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  preload: false,
  variable: "--font-plex-jp",
})
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }))
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n()
  return {
    title: { default: t.common.appName, template: `%s | ${t.common.appName}` },
    description: t.meta.description,
  }
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const { locale, t } = await getI18n()

  return (
    <html
      lang={locale}
      // next-themes が class を付け替えるため
      suppressHydrationWarning
      className={cn("h-full antialiased font-sans", ibmPlexSans.variable, ibmPlexSansJp.variable, geistMono.variable)}
    >
      <body className="flex min-h-full flex-col">
        <Providers locale={locale} dictionary={t}>
          {children}
        </Providers>
      </body>
    </html>
  )
}
