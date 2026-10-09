import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** 初期ロード用の Skeleton 群（仕様書 §51） */

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} size="sm">
          <CardHeader>
            <Skeleton className="h-3 w-24" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function CardGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", className)} aria-busy>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="mt-2 ml-auto h-7 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <Card className="gap-0 py-0" aria-busy>
      <div className="border-b p-3">
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="flex flex-col">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex gap-4 border-b px-4 py-3 last:border-b-0">
            {Array.from({ length: columns }, (_, c) => (
              <Skeleton key={c} className={cn("h-4", c === 0 ? "w-40" : "flex-1")} />
            ))}
          </div>
        ))}
      </div>
    </Card>
  )
}

export function FormSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card aria-busy>
      <CardHeader>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-64" />
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-full max-w-md" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
