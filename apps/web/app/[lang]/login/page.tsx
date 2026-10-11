import { Suspense } from "react"
import type { Metadata } from "next"
import Image from "next/image"
import { ArrowUpRightIcon, LockSimpleIcon } from "@phosphor-icons/react/ssr"

import { AppLogo } from "@/components/common/app-logo"
import { getDictionary } from "@/lib/i18n/server"

import { LoginButton, LoginButtonFallback } from "@/features/auth/login-button"
import { LoginGimmick } from "@/features/auth/login-gimmick"
import { Tagline } from "@/features/auth/login-parts"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary()
  return { title: t.login.title }
}

const REBUILER_URL = "https://rebuiler.dev"

// rebuiler.dev と同じ等幅フォント（layout.tsx の IBM Plex Mono）
const mono = "font-[family-name:var(--font-plex-mono),var(--font-plex-jp),monospace]"
const muted = "text-[#737373] dark:text-[#a1a1a1]"

/**
 * Login（仕様書 §71）。運営元の rebuiler.dev と同じ見た目にそろえる。
 * 上: ロゴ・タイトル・rebuiler.dev へのリンク、下: キャッチコピーとログイン、右（スマホでは上）: ギミック。
 */
export default async function LoginPage() {
  const t = await getDictionary()

  return (
    <main className="flex min-h-svh flex-1 flex-col bg-[#fafaf3] px-4 text-black md:px-10 dark:bg-[#0a0a0a] dark:text-white">
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-4 md:grid-cols-[1fr_auto_1fr] md:gap-0 md:py-10">
        <AppLogo className="size-8 min-[360px]:size-9 md:size-[50px]" />
        <p
          className={`${mono} justify-self-center text-[11px] whitespace-nowrap min-[360px]:text-[13px] min-[360px]:tracking-[0.08em] md:text-2xl md:tracking-[0.12em]`}
        >
          re.<span className="mx-1.5 min-[360px]:mx-2 md:mx-8">{"//"}</span>Voiloid
        </p>
        <a
          href={REBUILER_URL}
          className="inline-flex h-8 items-center gap-1.5 justify-self-end rounded-full bg-black px-3 text-[11px] min-[360px]:px-4 min-[360px]:text-xs tracking-wide text-white uppercase transition-opacity hover:opacity-80 md:h-10 md:px-7 md:text-sm dark:bg-white dark:text-black"
        >
          rebuiler.dev
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      </header>

      <div className="flex flex-1 flex-col lg:grid lg:grid-cols-2 lg:items-center lg:gap-16">
        {/* スマホでは残りの高さいっぱいに広げて、その中央にギミックを置く */}
        <div className="flex flex-1 items-center py-8 lg:order-last lg:py-0">
          <figure className="w-full">
            <LoginGimmick className="mx-auto w-full max-w-md lg:max-w-xl" />
            <figcaption className="sr-only">{t.login.demo.caption}</figcaption>
          </figure>
        </div>

        <section className="pb-10 md:pb-16">
          <p className={`${mono} text-xs md:text-sm ${muted}`}>{"// Voiloid — Login"}</p>
          <h1 className="mt-6 text-[clamp(1.5rem,8.5vw,3.75rem)] leading-[1.1] font-medium tracking-tighter lg:text-[clamp(2.5rem,4.2vw,4.5rem)]">
            <Tagline line1={t.login.taglineLine1} line2={t.login.taglineLine2} />
          </h1>
          <p className={`mt-8 max-w-md text-sm leading-relaxed md:text-base ${muted}`}>{t.login.lead}</p>

          <div className="mt-10 flex flex-col items-start gap-4">
            <Suspense fallback={<LoginButtonFallback />}>
              <LoginButton />
            </Suspense>
            <p className={`flex max-w-md gap-2 text-xs leading-relaxed ${muted}`}>
              <LockSimpleIcon className="mt-0.5 size-3.5 shrink-0" />
              {t.login.privacy}
            </p>
          </div>
        </section>
      </div>

      <footer className={`${mono} flex items-end justify-between gap-6 py-6 text-xs md:py-10 ${muted}`}>
        <div className="flex flex-col gap-4">
          <p className="leading-relaxed">{t.login.note}</p>
          <p>
            © rebuiler.
            <a
              href={REBUILER_URL}
              className="ml-5 underline-offset-4 transition-colors hover:text-black hover:underline dark:hover:text-white"
            >
              rebuiler.dev
            </a>
          </p>
        </div>
        <Image
          src="/rebuiler-mark.svg"
          alt=""
          aria-hidden
          width={174}
          height={254}
          unoptimized
          className="h-auto w-12 shrink-0 md:w-[87px] dark:invert"
        />
      </footer>
    </main>
  )
}
