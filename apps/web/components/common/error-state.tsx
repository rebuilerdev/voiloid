import { LockKeyIcon, MagnifyingGlassIcon, WarningOctagonIcon } from "@phosphor-icons/react/ssr"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"

const icons = {
  error: WarningOctagonIcon,
  forbidden: LockKeyIcon,
  notFound: MagnifyingGlassIcon,
}

/**
 * 取得失敗・権限エラー・Not Found の表示（仕様書 §53〜55）。
 * 技術的な詳細（スタックトレース等）は表示しない。
 */
export function ErrorState({
  kind = "error",
  title,
  description,
  action,
  className,
}: {
  kind?: keyof typeof icons
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  const Icon = icons[kind]
  return (
    <Empty className={cn("py-16", className)} role={kind === "error" ? "alert" : undefined}>
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className={cn(kind === "error" && "bg-destructive/10 text-destructive")}
        >
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}
