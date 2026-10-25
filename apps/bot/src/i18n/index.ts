/**
 * Bot の文言の多言語化。言語はコマンドを実行した人の Discord の言語設定で決める（日本語以外は英語。Web と同じ）。
 */
import { en } from "./en"
import { ja, type Messages } from "./ja"

export type { Messages } from "./ja"

export type Locale = "ja" | "en"

const dictionaries: Record<Locale, Messages> = { ja, en }

/** Discord の locale（"ja"・"en-US" など）から Bot の言語を選ぶ */
export function localeFromDiscord(locale: string | null | undefined): Locale {
  return locale?.startsWith("ja") ? "ja" : "en"
}

export function messages(locale: Locale): Messages {
  return dictionaries[locale]
}

/** "{name} を削除" のようなテンプレートに値を埋め込む */
export function fmt(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`))
}
