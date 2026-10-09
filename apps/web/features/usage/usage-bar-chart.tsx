"use client"

import { useI18n } from "@/components/providers"
import { fmt } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"
import type { DailyUsage } from "@/types/usage"

/**
 * 日別の文字数（単一系列の簡易グラフ）。最終日を強調し、ホバーで詳細を表示する。
 * スクリーンリーダー向けに同じ内容の表も出力する。
 */
export function UsageBarChart({ data }: { data: DailyUsage[] }) {
  const { t, f } = useI18n()
  const max = Math.max(1, ...data.map((d) => d.characters))
  const dense = data.length > 10
  const last = data.length - 1

  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <div className={cn("flex h-52 items-end border-b", dense ? "gap-0.5" : "gap-2")}>
        {data.map((d, i) => (
          <div key={d.date} className="group/bar relative flex h-full flex-1 items-end justify-center">
            <div
              className={cn(
                "w-full max-w-12 transition-colors",
                i === last ? "bg-primary" : "bg-primary/45 group-hover/bar:bg-primary/70"
              )}
              style={{ height: `${(d.characters / max) * 100}%` }}
            />
            <div
              className={cn(
                "pointer-events-none absolute bottom-full z-10 mb-1 hidden min-w-max flex-col bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10 group-hover/bar:flex",
                i < 2 ? "left-0" : i > last - 2 ? "right-0" : ""
              )}
            >
              <span className="text-muted-foreground">{f.day(d.date)}</span>
              <span className="font-medium tabular-nums">{fmt(t.common.characters, { count: f.number(d.characters) })}</span>
              <span className="text-muted-foreground tabular-nums">
                {fmt(t.usage.requestsCount, { count: f.number(d.requests) })}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className={cn("flex text-xs", dense ? "gap-0.5" : "gap-2")}>
        {data.map((d, i) => {
          const show = !dense || i === last || (last - i) % 7 === 0
          return (
            <span
              key={d.date}
              className={cn(
                "flex-1 text-center whitespace-nowrap text-muted-foreground tabular-nums",
                i === last && "font-medium text-foreground",
                !show && "invisible"
              )}
            >
              {i === last ? t.usage.today : dense ? new Date(d.date).getUTCDate() : f.day(d.date)}
            </span>
          )
        })}
      </div>
      <figcaption className="sr-only">
        <table>
          <caption>{t.usage.chartCaption}</caption>
          <tbody>
            {data.map((d) => (
              <tr key={d.date}>
                <th>{d.date}</th>
                <td>{d.characters}</td>
                <td>{d.requests}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  )
}
