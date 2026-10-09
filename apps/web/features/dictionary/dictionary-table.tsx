"use client"

import { PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react"

import { IconButton } from "@/components/common/icon-button"
import { useI18n } from "@/components/providers"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { fmt } from "@/lib/i18n/config"
import type { DictionaryEntry } from "@/types/dictionary"

/** 列: Word / Reading / Created / Actions（仕様書 §21）。表は横スクロール可能 */
export function DictionaryTable({
  entries,
  onEdit,
  onDelete,
}: {
  entries: DictionaryEntry[]
  onEdit: (entry: DictionaryEntry) => void
  onDelete: (entry: DictionaryEntry) => void
}) {
  const { t, f } = useI18n()
  return (
    <Table className="min-w-[480px]">
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">{t.dictionary.word}</TableHead>
          <TableHead>{t.dictionary.reading}</TableHead>
          <TableHead>{t.dictionary.created}</TableHead>
          <TableHead className="w-24 pr-4 text-right">{t.dictionary.actions}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="max-w-48 truncate pl-4 font-medium">{entry.word}</TableCell>
            <TableCell className="max-w-64 truncate">{entry.reading}</TableCell>
            <TableCell className="text-muted-foreground tabular-nums">{f.date(entry.createdAt)}</TableCell>
            <TableCell className="pr-4">
              <div className="flex justify-end gap-1">
                <IconButton label={fmt(t.dictionary.editAria, { word: entry.word })} onClick={() => onEdit(entry)}>
                  <PencilSimpleIcon />
                </IconButton>
                <IconButton
                  label={fmt(t.dictionary.deleteAria, { word: entry.word })}
                  onClick={() => onDelete(entry)}
                  className="text-destructive hover:text-destructive"
                >
                  <TrashIcon />
                </IconButton>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
