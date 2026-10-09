"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowsClockwiseIcon, TrashIcon, WarningIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { CodeBlock } from "@/components/common/copy-button"
import { useI18n } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { fmt } from "@/lib/i18n/config"
import { deleteWorker, regenerateWorkerToken } from "@/services/workers"
import type { Worker } from "@/types/worker"

/**
 * Danger Zone（仕様書 §37, §38）。
 * 再発行したトークンはこのコンポーネントの state にのみ保持し、localStorage 等には保存しない。
 */
export function WorkerDangerZone({ worker }: { worker: Worker }) {
  const { t } = useI18n()
  const router = useRouter()
  const [confirm, setConfirm] = useState<"token" | "delete" | null>(null)
  const [token, setToken] = useState<string | null>(null)

  async function regenerate() {
    try {
      const res = await regenerateWorkerToken(worker.id)
      setToken(res.token)
      toast.success(t.toast.tokenRegenerated)
    } catch (error) {
      toast.error(t.errors.generic)
      throw error
    }
  }

  async function remove() {
    try {
      await deleteWorker(worker.id)
      toast.success(t.toast.workerDeleted)
      router.push("/workers")
      router.refresh()
    } catch (error) {
      toast.error(t.errors.generic)
      throw error
    }
  }

  return (
    <Card className="ring-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-destructive">
          <WarningIcon weight="fill" className="size-4" aria-hidden />
          {t.workerDetail.dangerZone}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{t.workerDetail.regenerateToken}</span>
            <span className="text-muted-foreground">{t.workerDetail.regenerateTokenHint}</span>
          </div>
          <Button variant="outline" onClick={() => setConfirm("token")} className="shrink-0">
            <ArrowsClockwiseIcon data-icon="inline-start" />
            {t.workerDetail.regenerateToken}
          </Button>
        </div>
        <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{t.workerDetail.deleteWorker}</span>
            <span className="text-muted-foreground">{t.workerDetail.deleteWorkerHint}</span>
          </div>
          <Button
            onClick={() => setConfirm("delete")}
            className="shrink-0 bg-destructive text-white hover:bg-destructive/90"
          >
            <TrashIcon data-icon="inline-start" />
            {t.workerDetail.deleteWorker}
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirm === "token"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t.workerDetail.regenerateConfirmTitle}
        description={t.workerDetail.regenerateConfirmDescription}
        confirmLabel={t.workerDetail.regenerate}
        destructive
        onConfirm={regenerate}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={fmt(t.workerDetail.deleteConfirmTitle, { name: worker.name })}
        description={t.workerDetail.deleteConfirmDescription}
        confirmLabel={t.common.delete}
        destructive
        onConfirm={remove}
      />

      <Dialog open={token !== null} onOpenChange={(o) => !o && setToken(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.workerDetail.newToken}</DialogTitle>
            <DialogDescription>{t.workerDetail.newTokenHint}</DialogDescription>
          </DialogHeader>
          {token && <CodeBlock code={token} />}
          <DialogFooter>
            <Button onClick={() => setToken(null)}>{t.common.close}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
