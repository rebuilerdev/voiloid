"use client"

import { useEffect, useRef, useState } from "react"

import { WORKER_POLL_INTERVAL_MS } from "@/lib/config"

/**
 * 一定間隔でデータを再取得する（仕様書 §80）。タブが非表示の間は止める。
 * 将来 WebSocket / SSE に置き換える場合はこのフックを差し替える。
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  initial: T,
  { intervalMs = WORKER_POLL_INTERVAL_MS, immediate = false }: { intervalMs?: number; immediate?: boolean } = {}
) {
  const [data, setData] = useState(initial)
  const fetcherRef = useRef(fetcher)

  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      if (document.visibilityState !== "visible") return
      try {
        const next = await fetcherRef.current()
        if (!cancelled) setData(next)
      } catch {
        // 一時的な失敗は次回の更新で回復させる（表示中のデータは維持）
      }
    }
    if (immediate) void tick()
    const id = setInterval(tick, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [intervalMs, immediate])

  return [data, setData] as const
}
