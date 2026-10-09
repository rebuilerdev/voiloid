import { LOCALE_COOKIE } from "@/lib/config"
import type { Locale } from "@/lib/i18n/config"

/**
 * 表示言語を切り替える。"auto" はブラウザ設定（Accept-Language）に戻す。
 * 言語は Server Component の描画に影響するため、全体を再読み込みする。
 */
export function changeLocale(locale: Locale | "auto") {
  const maxAge = locale === "auto" ? 0 : 60 * 60 * 24 * 365
  document.cookie = `${LOCALE_COOKIE}=${locale === "auto" ? "" : locale}; path=/; max-age=${maxAge}; samesite=lax`
  window.location.reload()
}

export function hasLocaleCookie() {
  return document.cookie.split("; ").some((c) => c.startsWith(`${LOCALE_COOKIE}=`) && c.length > LOCALE_COOKIE.length + 1)
}
