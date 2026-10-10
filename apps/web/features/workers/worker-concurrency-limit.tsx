"use client"

import { useState } from "react"

import { useI18n } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { fmt } from "@/lib/i18n/config"
import { WORKER_CONCURRENCY_RANGE, type Worker } from "@/types/worker"

import { runAction } from "@/features/admin/run-action"

const parseLimit = (value: string): number | null | "invalid" => {
  if (value.trim() === "") return null
  const n = Number(value)
  return Number.isInteger(n) && n >= WORKER_CONCURRENCY_RANGE.min && n <= WORKER_CONCURRENCY_RANGE.max ? n : "invalid"
}

/**
 * 同時処理の数（運営者・自鯖Worker の所有者）。空なら Worker の申告（MAX_CONCURRENCY）を使う。
 * 新しい Worker は Gateway から数を変えられる。古い Worker は申告より大きくできない。超えた依頼は Gateway で順番待ちになる。
 */
export function WorkerConcurrencyLimit<W extends Worker>({
  worker,
  canEdit,
  save,
  onSaved,
}: {
  worker: W
  canEdit: boolean
  save: (limit: number | null) => Promise<W>
  onSaved: (worker: W) => void
}) {
  const { t } = useI18n()
  const d = t.workerDetail
  const [value, setValue] = useState(worker.concurrencyLimit?.toString() ?? "")
  const [saving, setSaving] = useState(false)
  const parsed = parseLimit(value)
  const unchanged = parsed === (worker.concurrencyLimit ?? null)
  const id = `concurrency-limit-${worker.id}`

  async function submit(limit: number | null) {
    setSaving(true)
    try {
      const saved = await runAction(
        t,
        () => save(limit),
        limit === null ? d.concurrencyCleared : fmt(d.concurrencySaved, { count: String(limit) })
      )
      setValue(saved.concurrencyLimit?.toString() ?? "")
      onSaved(saved)
    } catch {
      // Toast で表示済み
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <span className="font-medium">{d.concurrencyTitle}</span>
      <p className="text-muted-foreground">{d.concurrencyHint}</p>
      {worker.workerConcurrency !== undefined && (
        <p className="text-muted-foreground tabular-nums">
          {fmt(d.concurrencyWorker, { count: String(worker.workerConcurrency) })}
        </p>
      )}
      {worker.concurrencyConfigurable === false && worker.workerConcurrency !== undefined && (
        <p role="status" className="text-warning">
          {fmt(d.concurrencyOutdated, { count: String(worker.workerConcurrency) })}
        </p>
      )}
      {canEdit ? (
        <form
          className="flex flex-wrap items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (parsed !== "invalid" && !unchanged) void submit(parsed)
          }}
        >
          <Field data-invalid={parsed === "invalid" || undefined} className="w-40">
            <FieldLabel htmlFor={id} className="sr-only">
              {d.concurrencyLabel}
            </FieldLabel>
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={WORKER_CONCURRENCY_RANGE.min}
              max={WORKER_CONCURRENCY_RANGE.max}
              step={1}
              value={value}
              placeholder={d.concurrencyNone}
              aria-label={d.concurrencyLabel}
              aria-invalid={parsed === "invalid" || undefined}
              onChange={(e) => setValue(e.target.value)}
            />
            {parsed === "invalid" && <FieldError>{d.concurrencyInvalid}</FieldError>}
          </Field>
          <Button type="submit" variant="outline" disabled={saving || parsed === "invalid" || unchanged}>
            {t.common.save}
          </Button>
          {worker.concurrencyLimit !== undefined && (
            <Button type="button" variant="ghost" disabled={saving} onClick={() => void submit(null)}>
              {d.concurrencyNone}
            </Button>
          )}
        </form>
      ) : (
        <FieldDescription className="tabular-nums">
          {worker.concurrencyLimit !== undefined ? worker.concurrencyLimit : d.concurrencyNone}
        </FieldDescription>
      )}
    </div>
  )
}
