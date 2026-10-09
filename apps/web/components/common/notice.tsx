import { InfoIcon, ProhibitIcon, WarningIcon } from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"

const tones = {
  info: { border: "border-primary", icon: InfoIcon, color: "text-primary" },
  warning: { border: "border-warning", icon: WarningIcon, color: "text-warning" },
  destructive: { border: "border-destructive", icon: ProhibitIcon, color: "text-destructive" },
}

/** 画面内のお知らせ（利用停止中・一時停止中など）。色だけに頼らずアイコンと文言で伝える */
export function Notice({
  tone,
  children,
  action,
  className,
}: {
  tone: keyof typeof tones
  children: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  const { border, icon: Icon, color } = tones[tone]
  return (
    <div
      role={tone === "info" ? "status" : "alert"}
      className={cn("flex flex-wrap items-center gap-3 border-l-2 bg-muted/40 p-3 text-xs", border, className)}
    >
      <Icon weight="fill" className={cn("size-4 shrink-0", color)} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  )
}
