import { NextResponse, type NextRequest } from "next/server"

import { LOCALE_COOKIE, SESSION_COOKIE } from "@/lib/config"
import { isLocale, localeFromAcceptLanguage, locales } from "@/lib/i18n/config"

const PUBLIC_PATHS = ["/login"]

/** 言語の rewrite 済みであることを示すリクエストヘッダー */
const REWRITTEN_HEADER = "x-voiloid-locale"

/**
 * 1. 未ログインなら /login へ（仕様書 §70）
 * 2. 表示言語を決め、URL は変えずに /{locale}/... の root layout へ rewrite する
 *    （言語は Cookie → Accept-Language の順で決定）
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // /ja/... /en/... が直接指定された場合は言語なしの URL に正規化する
  const prefixed = locales.find((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))
  // 下の rewrite で書き換えたリクエストがもう一度 proxy を通る環境（standalone 出力）では、そのまま通す
  if (prefixed && request.headers.get(REWRITTEN_HEADER) === prefixed) return NextResponse.next()
  if (prefixed) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.slice(prefixed.length + 1) || "/"
    return NextResponse.redirect(url)
  }

  const loggedIn = request.cookies.has(SESSION_COOKIE)
  const isPublic = PUBLIC_PATHS.includes(pathname)

  if (!loggedIn && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`
    return NextResponse.redirect(url)
  }
  if (loggedIn && isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    url.search = ""
    return NextResponse.redirect(url)
  }

  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value
  const locale = isLocale(cookieLocale)
    ? cookieLocale
    : localeFromAcceptLanguage(request.headers.get("accept-language"))

  const url = request.nextUrl.clone()
  url.pathname = `/${locale}${pathname}`
  const headers = new Headers(request.headers)
  headers.set(REWRITTEN_HEADER, locale)
  return NextResponse.rewrite(url, { request: { headers } })
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
}
