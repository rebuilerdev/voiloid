import {
  CheckCircleIcon,
  MinusCircleIcon,
  SpinnerGapIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"

export type StatusTone = "success" | "warning" | "destructive" | "muted" | "info"

const toneClass: Record<StatusTone, string> = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
  info: "text-primary",
}

const toneIcon = {
  success: CheckCircleIcon,
  warning: WarningCircleIcon,
  destructive: XCircleIcon,
  muted: MinusCircleIcon,
  info: SpinnerGapIcon,
}

/**
 * 状態表示。色だけに頼らず、アイコン + テキストで表す（仕様書 §3, §69）。
 */
export function StatusBadge({
  tone,
  children,
  className,
  iconOnlyColor = false,
}: {
  tone: StatusTone
  children: React.ReactNode
  className?: string
  /** true の場合アイコンだけに色を付け、テキストは通常色 */
  iconOnlyColor?: boolean
}) {
  const Icon = toneIcon[tone]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap",
        !iconOnlyColor && toneClass[tone],
        className
      )}
    >
      <Icon
        weight="fill"
        aria-hidden
        className={cn("size-3.5 shrink-0", iconOnlyColor && toneClass[tone], tone === "info" && "animate-spin")}
      />
      {children}
    </span>
  )
}

/** 色付きの小さな四角 + テキスト（凡例的な表示用） */
export function StatusDot({
  tone,
  children,
  className,
}: {
  tone: StatusTone
  children: React.ReactNode
  className?: string
}) {
  const dot = {
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
    muted: "bg-muted-foreground/50",
    info: "bg-primary",
  }[tone]
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span aria-hidden className={cn("size-1.5 shrink-0", dot)} />
      {children}
    </span>
  )
}
