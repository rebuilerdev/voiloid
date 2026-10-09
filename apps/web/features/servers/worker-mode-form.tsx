"use client"

import { InfoIcon } from "@phosphor-icons/react"

import { SaveBar } from "@/components/common/save-bar"
import { SimpleSelect } from "@/components/common/simple-select"
import { useI18n } from "@/components/providers"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { useSettingsForm } from "@/hooks/use-settings-form"
import { updateGuildSettings } from "@/services/guilds"
import type { GuildSettings, WorkerMode } from "@/types/guild"
import type { Worker } from "@/types/worker"

type Values = Pick<GuildSettings, "workerMode" | "workerId" | "fallbackToOfficial">

const pick = (s: GuildSettings): Values => ({
  workerMode: s.workerMode,
  workerId: s.workerId,
  fallbackToOfficial: s.fallbackToOfficial,
})

const modes = [
  { value: "auto", title: "auto", hint: "autoHint" },
  { value: "official", title: "official", hint: "officialHint" },
  { value: "private_preferred", title: "privatePreferred", hint: "privatePreferredHint" },
  { value: "specific", title: "specific", hint: "specificHint" },
] as const

/** Worker Setting（仕様書 §24〜28） */
export function WorkerModeForm({
  guildId,
  settings,
  allowedWorkers,
}: {
  guildId: string
  settings: GuildSettings
  /** このサーバーで利用が許可された自鯖Worker */
  allowedWorkers: Worker[]
}) {
  const { t } = useI18n()
  const form = useSettingsForm(pick(settings), async (v) => pick(await updateGuildSettings(guildId, v)))
  const v = form.values
  const needsWorker = v.workerMode === "specific" && !allowedWorkers.some((w) => w.id === v.workerId)

  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!needsWorker) form.save()
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t.workerMode.title}</CardTitle>
          <CardDescription>{t.workerMode.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <RadioGroup
              aria-label={t.workerMode.title}
              value={v.workerMode}
              onValueChange={(mode) => form.set("workerMode", mode as WorkerMode)}
              className="grid gap-2 md:grid-cols-2"
            >
              {modes.map((m) => {
                const disabled =
                  (m.value === "specific" || m.value === "private_preferred") && allowedWorkers.length === 0
                return (
                  <FieldLabel
                    key={m.value}
                    htmlFor={`mode-${m.value}`}
                    className="has-data-checked:bg-primary/5 has-data-checked:ring-primary/40"
                  >
                    <Field orientation="horizontal" data-disabled={disabled || undefined}>
                      <FieldContent>
                        <FieldTitle>{t.workerMode[m.title]}</FieldTitle>
                        <FieldDescription>{t.workerMode[m.hint]}</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem id={`mode-${m.value}`} value={m.value} disabled={disabled} />
                    </Field>
                  </FieldLabel>
                )
              })}
            </RadioGroup>

            {allowedWorkers.length === 0 && (
              <p className="flex items-start gap-2 bg-muted/40 p-3 text-xs text-muted-foreground">
                <InfoIcon className="mt-px size-4 shrink-0" aria-hidden />
                <span>
                  {t.workerMode.noAllowedWorkers} {t.workerMode.allowHint}
                </span>
              </p>
            )}

            {v.workerMode === "private_preferred" && (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="fallback">{t.workerMode.fallback}</FieldLabel>
                  <FieldDescription>{t.workerMode.fallbackHint}</FieldDescription>
                </FieldContent>
                <Switch
                  id="fallback"
                  checked={v.fallbackToOfficial}
                  onCheckedChange={(c) => form.set("fallbackToOfficial", c)}
                />
              </Field>
            )}

            {v.workerMode === "specific" && (
              <Field className="max-w-sm" data-invalid={needsWorker || undefined}>
                <FieldLabel htmlFor="specific-worker">{t.workerMode.selectWorker}</FieldLabel>
                <SimpleSelect
                  id="specific-worker"
                  options={allowedWorkers.map((w) => ({ value: w.id, label: `${w.name} (${t.status[w.status]})` }))}
                  value={v.workerId ?? null}
                  onValueChange={(id) => form.set("workerId", id)}
                  placeholder={t.voice.selectPlaceholder}
                  invalid={needsWorker}
                />
                {needsWorker && <FieldError>{t.workerMode.workerRequired}</FieldError>}
              </Field>
            )}
          </FieldGroup>
        </CardContent>
      </Card>
      <SaveBar dirty={form.dirty} saving={form.saving} onDiscard={form.discard} disabled={needsWorker} />
    </form>
  )
}
