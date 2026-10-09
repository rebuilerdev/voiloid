"use client"

import { ArrowRightIcon } from "@phosphor-icons/react"

import { SaveBar } from "@/components/common/save-bar"
import { StatusBadge } from "@/components/common/status-badge"
import { GuardedLink } from "@/components/common/unsaved-changes"
import { useI18n } from "@/components/providers"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { useSettingsForm } from "@/hooks/use-settings-form"
import { fmt } from "@/lib/i18n/config"
import { updateMe } from "@/services/me"
import type { MemberGuild } from "@/types/user"
import { VOICE_PARAM_RANGE, type Voice, type VoiceSettings } from "@/types/voice"

import { VoicePriorityNote } from "@/features/voices/voice-priority-note"
import { VoiceSettingsEditor } from "@/features/voices/voice-settings-editor"

type Values = { useServerDefault: boolean; voice: VoiceSettings }

/** マイボイス未設定時に、編集の初期値として使う声 */
function firstVoice(voices: Voice[]): VoiceSettings {
  const v = voices[0]
  return {
    engine: v?.engine ?? "",
    speakerId: v?.speakerId ?? "",
    styleId: v?.styleId ?? "",
    speed: VOICE_PARAM_RANGE.speed.default,
    pitch: VOICE_PARAM_RANGE.pitch.default,
    intonation: VOICE_PARAM_RANGE.intonation.default,
  }
}

/**
 * マイボイス（仕様書 §49 の Default Voice を変更）: 自分のメッセージを読み上げる声。
 * 未設定、またはエンジンが使えないサーバーでは、そのサーバーのデフォルト音声になる。
 */
export function MyVoiceForm({
  initial,
  voices,
  guilds,
}: {
  initial: VoiceSettings | null
  voices: Voice[]
  guilds: MemberGuild[]
}) {
  const { t } = useI18n()
  const form = useSettingsForm<Values>(
    { useServerDefault: initial === null, voice: initial ?? firstVoice(voices) },
    async (v) => {
      const saved = await updateMe({ voice: v.useServerDefault ? null : v.voice })
      return { useServerDefault: saved.voice === null, voice: saved.voice ?? v.voice }
    },
    { successMessage: t.toast.myVoiceSaved }
  )
  const { useServerDefault, voice } = form.values

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        form.save()
      }}
    >
      <VoiceSettingsEditor
        idPrefix="my-voice"
        voices={voices}
        title={t.settings.myVoice}
        description={t.settings.myVoiceHint}
        value={voice}
        onChange={(next) => form.set("voice", next)}
        disabled={useServerDefault}
        leading={
          <>
            <VoicePriorityNote />
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="use-server-default">{t.settings.useServerDefault}</FieldLabel>
                <FieldDescription>{t.settings.useServerDefaultHint}</FieldDescription>
              </FieldContent>
              <Switch
                id="use-server-default"
                checked={useServerDefault}
                onCheckedChange={(c) => form.set("useServerDefault", c)}
              />
            </Field>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{t.settings.perServer}</CardTitle>
          <CardDescription>
            {t.settings.perServerHint}{" "}
            <GuardedLink href="/workers" className={buttonVariants({ variant: "link", size: "xs" })}>
              {t.settings.openWorkers}
              <ArrowRightIcon data-icon="inline-end" />
            </GuardedLink>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {guilds.length === 0 ? (
            <p className="text-muted-foreground">{t.settings.noMemberGuilds}</p>
          ) : (
            <ul className="flex flex-col divide-y ring-1 ring-border">
              {guilds.map((g) => {
                const available = g.availableEngines.includes(voice.engine)
                return (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
                    <span className="min-w-0 truncate">{g.name}</span>
                    {useServerDefault ? (
                      <StatusBadge tone="muted">{t.settings.readsServerDefault}</StatusBadge>
                    ) : available ? (
                      <StatusBadge tone="success">{t.settings.readsMyVoice}</StatusBadge>
                    ) : (
                      <StatusBadge tone="warning">
                        {fmt(t.settings.fallsBack, { engine: voice.engine })}
                      </StatusBadge>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <SaveBar dirty={form.dirty} saving={form.saving} onDiscard={form.discard} />
    </form>
  )
}
