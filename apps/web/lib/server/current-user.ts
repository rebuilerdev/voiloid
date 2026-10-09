import "server-only"

import { cache } from "react"

import { getMe } from "@/services/me"

/** 1 リクエスト内で /api/me の呼び出しをまとめる（サイドバーとヘッダーで共用） */
export const getCurrentUser = cache(getMe)
