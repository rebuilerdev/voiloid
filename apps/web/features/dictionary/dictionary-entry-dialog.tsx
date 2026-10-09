"use client"

import { useState } from "react"
import { SpinnerGapIcon } from "@phosphor-icons/react"

import { useI18n } from "@/components/providers"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { fmt } from "@/lib/i18n/config"
import { DICTIONARY_LENGTH, type DictionaryEntry, type DictionaryEntryInput } from "@/types/dictionary"

export type DictionaryDialogState = { mode: "add" } | { mode: "edit"; entry: DictionaryEntry } | null

/** 追加・編集モーダル（仕様書 §22）。単語・読みは必須 */
export function DictionaryEntryDialog({
  state,
  existingWords,
  onClose,
  onSubmit,
}: {
  state: DictionaryDialogState
  existingWords: string[]
  onClose: () => void
  /** 例外を投げた場合はモーダルを開いたままにする */
  onSubmit: (input: DictionaryEntryInput) => Promise<void>
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {state && (
          <EntryForm
            key={state.mode === "edit" ? state.entry.id : "add"}
            state={state}
            existingWords={existingWords}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function validate(value: string, { max }: { max: number }, t: ReturnType<typeof useI18n>["t"]) {
  const trimmed = value.trim()
  if (!trimmed) return t.dictionary.required
  if (trimmed.length > max) return fmt(t.dictionary.tooLong, { max })
  return null
}

function EntryForm({
  state,
  existingWords,
  onSubmit,
}: {
  state: NonNullable<DictionaryDialogState>
  existingWords: string[]
  onSubmit: (input: DictionaryEntryInput) => Promise<void>
}) {
  const { t } = useI18n()
  const initial = state.mode === "edit" ? state.entry : undefined
  const [word, setWord] = useState(initial?.word ?? "")
  const [reading, setReading] = useState(initial?.reading ?? "")
  const [touched, setTouched] = useState(false)
  const [pending, setPending] = useState(false)

  const wordError =
    validate(word, DICTIONARY_LENGTH.word, t) ?? (existingWords.includes(word.trim()) ? t.dictionary.duplicate : null)
  const readingError = validate(reading, DICTIONARY_LENGTH.reading, t)
  const showWordError = wordError && (touched || word !== "")
  const showReadingError = readingError && (touched || reading !== "")

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        setTouched(true)
        if (wordError || readingError || pending) return
        setPending(true)
        try {
          await onSubmit({ word: word.trim(), reading: reading.trim() })
        } catch {
          // Toast は呼び出し側で表示
        } finally {
          setPending(false)
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{state.mode === "edit" ? t.dictionary.editTitle : t.dictionary.addTitle}</DialogTitle>
        <DialogDescription>{t.dictionary.dialogDescription}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={showWordError || undefined}>
          <FieldLabel htmlFor="dict-word">{t.dictionary.word}</FieldLabel>
          <Input
            id="dict-word"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder={t.dictionary.wordPlaceholder}
            aria-invalid={showWordError || undefined}
            required
            maxLength={DICTIONARY_LENGTH.word.max}
            autoFocus
          />
          {showWordError ? <FieldError>{wordError}</FieldError> : <FieldDescription>{t.dictionary.wordHint}</FieldDescription>}
        </Field>
        <Field data-invalid={showReadingError || undefined}>
          <FieldLabel htmlFor="dict-reading">{t.dictionary.reading}</FieldLabel>
          <Input
            id="dict-reading"
            value={reading}
            onChange={(e) => setReading(e.target.value)}
            placeholder={t.dictionary.readingPlaceholder}
            aria-invalid={showReadingError || undefined}
            required
            maxLength={DICTIONARY_LENGTH.reading.max}
          />
          {showReadingError ? (
            <FieldError>{readingError}</FieldError>
          ) : (
            <FieldDescription>{t.dictionary.readingHint}</FieldDescription>
          )}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{t.common.cancel}</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending && <SpinnerGapIcon className="animate-spin" />}
          {state.mode === "edit" ? t.common.save : t.common.add}
        </Button>
      </DialogFooter>
    </form>
  )
}
