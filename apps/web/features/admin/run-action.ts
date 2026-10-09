"use client"

import { toast } from "sonner"

import type { Dictionary } from "@/lib/i18n/dictionaries"
import { fmt } from "@/lib/i18n/config"
import { isApiError } from "@/services/http"

/**
 * 運営者の操作を実行し、結果を Toast で知らせる。
 * 失敗したら例外を投げ直す（ConfirmDialog を開いたままにする）。
 */
export async function runAction<T>(t: Dictionary, action: () => Promise<T>, success: string | ((result: T) => string)) {
  try {
    const result = await action()
    toast.success(typeof success === "string" ? success : success(result))
    return result
  } catch (error) {
    toast.error(errorMessage(t, error))
    throw error
  }
}

function errorMessage(t: Dictionary, error: unknown) {
  if (!isApiError(error)) return t.errors.connectionFailed
  // Bot が動いていない・Discord の操作に失敗した
  if (error.status === 503) return fmt(t.ops.botFailed, { message: error.message })
  // 権限が足りない・自分自身や owner を対象にした（API のメッセージは英語のため、分かりやすい文言にする）
  if (error.status === 403) return t.ops.viewOnly
  if (error.status === 400) return t.errors.validation
  if (error.status === 429) return t.errors.rateLimited
  return t.errors.generic
}
