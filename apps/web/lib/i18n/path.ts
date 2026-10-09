import { locales } from "@/lib/i18n/config"

/**
 * proxy が /dashboard → /ja/dashboard に rewrite するため、
 * サーバー描画時の pathname には言語が付く。比較前に取り除く。
 */
export function stripLocale(pathname: string) {
  for (const l of locales) {
    if (pathname === `/${l}`) return "/"
    if (pathname.startsWith(`/${l}/`)) return pathname.slice(l.length + 1)
  }
  return pathname
}
