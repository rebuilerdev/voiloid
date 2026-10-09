"use client"

import { useState } from "react"
import { CheckIcon, CopyIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { IconButton } from "@/components/common/icon-button"
import { useI18n } from "@/components/providers"
import { Button } from "@/components/ui/button"

function useCopy(value: string) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error(t.common.copyFailed)
    }
  }
  return { copied, copy, t }
}

export function CopyButton({
  value,
  label,
  showLabel = false,
}: {
  value: string
  /** アイコンのみの場合の aria-label / Tooltip */
  label?: string
  showLabel?: boolean
}) {
  const { copied, copy, t } = useCopy(value)
  const icon = copied ? <CheckIcon className="text-success" /> : <CopyIcon />

  if (showLabel) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={copy}>
        {icon}
        {copied ? t.common.copied : t.common.copy}
      </Button>
    )
  }
  return (
    <IconButton type="button" label={copied ? t.common.copied : (label ?? t.common.copy)} onClick={copy}>
      {icon}
    </IconButton>
  )
}

/** コピーボタン付きのコードブロック */
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="relative min-w-0 bg-muted/60 ring-1 ring-foreground/10">
      {label && <div className="border-b px-3 py-1.5 text-xs text-muted-foreground">{label}</div>}
      <div className="absolute right-1 bottom-1">
        <CopyButton value={code} />
      </div>
      <pre className="overflow-x-auto p-3 pr-10 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  )
}
