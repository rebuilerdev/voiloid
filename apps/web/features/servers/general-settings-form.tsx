"use client"

import { useState } from "react"

import { SaveBar } from "@/components/common/save-bar"
import { useI18n } from "@/components/providers"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { useSettingsForm } from "@/hooks/use-settings-form"
import { updateGuildSettings } from "@/services/guilds"
import {
  MAX_CHARACTERS_RANGE,
  type GuildChannel,
  type GuildSettings,
  type LongMessageBehavior,
  type ReadingMode,
} from "@/types/guild"

import { ChannelSelect } from "@/features/servers/channel-select"

type GeneralValues = Pick<
  GuildSettings,
  "readingMode" | "textChannelId" | "voiceChannelId" | "autoJoin" | "readUrls" | "maxCharacters" | "longMessageBehavior"
>

const pickGeneral = (s: GuildSettings): GeneralValues => ({
  readingMode: s.readingMode,
  textChannelId: s.textChannelId,
  voiceChannelId: s.voiceChannelId,
  autoJoin: s.autoJoin,
  readUrls: s.readUrls,
  maxCharacters: s.maxCharacters,
  longMessageBehavior: s.longMessageBehavior,
})

const validMax = (n: number) =>
  Number.isInteger(n) && n >= MAX_CHARACTERS_RANGE.min && n <= MAX_CHARACTERS_RANGE.max

/** General Settings（仕様書 §13） */
export function GeneralSettingsForm({
  guildId,
  settings,
  channels,
}: {
  guildId: string
  settings: GuildSettings
  channels: GuildChannel[]
}) {
  const { t } = useI18n()
  const form = useSettingsForm(pickGeneral(settings), async (v) => pickGeneral(await updateGuildSettings(guildId, v)))
  const v = form.values
  const maxInvalid = !validMax(v.maxCharacters)
  const fixed = v.readingMode === "fixed"
  // 固定モードではチャンネル必須。保存を試みるまではエラーを出さない
  const [submitted, setSubmitted] = useState(false)
  const textMissing = fixed && !v.textChannelId
  const voiceMissing = fixed && !v.voiceChannelId
  const invalid = maxInvalid || textMissing || voiceMissing

  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        setSubmitted(true)
        if (!invalid) form.save()
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t.general.title}</CardTitle>
          <CardDescription>{t.general.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">{t.general.readingMode}</FieldLegend>
              <RadioGroup
                value={v.readingMode}
                onValueChange={(m) => form.set("readingMode", m as ReadingMode)}
                className="grid gap-2 sm:grid-cols-2"
              >
                {(["command", "fixed"] as const).map((m) => (
                  <FieldLabel
                    key={m}
                    htmlFor={`reading-${m}`}
                    className="has-data-checked:bg-primary/5 has-data-checked:ring-primary/40"
                  >
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>{t.general[m]}</FieldTitle>
                        <FieldDescription>{t.general[`${m}Hint`]}</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem id={`reading-${m}`} value={m} />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
            </FieldSet>

            {fixed ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field data-invalid={(submitted && textMissing) || undefined}>
                    <FieldLabel htmlFor="text-channel">{t.general.textChannel}</FieldLabel>
                    <ChannelSelect
                      id="text-channel"
                      channels={channels}
                      type="text"
                      value={v.textChannelId}
                      onChange={(id) => form.set("textChannelId", id)}
                      placeholder={t.general.selectChannel}
                      invalid={submitted && textMissing}
                    />
                    {submitted && textMissing ? (
                      <FieldError>{t.general.channelRequired}</FieldError>
                    ) : (
                      <FieldDescription>{t.general.textChannelHint}</FieldDescription>
                    )}
                  </Field>
                  <Field data-invalid={(submitted && voiceMissing) || undefined}>
                    <FieldLabel htmlFor="voice-channel">{t.general.voiceChannel}</FieldLabel>
                    <ChannelSelect
                      id="voice-channel"
                      channels={channels}
                      type="voice"
                      value={v.voiceChannelId}
                      onChange={(id) => form.set("voiceChannelId", id)}
                      placeholder={t.general.selectChannel}
                      invalid={submitted && voiceMissing}
                    />
                    {submitted && voiceMissing ? (
                      <FieldError>{t.general.channelRequired}</FieldError>
                    ) : (
                      <FieldDescription>{t.general.voiceChannelHint}</FieldDescription>
                    )}
                  </Field>
                </div>

                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="auto-join">{t.general.autoJoin}</FieldLabel>
                    <FieldDescription>{t.general.autoJoinHint}</FieldDescription>
                  </FieldContent>
                  <Switch id="auto-join" checked={v.autoJoin} onCheckedChange={(c) => form.set("autoJoin", c)} />
                </Field>
              </>
            ) : (
              <div className="flex flex-col gap-2 bg-muted/40 p-3">
                <span className="font-medium">{t.general.commandsTitle}</span>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                  <dt>
                    <code className="bg-muted px-1.5 py-0.5 font-mono">/join</code>
                  </dt>
                  <dd className="text-muted-foreground">{t.general.joinCommand}</dd>
                  <dt>
                    <code className="bg-muted px-1.5 py-0.5 font-mono">/leave</code>
                  </dt>
                  <dd className="text-muted-foreground">{t.general.leaveCommand}</dd>
                </dl>
              </div>
            )}

            <FieldSeparator />

            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="read-urls">{t.general.readUrls}</FieldLabel>
                <FieldDescription>{t.general.readUrlsHint}</FieldDescription>
              </FieldContent>
              <Switch id="read-urls" checked={v.readUrls} onCheckedChange={(c) => form.set("readUrls", c)} />
            </Field>

            <FieldSeparator />

            <Field className="max-w-xs" data-invalid={maxInvalid || undefined}>
              <FieldLabel htmlFor="max-characters">{t.general.maxCharacters}</FieldLabel>
              <Input
                id="max-characters"
                type="number"
                inputMode="numeric"
                min={MAX_CHARACTERS_RANGE.min}
                max={MAX_CHARACTERS_RANGE.max}
                value={Number.isNaN(v.maxCharacters) ? "" : v.maxCharacters}
                onChange={(e) => form.set("maxCharacters", e.target.valueAsNumber)}
                aria-invalid={maxInvalid || undefined}
                aria-describedby="max-characters-hint"
                className="w-32 tabular-nums"
              />
              {maxInvalid ? (
                <FieldError>{t.general.maxCharactersError}</FieldError>
              ) : (
                <FieldDescription id="max-characters-hint">{t.general.maxCharactersHint}</FieldDescription>
              )}
            </Field>

            <FieldSet>
              <FieldLegend variant="label">{t.general.longMessage}</FieldLegend>
              <RadioGroup
                value={v.longMessageBehavior}
                onValueChange={(b) => form.set("longMessageBehavior", b as LongMessageBehavior)}
                className="grid gap-2 sm:grid-cols-2"
              >
                {(["truncate", "skip"] as const).map((b) => (
                  <FieldLabel
                    key={b}
                    htmlFor={`long-${b}`}
                    className="has-data-checked:bg-primary/5 has-data-checked:ring-primary/40"
                  >
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>{t.general[b]}</FieldTitle>
                        <FieldDescription>{t.general[`${b}Hint`]}</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem id={`long-${b}`} value={b} />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
            </FieldSet>
          </FieldGroup>
        </CardContent>
      </Card>

      <SaveBar dirty={form.dirty} saving={form.saving} onDiscard={form.discard} disabled={maxInvalid} />
    </form>
  )
}
