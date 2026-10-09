"use client"

import { useState } from "react"
import { ArrowsClockwiseIcon, SpinnerGapIcon } from "@phosphor-icons/react"

import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { Notice } from "@/components/common/notice"
import { RelativeTime } from "@/components/common/relative-time"
import { SaveBar } from "@/components/common/save-bar"
import { SimpleSelect } from "@/components/common/simple-select"
import { useI18n } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useSettingsForm } from "@/hooks/use-settings-form"
import { registerCommands, updateSystemSettings } from "@/services/admin"
import {
  canOperate,
  REASON_LENGTH,
  SYSTEM_LIMIT_RANGE,
  type OperatorRole,
  type SystemSettingsView,
} from "@/types/admin"
import { MAX_CHARACTERS_RANGE } from "@/types/guild"
import type { Voice, VoiceSettings } from "@/types/voice"

import { runAction } from "@/features/admin/run-action"
import { VoiceSettingsEditor } from "@/features/voices/voice-settings-editor"

type Values = {
  maxWorkersPerUser: number
  dictionaryMaxEntries: number
  maxCharactersLimit: number
  newGuildMaxCharacters: number
  newGuildVoice: VoiceSettings
  announcementMessage: string
  announcementLevel: "info" | "warning"
}

const toValues = (s: SystemSettingsView): Values => ({
  ...s.limits,
  newGuildMaxCharacters: s.newGuildDefaults.maxCharacters,
  newGuildVoice: s.newGuildDefaults.voice,
  announcementMessage: s.announcement?.message ?? "",
  announcementLevel: s.announcement?.level ?? "info",
})

const inside = (value: number, range: { min: number; max: number }) =>
  Number.isInteger(value) && value >= range.min && value <= range.max

/** サービス全体の設定（閲覧は viewer、変更は admin 以上） */
export function SystemSettings({
  initial,
  voices,
  role,
}: {
  initial: SystemSettingsView
  voices: Voice[]
  role: OperatorRole | null
}) {
  const { t } = useI18n()
  const canAdmin = canOperate(role, "admin")
  const [view, setView] = useState(initial)
  const form = useSettingsForm<Values>(
    toValues(initial),
    async (v) => {
      const message = v.announcementMessage.trim()
      const saved = await updateSystemSettings({
        limits: {
          maxWorkersPerUser: v.maxWorkersPerUser,
          dictionaryMaxEntries: v.dictionaryMaxEntries,
          maxCharactersLimit: v.maxCharactersLimit,
        },
        newGuildDefaults: { maxCharacters: v.newGuildMaxCharacters, voice: v.newGuildVoice },
        announcement: message ? { message, level: v.announcementLevel } : null,
      })
      setView(saved)
      return toValues(saved)
    },
    { successMessage: t.ops.systemSaved }
  )
  const v = form.values

  const invalid = {
    maxWorkersPerUser: !inside(v.maxWorkersPerUser, SYSTEM_LIMIT_RANGE.maxWorkersPerUser),
    dictionaryMaxEntries: !inside(v.dictionaryMaxEntries, SYSTEM_LIMIT_RANGE.dictionaryMaxEntries),
    maxCharactersLimit: !inside(v.maxCharactersLimit, SYSTEM_LIMIT_RANGE.maxCharactersLimit),
    newGuildMaxCharacters:
      !inside(v.newGuildMaxCharacters, MAX_CHARACTERS_RANGE) || v.newGuildMaxCharacters > v.maxCharactersLimit,
    announcement: v.announcementMessage.trim().length > REASON_LENGTH.max,
  }
  const hasError = Object.values(invalid).some(Boolean)

  function numberField({ field, label, range }: { field: keyof typeof invalid & keyof Values; label: string; range: { min: number; max: number } }) {
    const value = v[field] as number
    return (
      <Field className="max-w-xs" data-invalid={invalid[field] || undefined}>
        <FieldLabel htmlFor={`system-${field}`}>{label}</FieldLabel>
        <Input
          id={`system-${field}`}
          type="number"
          inputMode="numeric"
          min={range.min}
          max={range.max}
          value={Number.isNaN(value) ? "" : value}
          onChange={(e) => form.set(field, e.target.valueAsNumber)}
          aria-invalid={invalid[field] || undefined}
          disabled={!canAdmin}
          className="w-32 tabular-nums"
        />
        {invalid[field] && <FieldError>{`${range.min} – ${range.max}`}</FieldError>}
      </Field>
    )
  }

  return (
    <>
      {!canAdmin && <Notice tone="info">{t.ops.systemReadOnly}</Notice>}
      <p className="text-xs text-muted-foreground">
        {t.ops.updatedAt.split("{time}")[0]}
        <RelativeTime iso={view.updatedAt} />
      </p>

      <ReadingPause view={view} onChange={setView} disabled={!canAdmin} />

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!hasError) form.save()
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>{t.ops.announcement}</CardTitle>
            <CardDescription>{t.ops.announcementHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={invalid.announcement || undefined}>
                <FieldLabel htmlFor="system-announcement">{t.ops.announcementMessage}</FieldLabel>
                <Textarea
                  id="system-announcement"
                  value={v.announcementMessage}
                  onChange={(e) => form.set("announcementMessage", e.target.value)}
                  maxLength={REASON_LENGTH.max}
                  rows={2}
                  disabled={!canAdmin}
                />
              </Field>
              <Field className="max-w-xs">
                <FieldLabel htmlFor="system-announcement-level">{t.ops.announcementLevel}</FieldLabel>
                <SimpleSelect
                  id="system-announcement-level"
                  value={v.announcementLevel}
                  onValueChange={(level) => form.set("announcementLevel", level as Values["announcementLevel"])}
                  options={(["info", "warning"] as const).map((level) => ({ value: level, label: t.ops.levels[level] }))}
                  disabled={!canAdmin}
                />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.ops.limits}</CardTitle>
            <CardDescription>{t.ops.limitsHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              {numberField({
                field: "maxWorkersPerUser",
                label: t.ops.maxWorkersPerUser,
                range: SYSTEM_LIMIT_RANGE.maxWorkersPerUser,
              })}
              {numberField({
                field: "dictionaryMaxEntries",
                label: t.ops.dictionaryMaxEntries,
                range: SYSTEM_LIMIT_RANGE.dictionaryMaxEntries,
              })}
              {numberField({
                field: "maxCharactersLimit",
                label: t.ops.maxCharactersLimit,
                range: SYSTEM_LIMIT_RANGE.maxCharactersLimit,
              })}
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.ops.newGuildDefaults}</CardTitle>
            <CardDescription>{t.ops.newGuildDefaultsHint}</CardDescription>
          </CardHeader>
          <CardContent>
            {numberField({
              field: "newGuildMaxCharacters",
              label: t.ops.newGuildMaxCharacters,
              range: { min: MAX_CHARACTERS_RANGE.min, max: Math.min(MAX_CHARACTERS_RANGE.max, v.maxCharactersLimit || 1) },
            })}
          </CardContent>
        </Card>
        <VoiceSettingsEditor
          idPrefix="system-voice"
          voices={voices}
          title={t.ops.newGuildVoice}
          value={v.newGuildVoice}
          onChange={(next) => form.set("newGuildVoice", next)}
          disabled={!canAdmin}
        />

        {canAdmin && <SaveBar dirty={form.dirty} saving={form.saving} onDiscard={form.discard} disabled={hasError} />}
      </form>

      <SlashCommands disabled={!canAdmin} />
    </>
  )
}

