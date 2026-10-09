"use client"

import { CpuIcon, PlusIcon } from "@phosphor-icons/react"

import { EmptyState } from "@/components/common/empty-state"
import { GuardedLink } from "@/components/common/unsaved-changes"
import { useI18n } from "@/components/providers"
import { buttonVariants } from "@/components/ui/button"
import { usePolling } from "@/hooks/use-polling"
import { listWorkers } from "@/services/workers"
import type { Worker } from "@/types/worker"

import { privateWorkers } from "@/features/workers/utils"
import { OfficialWorkersSummary } from "@/features/workers/official-workers-summary"
import { WorkerCard } from "@/features/workers/worker-card"

/** Workers 一覧（仕様書 §29〜31）。自動更新する */
export function WorkerList({ initial }: { initial: Worker[] }) {
  const { t } = useI18n()
  const [workers] = usePolling(listWorkers, initial)
  const mine = privateWorkers(workers)

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="my-workers">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="my-workers" className="font-heading text-sm font-semibold">
              {t.workers.myWorkers}
            </h2>
            <p className="text-xs text-muted-foreground">{t.workers.myWorkersHint}</p>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 animate-pulse bg-success" aria-hidden />
            {t.workers.autoRefresh}
          </span>
        </div>
        {mine.length === 0 ? (
          <div className="ring-1 ring-foreground/10">
            <EmptyState
              icon={<CpuIcon />}
              title={t.workers.emptyTitle}
              description={t.workers.emptyDescription}
              action={
                <GuardedLink href="/workers/new" className={buttonVariants()}>
                  <PlusIcon data-icon="inline-start" />
                  {t.workers.add}
                </GuardedLink>
              }
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {mine.map((w) => (
              <WorkerCard key={w.id} worker={w} />
            ))}
          </div>
        )}
      </section>

      <OfficialWorkersSummary workers={workers} />
    </div>
  )
}
