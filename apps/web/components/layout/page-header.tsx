import { cn } from "@/lib/utils"

/** コンテンツ領域のタイトル・説明・アクション（仕様書 §74 PageHeader） */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="font-heading text-lg font-semibold">{title}</h1>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/** コンテンツ本体。最大幅 1600px（仕様書 §68） */
export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 p-4 md:p-6", className)}>
      {children}
    </div>
  )
}
