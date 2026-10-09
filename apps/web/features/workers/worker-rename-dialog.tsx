"use client"

import { useState } from "react"
import { SpinnerGapIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { useI18n } from "@/components/providers"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { renameWorker } from "@/services/workers"
import { WORKER_NAME_LENGTH, type Worker } from "@/types/worker"

export const isValidWorkerName = (name: string) =>
  name.trim().length >= WORKER_NAME_LENGTH.min && name.trim().length <= WORKER_NAME_LENGTH.max

export function WorkerRenameDialog({
  worker,
  open,
  onOpenChange,
  onRenamed,
}: {
  worker: Worker
  open: boolean
  onOpenChange: (open: boolean) => void
  onRenamed: (worker: Worker) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <RenameForm worker={worker} onDone={(w) => (onRenamed(w), onOpenChange(false))} />}
      </DialogContent>
    </Dialog>
  )
}

function RenameForm({ worker, onDone }: { worker: Worker; onDone: (worker: Worker) => void }) {
  const { t } = useI18n()
  const [name, setName] = useState(worker.name)
  const [pending, setPending] = useState(false)
  const valid = isValidWorkerName(name)

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!valid || pending) return
        setPending(true)
        try {
          const updated = await renameWorker(worker.id, name.trim())
          toast.success(t.toast.workerRenamed)
          onDone(updated)
        } catch {
          toast.error(t.errors.saveFailed)
        } finally {
          setPending(false)
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{t.workerDetail.renameTitle}</DialogTitle>
      </DialogHeader>
      <Field data-invalid={!valid || undefined}>
        <FieldLabel htmlFor="worker-name">{t.workerDetail.name}</FieldLabel>
        <Input
          id="worker-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={WORKER_NAME_LENGTH.max}
          aria-invalid={!valid || undefined}
          autoFocus
        />
        {valid ? (
          <FieldDescription>{t.workerDetail.nameHint}</FieldDescription>
        ) : (
          <FieldError>{t.workerDetail.nameError}</FieldError>
        )}
      </Field>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{t.common.cancel}</DialogClose>
        <Button type="submit" disabled={!valid || name.trim() === worker.name || pending}>
          {pending && <SpinnerGapIcon className="animate-spin" />}
          {t.common.save}
        </Button>
      </DialogFooter>
    </form>
  )
}
