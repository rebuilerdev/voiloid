/**
 * サービス全体の状態（運営コンソールで変更する）: 読み上げの一時停止・辞書の上限・利用停止中のユーザー。
 * 読み上げのたびに DB を読まないよう Bot 内に持ち、変更の通知（system / user）と定期的な再読み込みで更新する。
 */
import type { Repositories } from "@voiloid/database"
import { DICTIONARY_MAX_ENTRIES } from "@voiloid/shared"

export interface ServiceState {
  readingPaused(): boolean
  dictionaryMaxEntries(): number
  isUserSuspended(discordUserId: string): boolean
}

export function createServiceState(repos: Repositories) {
  let readingPaused = false
  let dictionaryMaxEntries: number = DICTIONARY_MAX_ENTRIES
  let suspendedUsers = new Set<string>()

  return {
    readingPaused: () => readingPaused,
    dictionaryMaxEntries: () => dictionaryMaxEntries,
    isUserSuspended: (discordUserId: string) => suspendedUsers.has(discordUserId),

    /** DB から読み直す。一時停止に切り替わったら true */
    async refresh(): Promise<{ pausedNow: boolean }> {
      const [system, suspended] = await Promise.all([repos.system.get(), repos.users.suspendedDiscordIds()])
      const pausedNow = system.readingPaused && !readingPaused
      readingPaused = system.readingPaused
      dictionaryMaxEntries = system.dictionaryMaxEntries
      suspendedUsers = new Set(suspended)
      return { pausedNow }
    },
  } satisfies ServiceState & Record<string, unknown>
}

export type ServiceStateStore = ReturnType<typeof createServiceState>
