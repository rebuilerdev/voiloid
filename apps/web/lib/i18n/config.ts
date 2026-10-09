export const locales = ["ja", "en"] as const
export type Locale = (typeof locales)[number]

export function isLocale(value: string | undefined | null): value is Locale {
  return locales.includes(value as Locale)
}

/** ブラウザ設定（Accept-Language）から言語を選ぶ。日本語以外は英語 */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return "en"
  const preferred = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=")
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 }
    })
    .sort((a, b) => b.q - a.q)
  for (const { tag } of preferred) {
    if (tag.startsWith("ja")) return "ja"
    if (tag.startsWith("en")) return "en"
  }
  return "en"
}

/** "{name} を削除" のようなテンプレートに値を埋め込む */
export function fmt(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`))
}