/** 読み上げの一時停止（すぐに反映する。停止するときは確認する） */
function ReadingPause({
  view,
  onChange,
  disabled,
}: {
  view: SystemSettingsView
  onChange: (view: SystemSettingsView) => void
  disabled: boolean
}) {
  const { t } = useI18n()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)

  async function apply(readingPaused: boolean) {
    setPending(true)
    try {
      onChange(await runAction(t, () => updateSystemSettings({ readingPaused }), t.ops.systemSaved))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.ops.pause}</CardTitle>
        <CardDescription>{t.ops.pauseHint}</CardDescription>
      </CardHeader>
      <CardContent>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="system-reading-paused">{t.ops.readingPaused}</FieldLabel>
            {view.readingPaused && <FieldDescription>{t.ops.readingPausedBanner}</FieldDescription>}
          </FieldContent>
          <Switch
            id="system-reading-paused"
            checked={view.readingPaused}
            disabled={disabled || pending}
            onCheckedChange={(checked) => (checked ? setConfirming(true) : void apply(false).catch(() => undefined))}
          />
        </Field>
      </CardContent>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t.ops.pauseConfirmTitle}
        description={t.ops.pauseConfirmDescription}
        confirmLabel={t.ops.pause}
        destructive
        onConfirm={() => apply(true)}
      />
    </Card>
  )
}

function SlashCommands({ disabled }: { disabled: boolean }) {
  const { t } = useI18n()
  const [pending, setPending] = useState(false)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.ops.commands}</CardTitle>
        <CardDescription>{t.ops.commandsHint}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          disabled={disabled || pending}
          onClick={async () => {
            setPending(true)
            try {
              await runAction(t, registerCommands, t.ops.commandsRegistered)
            } catch {
              // Toast で表示済み
            } finally {
              setPending(false)
            }
          }}
        >
          {pending ? <SpinnerGapIcon className="animate-spin" /> : <ArrowsClockwiseIcon data-icon="inline-start" />}
          {t.ops.registerCommands}
        </Button>
      </CardContent>
    </Card>
  )
}
