import { SESSION_COOKIE } from "@/lib/config"
import { redirectTo } from "@/lib/redirect"

export function POST() {
  // 303: フォーム送信後に GET で /login を開く
  const res = redirectTo("/login", 303)
  res.cookies.delete(SESSION_COOKIE)
  return res
}
