export interface DictionaryEntry {
  id: string
  word: string
  reading: string
  createdAt: string
}

export interface DictionaryEntryInput {
  word: string
  reading: string
}

export const DICTIONARY_LENGTH = {
  word: { min: 1, max: 128 },
  reading: { min: 1, max: 256 },
} as const
