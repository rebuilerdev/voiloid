"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { useI18n } from "@/components/providers"
import type { Page } from "@/types/admin"

/**
 * カーソル方式のページングの一覧（「さらに読み込む」と、検索条件の変更）。
 * 検索条件が変わったら一覧を読み直す。入力中の連続した変更はまとめる。
 */
export function useCursorList<T, F>(
  initial: Page<T>,
  load: (filter: F, cursor?: string) => Promise<Page<T>>,
  filter: F,
  { debounceMs = 300 }: { debounceMs?: number } = {}
) {
  const { t } = useI18n()
  const [items, setItems] = useState(initial.items)
  const [nextCursor, setNextCursor] = useState(initial.nextCursor)
  const [loading, setLoading] = useState(false)
  const loadRef = useRef(load)
  const key = JSON.stringify(filter)
  const first = useRef(true)
  // サーバーが一覧を読み込んだときの検索条件
  const [serverFilter] = useState(key)
  const [reload, setReload] = useState(0)

  // サーバーから新しい一覧が届いたら（別のページから戻ったときなど）、表示を置き換える。
  // 検索条件を変えているときは、その条件で読み直す
  const [synced, setSynced] = useState(() => JSON.stringify(initial))
  const initialKey = JSON.stringify(initial)
  if (initialKey !== synced) {
    setSynced(initialKey)
    if (key === serverFilter) {
      setItems(initial.items)
      setNextCursor(initial.nextCursor)
    } else {
      setReload((n) => n + 1)
    }
  }

  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    // 初回はサーバーで読み込んだ一覧を使う
    if (first.current) {
      first.current = false
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const page = await loadRef.current(JSON.parse(key) as F)
        if (cancelled) return
        setItems(page.items)
        setNextCursor(page.nextCursor)
      } catch {
        if (!cancelled) toast.error(t.errors.generic)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, debounceMs)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [key, debounceMs, t, reload])

  async function loadMore() {
    if (!nextCursor || loading) return
    setLoading(true)
    try {
      const page = await loadRef.current(JSON.parse(key) as F, nextCursor)
      setItems((current) => [...current, ...page.items])
      setNextCursor(page.nextCursor)
    } catch {
      toast.error(t.errors.generic)
    } finally {
      setLoading(false)
    }
  }

  return { items, nextCursor, loading, loadMore, setItems }
}
