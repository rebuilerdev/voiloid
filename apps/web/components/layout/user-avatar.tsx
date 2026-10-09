import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { CurrentUser } from "@/types/user"

export function UserAvatar({ user, size = "default" }: { user: CurrentUser; size?: "sm" | "default" | "lg" }) {
  return (
    <Avatar size={size}>
      {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
      <AvatarFallback>{user.displayName.slice(0, 1)}</AvatarFallback>
    </Avatar>
  )
}
