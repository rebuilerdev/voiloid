"use client"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** アイコンのみのボタン。aria-label と Tooltip を必ず付ける（仕様書 §69） */
export function IconButton({
  label,
  children,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "aria-label"> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant={variant} size={size} aria-label={label} {...props} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
