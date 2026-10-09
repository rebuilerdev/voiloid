import { isPrismaError } from "@voiloid/database"
import { conflict, notFound, validationError } from "@voiloid/shared"
import type { DictionaryEntry, DictionaryEntryInput } from "@voiloid/shared/contracts"

import type { AppDeps } from "../deps"
import type { Session } from "../lib/session"
import type { AccessService } from "./access.service"
import type { LiveService } from "./live.service"

const toApi = (e: { id: string; word: string; reading: string; createdAt: Date }): DictionaryEntry => ({
  id: e.id,
  word: e.word,
  reading: e.reading,
  createdAt: e.createdAt.toISOString(),
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createDictionaryService(deps: AppDeps, access: AccessService, live: LiveService) {
  /** Unique 制約違反を「既に登録されている」に変換する */
  async function guardDuplicate<T>(operation: Promise<T>): Promise<T> {
    try {
      return await operation
    } catch (error) {
      if (isPrismaError(error, "P2002")) throw conflict("This word is already registered.")
      throw error
    }
  }

  const audit = (
    session: Session,
    guildId: string,
    action: string,
    targetId: string,
    ipHash: string,
    asOperator?: boolean,
  ) =>
    deps.repos.audit.record({
      actorUserId: session.userId,
      guildId,
      action,
      targetType: "dictionary",
      targetId,
      ipHash,
      ...(asOperator ? { metadata: { asOperator: true } } : {}),
    })

  return {
    async list(session: Session, discordGuildId: string): Promise<DictionaryEntry[]> {
      const { guild } = await access.requireManageableInstalled(session, discordGuildId)
      return (await deps.repos.dictionary.list(guild.id)).map(toApi)
    },

    async create(session: Session, discordGuildId: string, input: DictionaryEntryInput, ipHash: string) {
      const { guild, asOperator } = await access.requireManageableInstalled(session, discordGuildId)
      const { dictionaryMaxEntries } = await deps.repos.system.get()
      if ((await deps.repos.dictionary.count(guild.id)) >= dictionaryMaxEntries) {
        throw validationError(`A server can register up to ${dictionaryMaxEntries} words.`)
      }
      const entry = await guardDuplicate(deps.repos.dictionary.create(guild.id, input, session.userId))
      await audit(session, guild.id, "dictionary.create", entry.id, ipHash, asOperator)
      await live.invalidate({ kind: "guild", guildId: discordGuildId })
      return toApi(entry)
    },

    async update(
      session: Session,
      discordGuildId: string,
      entryId: string,
      input: DictionaryEntryInput,
      ipHash: string,
    ) {
      const { guild, asOperator } = await access.requireManageableInstalled(session, discordGuildId)
      if (!UUID.test(entryId)) throw notFound("Dictionary entry")
      const entry = await guardDuplicate(deps.repos.dictionary.update(guild.id, entryId, input))
      if (!entry) throw notFound("Dictionary entry")
      await audit(session, guild.id, "dictionary.update", entry.id, ipHash, asOperator)
      await live.invalidate({ kind: "guild", guildId: discordGuildId })
      return toApi(entry)
    },

    async delete(session: Session, discordGuildId: string, entryId: string, ipHash: string): Promise<void> {
      const { guild, asOperator } = await access.requireManageableInstalled(session, discordGuildId)
      if (!UUID.test(entryId) || !(await deps.repos.dictionary.delete(guild.id, entryId))) {
        throw notFound("Dictionary entry")
      }
      await audit(session, guild.id, "dictionary.delete", entryId, ipHash, asOperator)
      await live.invalidate({ kind: "guild", guildId: discordGuildId })
    },
  }
}

export type DictionaryService = ReturnType<typeof createDictionaryService>
