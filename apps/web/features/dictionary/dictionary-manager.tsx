"use client"

import { useState } from "react"
import { BookOpenTextIcon, PlusIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { EmptyState } from "@/components/common/empty-state"
import { useI18n } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { fmt } from "@/lib/i18n/config"
import {
  createDictionaryEntry,
  deleteDictionaryEntry,
  updateDictionaryEntry,
} from "@/services/dictionary"
import { isApiError } from "@/services/http"
import type { DictionaryEntry, DictionaryEntryInput } from "@/types/dictionary"

import { DictionaryEntryDialog, type DictionaryDialogState } from "@/features/dictionary/dictionary-entry-dialog"
import { DictionarySearch } from "@/features/dictionary/dictionary-search"
import { DictionaryTable } from "@/features/dictionary/dictionary-table"

/** Dictionary（仕様書 §20〜23） */
export function DictionaryManager({ guildId, initial }: { guildId: string; initial: DictionaryEntry[] }) {
  const { t } = useI18n()
  const [entries, setEntries] = useState(initial)
  const [query, setQuery] = useState("")
  const [dialog, setDialog] = useState<DictionaryDialogState>(null)
  const [deleting, setDeleting] = useState<DictionaryEntry | null>(null)

  const q = query.trim().toLowerCase()
  const filtered = q
    ? entries.filter((e) => e.word.toLowerCase().includes(q) || e.reading.toLowerCase().includes(q))
    : entries

  function errorToast(error: unknown) {
    toast.error(
      isApiError(error) && error.code === "CONFLICT"
        ? t.dictionary.duplicate
        : isApiError(error) && error.code === "VALIDATION_ERROR"
          ? t.errors.validation
          : t.errors.saveFailed
    )
  }

  async function submit(input: DictionaryEntryInput) {
    try {
      if (dialog?.mode === "edit") {
        const updated = await updateDictionaryEntry(guildId, dialog.entry.id, input)
        setEntries((list) => list.map((e) => (e.id === updated.id ? updated : e)))
        toast.success(t.toast.dictionaryUpdated)
      } else {
        const created = await createDictionaryEntry(guildId, input)
        setEntries((list) => [created, ...list])
        toast.success(t.toast.dictionaryAdded)
      }
      setDialog(null)
    } catch (error) {
      errorToast(error)
      throw error
    }
  }

  async function remove() {
    if (!deleting) return
    try {
      await deleteDictionaryEntry(guildId, deleting.id)
      setEntries((list) => list.filter((e) => e.id !== deleting.id))
      toast.success(t.toast.dictionaryDeleted)
    } catch (error) {
      errorToast(error)
      throw error
    }
  }

  const addButton = (
    <Button onClick={() => setDialog({ mode: "add" })}>
      <PlusIcon data-icon="inline-start" />
      {t.dictionary.add}
    </Button>
  )

  return (
    <>
      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <DictionarySearch value={query} onChange={setQuery} />
          <span className="text-xs text-muted-foreground tabular-nums">
            {fmt(t.dictionary.count, { count: entries.length })}
          </span>
          <div className="ml-auto">{addButton}</div>
        </div>

        {entries.length === 0 ? (
          <EmptyState
            icon={<BookOpenTextIcon />}
            title={t.dictionary.emptyTitle}
            description={t.dictionary.emptyDescription}
            action={addButton}
          />
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-xs text-muted-foreground">{fmt(t.dictionary.noMatch, { query })}</p>
        ) : (
          <div className="overflow-x-auto">
            <DictionaryTable entries={filtered} onEdit={(entry) => setDialog({ mode: "edit", entry })} onDelete={setDeleting} />
          </div>
        )}
      </Card>

      <DictionaryEntryDialog
        state={dialog}
        existingWords={entries
          .filter((e) => dialog?.mode !== "edit" || e.id !== dialog.entry.id)
          .map((e) => e.word)}
        onClose={() => setDialog(null)}
        onSubmit={submit}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t.dictionary.deleteTitle}
        description={fmt(t.dictionary.deleteDescription, { word: deleting?.word ?? "" })}
        confirmLabel={t.common.delete}
        destructive
        onConfirm={remove}
      />
    </>
  )
}
