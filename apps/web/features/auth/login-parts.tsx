import { cn } from "@/lib/utils"

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
