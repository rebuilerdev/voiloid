import type { Locale } from "@/lib/i18n/config"

const TIME_ZONE = "Asia/Tokyo"

const intlLocale = (locale: Locale) => (locale === "ja" ? "ja-JP" : "en-US")

/** 言語ごとの数値・日付フォーマッタ。Server / Client 共通 */
export function createFormatters(locale: Locale) {
  const tag = intlLocale(locale)
  const number = new Intl.NumberFormat(tag)
  const dateTime = new Intl.DateTimeFormat(tag, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  })
  const date = new Intl.DateTimeFormat(tag, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TIME_ZONE,
  })
  const day = new Intl.DateTimeFormat(tag, {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: TIME_ZONE,
  })
  const relative = new Intl.RelativeTimeFormat(tag, { numeric: "auto" })

  return {
    number: (n: number) => number.format(n),
    dateTime: (iso: string) => dateTime.format(new Date(iso)),
    date: (iso: string) => date.format(new Date(iso)),
    day: (iso: string) => day.format(new Date(iso)),
    /** 「3秒前」「5 minutes ago」 */
    relative: (iso: string, now: number) => {
      const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
      const abs = Math.abs(seconds)
      if (abs < 60) return relative.format(Math.min(seconds, -1), "second")
      if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute")
      if (abs < 86400) return relative.format(Math.round(seconds / 3600), "hour")
      return relative.format(Math.round(seconds / 86400), "day")
    },
  }
}

export type Formatters = ReturnType<typeof createFormatters>

/** モックAPI呼び出しの待ち時間などを再現する */
export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
