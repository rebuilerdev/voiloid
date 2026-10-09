import "server-only"

import { lang } from "next/root-params"

import { createFormatters } from "@/lib/format"
import { isLocale, type Locale } from "@/lib/i18n/config"
import { dictionaries } from "@/lib/i18n/dictionaries"

/** Server Component 用。root param（/[lang]）から現在の言語を得る */
export async function getLocale(): Promise<Locale> {
  const value = await lang()
  return isLocale(value) ? value : "en"
}

export async function getDictionary() {
  return dictionaries[await getLocale()]
}

export async function getI18n() {
  const locale = await getLocale()
  return { locale, t: dictionaries[locale], f: createFormatters(locale) }
}
