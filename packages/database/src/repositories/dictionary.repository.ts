import type { DbClient } from "../client"

/** 重複判定用のキー（全角半角・大文字小文字の違いを同一視する） */
export const dictionaryWordKey = (word: string) => word.normalize("NFKC").toLowerCase()

export interface DictionaryInput {
  word: string
  reading: string
}

const listSelect = { id: true, word: true, reading: true, createdAt: true } as const

export function dictionaryRepository(db: DbClient) {
  return {
    list(guildId: string) {
      return db.dictionaryEntry.findMany({
        where: { guildId },
        select: listSelect,
        orderBy: [{ word: "asc" }, { id: "asc" }],
      })
    },

    /** 読み上げ時の置換用（Bot がキャッシュする） */
    listRules(guildId: string) {
      return db.dictionaryEntry.findMany({ where: { guildId }, select: { word: true, reading: true } })
    },

    count(guildId: string) {
      return db.dictionaryEntry.count({ where: { guildId } })
    },

    findById(guildId: string, id: string) {
      return db.dictionaryEntry.findFirst({ where: { id, guildId }, select: listSelect })
    },

    findByWord(guildId: string, word: string) {
      return db.dictionaryEntry.findUnique({
        where: { guildId_wordKey: { guildId, wordKey: dictionaryWordKey(word) } },
        select: listSelect,
      })
    },

    /** 重複時は Unique 制約違反（P2002）を投げる */
    create(guildId: string, input: DictionaryInput, createdByUserId: string | null) {
      return db.dictionaryEntry.create({
        data: { guildId, ...input, wordKey: dictionaryWordKey(input.word), createdByUserId },
        select: listSelect,
      })
    },

    /** 対象が無ければ null。単語の変更で重複した場合は Unique 制約違反を投げる */
    async update(guildId: string, id: string, input: DictionaryInput) {
      const result = await db.dictionaryEntry.updateMany({
        where: { id, guildId },
        data: { ...input, wordKey: dictionaryWordKey(input.word) },
      })
      return result.count === 0 ? null : db.dictionaryEntry.findUnique({ where: { id }, select: listSelect })
    },

    /** 削除できたら true */
    async delete(guildId: string, id: string): Promise<boolean> {
      const result = await db.dictionaryEntry.deleteMany({ where: { id, guildId } })
      return result.count > 0
    },

    /** Bot の /dict add: 既にあれば読みを上書きする */
    upsertByWord(guildId: string, input: DictionaryInput, createdByUserId: string | null) {
      const wordKey = dictionaryWordKey(input.word)
      return db.dictionaryEntry.upsert({
        where: { guildId_wordKey: { guildId, wordKey } },
        create: { guildId, ...input, wordKey, createdByUserId },
        update: { word: input.word, reading: input.reading },
        select: listSelect,
      })
    },

    /** Bot の /dict remove */
    async deleteByWord(guildId: string, word: string): Promise<boolean> {
      const result = await db.dictionaryEntry.deleteMany({ where: { guildId, wordKey: dictionaryWordKey(word) } })
      return result.count > 0
    },
  }
}

export type DictionaryRepository = ReturnType<typeof dictionaryRepository>
