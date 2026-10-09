/**
 * 運営者の権限。
 * - owner: .env の OPERATOR_DISCORD_USER_IDS（Web からは変更できない）
 * - admin / editor / viewer: Web で追加した運営者（DB）
 * 運営者でなければ運営コンソールの存在を明かさないため 404、権限が足りなければ 403。
 */
import { forbidden, notFound } from "@voiloid/shared"
import type { OperatorRole } from "@voiloid/shared/contracts"

import type { AppDeps } from "../deps"
import type { Session } from "../lib/session"

const RANK: Record<OperatorRole, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 }

export type OperatorLevel = Exclude<OperatorRole, "owner">

export function createOperatorService(deps: AppDeps) {
  const owners = new Set(deps.config.OPERATOR_DISCORD_USER_IDS)

  async function roleOf(discordUserId: string): Promise<OperatorRole | null> {
    if (owners.has(discordUserId)) return "owner"
    const operator = await deps.repos.operators.find(discordUserId)
    return operator ? (operator.role.toLowerCase() as OperatorLevel) : null
  }

  return {
    roleOf,
    isOwner: (discordUserId: string) => owners.has(discordUserId),
    owners: () => [...owners],

    /** 指定の権限以上か（運営者でなければ 404、足りなければ 403） */
    async require(session: Session, minimum: OperatorLevel): Promise<OperatorRole> {
      const role = await roleOf(session.discordUserId)
      if (!role) throw notFound("Resource")
      if (RANK[role] < RANK[minimum]) throw forbidden("Your operator role does not allow this action.")
      return role
    },

    /** 権限の判定（例外を投げない） */
    async allows(session: Session, minimum: OperatorLevel): Promise<boolean> {
      const role = await roleOf(session.discordUserId)
      return role !== null && RANK[role] >= RANK[minimum]
    },
  }
}

export type OperatorService = ReturnType<typeof createOperatorService>
