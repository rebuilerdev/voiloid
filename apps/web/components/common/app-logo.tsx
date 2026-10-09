import Image from "next/image"

import { cn } from "@/lib/utils"

/** Voiloid のロゴ（円形のアイコン）。大きさは className の size-* で指定する */
export function AppLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/voiloid.png"
      alt=""
      width={128}
      height={128}
      // 小さい画像のため最適化はしない（public の画像をそのまま配信する）
      unoptimized
      className={cn("shrink-0 rounded-full", className)}
    />
  )
}
