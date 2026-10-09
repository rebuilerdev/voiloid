"use client"

import { useSyncExternalStore } from "react"

import { useI18n } from "@/components/providers"

// 1 秒ごとに更新される共有クロック
let now = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function subscribe(listener: () => void) {
  listeners.add(listener)
  timer ??= setInterval(() => {
    now = Date.now()
    listeners.forEach((l) => l())
  }, 1000)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

/**
 * 「3秒前」形式の時刻。SSR とハイドレーション時は絶対時刻を出し、以降は相対表示に切り替える。
 */
export function RelativeTime({ iso }: { iso: string }) {
  const { f } = useI18n()
  const current = useSyncExternalStore(
    subscribe,
    () => now,
    () => null
  )
  return (
    <time dateTime={iso} title={f.dateTime(iso)} suppressHydrationWarning>
      {current === null ? f.dateTime(iso) : f.relative(iso, current)}
    </time>
  )
}
