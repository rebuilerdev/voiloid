import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { Guild } from "@/types/guild"

export function GuildIcon({ guild, size = "default" }: { guild: Pick<Guild, "name" | "iconUrl">; size?: "sm" | "default" | "lg" }) {
  return (
    <Avatar size={size}>
      {guild.iconUrl && <AvatarImage src={guild.iconUrl} alt="" />}
      <AvatarFallback>{guild.name.slice(0, 1)}</AvatarFallback>
    </Avatar>
  )
}
