import type { DictionaryEntry, DictionaryEntryInput } from "@/types/dictionary"
import { apiRequest } from "@/services/http"

const base = (guildId: string) => `/api/guilds/${encodeURIComponent(guildId)}/dictionary`

export function listDictionary(guildId: string) {
  return apiRequest<DictionaryEntry[]>("GET", base(guildId))
}

export function createDictionaryEntry(guildId: string, input: DictionaryEntryInput) {
  return apiRequest<DictionaryEntry>("POST", base(guildId), input)
}

export function updateDictionaryEntry(guildId: string, entryId: string, input: DictionaryEntryInput) {
  return apiRequest<DictionaryEntry>("PATCH", `${base(guildId)}/${encodeURIComponent(entryId)}`, input)
}

export function deleteDictionaryEntry(guildId: string, entryId: string) {
  return apiRequest<null>("DELETE", `${base(guildId)}/${encodeURIComponent(entryId)}`)
}
