"use client"

import { useId, useState } from "react"

import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { useI18n } from "@/components/providers"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { fmt } from "@/lib/i18n/config"
import { REASON_LENGTH } from "@/types/admin"

/**
 * 理由の入力が必要な確認ダイアログ（利用停止・削除など、運営者の影響の大きい操作）。
 * 理由は監査ログに残る。
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel: string
  onConfirm: (reason: string) => Promise<void>
}) {
  const { t } = useI18n()
  const id = useId()
  const [reason, setReason] = useState("")
  const trimmed = reason.trim()

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setReason("")
        onOpenChange(o)
      }}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      destructive
      confirmDisabled={trimmed.length < REASON_LENGTH.min || trimmed.length > REASON_LENGTH.max}
      onConfirm={async () => {
        await onConfirm(trimmed)
        setReason("")
      }}
    >
      <Field>
        <FieldLabel htmlFor={id}>{t.ops.reason}</FieldLabel>
        <Textarea
          id={id}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t.ops.reasonPlaceholder}
          maxLength={REASON_LENGTH.max}
          rows={3}
        />
        <FieldDescription>{fmt(t.ops.reasonHint, { max: REASON_LENGTH.max })}</FieldDescription>
      </Field>
    </ConfirmDialog>
  )
}
