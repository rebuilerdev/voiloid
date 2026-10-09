import { Suspense } from "react"
import type { Metadata } from "next"
import { HashIcon, LockSimpleIcon, SpeakerHighIcon } from "@phosphor-icons/react/ssr"

import { AppLogo } from "@/components/common/app-logo"
import { buttonVariants } from "@/components/ui/button"
import { getDictionary } from "@/lib/i18n/server"
import { cn } from "@/lib/utils"

import { LoginButton } from "@/features/auth/login-button"
import { GRAIN, ORB_GRADIENT, Tagline, Waveform } from "@/features/auth/login-parts"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.login.title }
}

/**
 * Login（仕様書 §71）。
 * 左: キャッチコピーとログイン、右: 読み上げの様子（Discord 風の見本）。
 */
export default async function LoginPage() {
  const t = await getDictionary()
  const demo = t.login.demo

  return (
    <main className="grid min-h-svh flex-1 bg-[#fbf7f9] text-[#1d1220] lg:grid-cols-2 dark:bg-[#110a14] dark:text-white">
      <section className="flex flex-col justify-between gap-12 px-6 py-8 sm:px-10 lg:p-12 xl:p-16">
        <div className="flex items-center gap-2.5">
          <AppLogo className="size-8" />
          <span className="font-heading text-lg font-semibold tracking-tight">{t.common.appName}</span>
        </div>

        <div className="max-w-xl">
          <h1 className="font-heading text-4xl leading-[1.15] font-semibold tracking-tight sm:text-5xl">
            <Tagline
              line1={t.login.taglineLine1}
              line2={t.login.taglineLine2}
              line2ClassName="bg-[linear-gradient(90deg,#9b3fae,#e25184)] bg-clip-text text-transparent dark:bg-[linear-gradient(90deg,#e58fd0,#f8afc4)]"
            />
          </h1>
          <p className="mt-5 text-base leading-relaxed text-[#5d4f60] dark:text-white/70">{t.login.lead}</p>

          <div className="mt-10">
            <Suspense fallback={<span className={cn(buttonVariants({ size: "lg" }), "h-11 w-full opacity-50")} />}>
              <LoginButton />
            </Suspense>
            <p className="mt-4 flex gap-2 text-xs leading-relaxed text-[#6e6070] dark:text-white/60">
              <LockSimpleIcon className="mt-0.5 size-3.5 shrink-0" />
              {t.login.privacy}
            </p>
          </div>
        </div>

        <p className="text-xs text-[#6e6070] dark:text-white/45">{t.login.note}</p>
      </section>

      {/* 読み上げの様子（Discord 風の見本）。内容は説明文（figcaption）で伝える */}
      <section className="relative isolate flex items-center justify-center overflow-hidden px-6 py-16 sm:px-10">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="absolute top-1/2 left-1/2 aspect-square w-[130%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-[80px] dark:opacity-55"
            style={{ background: ORB_GRADIENT }}
          />
          <div className="absolute inset-0 opacity-30 mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
        </div>

        <figure className="w-full max-w-md">
          <div
            aria-hidden
            className="overflow-hidden bg-[#2b2d31] text-[#dbdee1] shadow-[0_40px_90px_-30px_rgb(60_20_70/0.65)] ring-1 ring-black/10"
          >
            <div className="flex items-center gap-2 border-b border-black/30 px-4 py-3 text-sm font-semibold text-white">
              <HashIcon className="size-4 text-[#80848e]" />
              {demo.textChannel}
            </div>
            <div className="flex gap-3 px-4 py-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#3ba55c] text-sm font-semibold text-white">
                {demo.user.slice(0, 1)}
              </span>
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-semibold text-white">{demo.user}</span>
                  <span className="ml-2 text-xs text-[#949ba4]">{demo.time}</span>
                </p>
                <p className="mt-0.5 text-[15px] text-[#dbdee1]">{demo.message}</p>
              </div>
            </div>
            <div className="mx-4 mb-4 flex items-center gap-3 bg-[#1e1f22] px-3 py-3">
              <AppLogo className="size-8" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <SpeakerHighIcon weight="fill" className="size-3.5 shrink-0 text-[#f8afc4]" />
                  <span className="truncate">
                    {demo.reading} · {demo.voiceChannel}
                  </span>
                </p>
                <p className="truncate text-xs text-[#949ba4]">{demo.voice}</p>
              </div>
              {/* 狭い画面では波形を短くして、文字の表示を優先する */}
              <Waveform bars={8} className="h-7 shrink-0 text-[#f8afc4] sm:hidden" />
              <Waveform bars={14} className="hidden h-7 shrink-0 text-[#f8afc4] sm:flex" />
            </div>
          </div>
          <figcaption className="mt-5 text-center text-sm leading-relaxed text-[#3a2c3d] dark:text-white/80">
            {demo.caption}
          </figcaption>
        </figure>
      </section>
    </main>
  )
}
