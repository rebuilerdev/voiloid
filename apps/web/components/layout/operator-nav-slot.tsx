import { OperatorNav } from "@/components/layout/app-sidebar"
import { getCurrentUser } from "@/lib/server/current-user"

/** 運営者にだけ運営コンソールのナビゲーションを出す（API も運営者以外には 404 を返す） */
export async function OperatorNavSlot() {
  const user = await getCurrentUser()
  return user.isOperator ? <OperatorNav /> : null
}
