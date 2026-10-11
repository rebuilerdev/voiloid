"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT"
  )
}

/**
 * ログイン画面のテーマ切り替え（rebuiler.dev のフッターと同じ）。
 * キーボードのある端末では「d キーで切り替え」と案内し、スマホなどでは押して切り替える。
 * どちらの端末でも、押せば切り替わる。
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      // ブラウザの自動入力などで、key のない keydown が届くことがある
      if (event.key?.toLowerCase() !== "d") return
      if (isTypingTarget(event.target)) return
      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [resolvedTheme, setTheme])

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className={className}
    >
      {/* ホバーできる端末（マウスのある端末）だけ、キーの案内を出す */}
      <span className="hidden [@media(hover:hover)]:inline">
        Press <kbd>d</kbd> to toggle theme
      </span>
      <span className="[@media(hover:hover)]:hidden">Tap to toggle theme</span>
    </button>
  )
}
