"use client"

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useRegisterDirty } from "@/components/common/unsaved-changes"
import { useI18n } from "@/components/providers"
import { isApiError } from "@/services/http"

/**
 * 設定フォームの共通状態: 編集中の値・変更有無・保存中。
 * 変更があればページ遷移時に警告し、保存成功/失敗を Toast で通知する。
 */
export function useSettingsForm<T>(
  initial: T,
  submit: (values: T) => Promise<T>,
  options: { successMessage?: string } = {}
) {
  const { t } = useI18n()
  const router = useRouter()
  const key = useId()
  const [saved, setSaved] = useState(initial)
  const [values, setValues] = useState(initial)
  const [saving, setSaving] = useState(false)

  const dirty = JSON.stringify(saved) !== JSON.stringify(values)
  useRegisterDirty(key, dirty)

  // サーバーから新しい値が届いたら（別のページから戻ったときなど）、保存済みの値を置き換える。
  // 編集中の値は、変更していないときだけ置き換える
  const [synced, setSynced] = useState(() => JSON.stringify(initial))
  const initialKey = JSON.stringify(initial)
  if (initialKey !== synced) {
    setSynced(initialKey)
    setSaved(initial)
    if (!dirty) setValues(initial)
  }

  function set<K extends keyof T>(field: K, value: T[K]) {
    setValues((v) => ({ ...v, [field]: value }))
  }

  async function save() {
    if (!dirty || saving) return
    setSaving(true)
    try {
      const result = await submit(values)
      setSaved(result)
      setValues(result)
      toast.success(options.successMessage ?? t.toast.settingsSaved)
      // ヘッダーや一覧などサーバー側で描画している情報を更新する
      router.refresh()
    } catch (e) {
      toast.error(isApiError(e) && e.code === "RATE_LIMITED" ? t.errors.rateLimited : t.errors.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  return { values, setValues, set, dirty, saving, save, discard: () => setValues(saved) }
}
