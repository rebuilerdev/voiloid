"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import Link from "next/link"

import { useI18n } from "@/components/providers"

type Guard = { setDirty: (key: string, dirty: boolean) => void; confirmLeave: () => boolean }

const UnsavedChangesContext = createContext<Guard | null>(null)

/**
 * 未保存の変更がある状態でのページ遷移を警告する（仕様書 §79）。
 * - リロード / タブを閉じる: beforeunload
 * - アプリ内リンク: GuardedLink（onNavigate で確認）
 */
export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  const dirtyKeys = useRef(new Set<string>())
  const [hasDirty, setHasDirty] = useState(false)

  useEffect(() => {
    if (!hasDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [hasDirty])

  const guard: Guard = {
    setDirty(key, dirty) {
      if (dirty) dirtyKeys.current.add(key)
      else dirtyKeys.current.delete(key)
      setHasDirty(dirtyKeys.current.size > 0)
    },
    confirmLeave() {
      if (dirtyKeys.current.size === 0) return true
      const ok = window.confirm(t.common.unsavedLeaveConfirm)
      if (ok) {
        dirtyKeys.current.clear()
        setHasDirty(false)
      }
      return ok
    },
  }

  return <UnsavedChangesContext.Provider value={guard}>{children}</UnsavedChangesContext.Provider>
}

export function useUnsavedChangesGuard() {
  return useContext(UnsavedChangesContext)
}

/** フォームの未保存状態を登録する */
export function useRegisterDirty(key: string, dirty: boolean) {
  const guard = useUnsavedChangesGuard()
  useEffect(() => {
    guard?.setDirty(key, dirty)
    return () => guard?.setDirty(key, false)
    // guard は再レンダーごとに作り直されるため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dirty])
}

/** 未保存の変更があれば遷移前に確認する Link */
export function GuardedLink(props: React.ComponentProps<typeof Link>) {
  const guard = useUnsavedChangesGuard()
  return (
    <Link
      {...props}
      onNavigate={(e) => {
        props.onNavigate?.(e)
        if (guard && !guard.confirmLeave()) e.preventDefault()
      }}
    />
  )
}
