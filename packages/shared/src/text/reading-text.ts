/**
 * Discord のメッセージを読み上げ用のテキストに整形する（純粋関数）。
 */
import type { LongMessageBehavior } from "../contracts"

export interface DictionaryRule {
  word: string
  reading: string
}

/** 辞書置換。長い語を優先し、大文字小文字を区別しない。置換後の文字列は再置換しない */
export type Dictionary = (text: string) => string

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export function compileDictionary(rules: readonly DictionaryRule[]): Dictionary {
  const usable = rules.filter((r) => r.word.length > 0)
  if (usable.length === 0) return (text) => text

  const map = new Map(usable.map((r) => [r.word.toLowerCase(), r.reading]))
  const pattern = new RegExp(
    [...new Set(usable.map((r) => r.word))]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join("|"),
    "giu",
  )
  return (text) => text.replace(pattern, (match) => map.get(match.toLowerCase()) ?? match)
}

export interface ReadingTextOptions {
  readUrls: boolean
  maxCharacters: number
  longMessageBehavior: LongMessageBehavior
  dictionary?: Dictionary
  /** 添付ファイルの数 */
  attachments?: number
}

export const READING_PHRASES = {
  url: "URL省略",
  codeBlock: "コードブロック",
  spoiler: "伏せ字",
  attachment: "添付ファイル",
  truncated: "以下略",
} as const

const URL_PATTERN = /\bhttps?:\/\/[^\s<>]+/giu

const graphemeSegmenter = new Intl.Segmenter("ja", { granularity: "grapheme" })

/**
 * @param content メンションを名前に変換済みの本文（discord.js の cleanContent）
 * @returns 読み上げるテキスト。読み上げない場合は null
 */
export function toReadingText(content: string, options: ReadingTextOptions): string | null {
  let text = content
    .replace(/```[\s\S]*?```/gu, ` ${READING_PHRASES.codeBlock} `)
    .replace(/\|\|[\s\S]+?\|\|/gu, ` ${READING_PHRASES.spoiler} `)
    // カスタム絵文字 <:name:id> / <a:name:id> は名前だけ読む
    .replace(/<a?:(\w+):\d+>/gu, "$1")
    // タイムスタンプ <t:1700000000:R> は読まない
    .replace(/<t:\d+(?::[tTdDfFR])?>/gu, "")
    .replace(/`([^`]*)`/gu, "$1")

  text = options.readUrls ? text : text.replace(URL_PATTERN, ` ${READING_PHRASES.url} `)
  text = text.replace(/\s+/gu, " ").trim()

  if (options.dictionary) text = options.dictionary(text)
  if ((options.attachments ?? 0) > 0) text = `${text} ${READING_PHRASES.attachment}`.trim()
  if (text.length === 0) return null

  // 絵文字（結合文字を含む）を途中で切らないよう、書記素単位で数える
  const graphemes = Array.from(graphemeSegmenter.segment(text), (s) => s.segment)
  if (graphemes.length <= options.maxCharacters) return text
  if (options.longMessageBehavior === "skip") return null
  return `${graphemes.slice(0, options.maxCharacters).join("")} ${READING_PHRASES.truncated}`
}
