"use client"

import { useState } from "react"

/**
 * サーバーから届いた値（props）を初期値にする state。
 * サーバーがページを作り直して、中身の違う値が届いたら、その値に置き換える。
 *
 * Next.js（Cache Components）は、移動する前のページを消さずに隠しておき、戻ったときに state ごと表示し直す。
 * ただの useState(initial) だと、戻ったときにサーバーから新しい値が届いても、古い値を表示し続けてしまう
 */
export function useSyncedState<T>(initial: T) {
  const [state, setState] = useState(initial)
  const [synced, setSynced] = useState(() => JSON.stringify(initial))
  const key = JSON.stringify(initial)
  if (key !== synced) {
    setSynced(key)
    setState(initial)
  }
  return [state, setState] as const
}
