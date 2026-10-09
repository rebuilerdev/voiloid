"use client"

import { useState } from "react"
import { SpinnerGapIcon } from "@phosphor-icons/react"

import { useI18n } from "@/components/providers"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

/**
 * 確認ダイアログ（仕様書 §67）。破壊的操作は destructive で赤ボタンにする。
 * onConfirm が完了するまでボタンを無効化し、連打を防ぐ。
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  confirmDisabled = false,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  confirmLabel: string
  destructive?: boolean
  confirmDisabled?: boolean
  /** 成功時はダイアログを閉じる。例外時は開いたまま */
  onConfirm: () => Promise<void> | void
  children?: React.ReactNode
}) {
  const { t } = useI18n()
  const [pending, setPending] = useState(false)

  async function confirm() {
    setPending(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      // エラー表示は onConfirm 側（Toast）で行う
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            className={destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            disabled={pending || confirmDisabled}
            onClick={confirm}
          >
            {pending && <SpinnerGapIcon className="animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
