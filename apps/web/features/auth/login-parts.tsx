import { cn } from "@/lib/utils"

/** アイコンと同じ粒子の質感（SVG のノイズ） */
export const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")"

/** アイコンの配色を使った光（白 → ピンク → マゼンタ → 紫） */
export const ORB_GRADIENT =
  "radial-gradient(circle at 42% 70%, #ffffff 0%, #fde4ec 10%, #f8afc4 22%, #ed6486 40%, #c350a7 60%, #7d3490 78%, transparent 92%)"

/** 読み上げ中の波形。動きを減らす設定では止める（globals.css の .voiloid-wave） */
export function Waveform({ bars = 24, className }: { bars?: number; className?: string }) {
  return (
    <span aria-hidden className={cn("flex items-center gap-[3px]", className)}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className="voiloid-wave w-[3px] rounded-full bg-current"
          style={{ animationDelay: `${(i * 97) % 900}ms`, height: `${30 + ((i * 37) % 70)}%` }}
        />
      ))}
    </span>
  )
}

/** キャッチコピー。日本語が語の途中で改行されないよう、区切りの位置でだけ折り返す */
export function Tagline({
  line1,
  line2,
  line2ClassName,
}: {
  line1: string
  line2: readonly string[]
  line2ClassName?: string
}) {
  return (
    <>
      <span className="inline-block">{line1}</span>
      <br />
      {line2.map((segment) => (
        <span key={segment} className={cn("inline-block", line2ClassName)}>
          {segment}
        </span>
      ))}
    </>
  )
}
