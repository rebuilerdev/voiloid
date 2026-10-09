import "server-only"

import { cache } from "react"
import { notFound } from "next/navigation"

import { getGuild } from "@/services/guilds"
import { isApiError } from "@/services/http"

/** layout と page で同じ Guild を取得するため、1 リクエスト内でまとめる */
export const getGuildCached = cache(getGuild)

/** 404 は notFound() に変換し、それ以外のエラーはそのまま投げる（error.tsx が表示） */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound()
    throw error
  }
}

/**
 * Server Detail の子ページ用。
 * - 404: notFound()（Not Found 画面）
 * - 403 / Bot 未導入: null を返す（表示は layout が担当）
 */
export async function getGuildForPage(guildId: string) {
  try {
    const guild = await getGuildCached(guildId)
    return guild.botInstalled ? guild : null
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound()
    if (isApiError(error) && error.status === 403) return null
    throw error
  }
}
