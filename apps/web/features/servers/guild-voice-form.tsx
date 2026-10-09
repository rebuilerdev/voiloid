"use client"

import { WarningIcon } from "@phosphor-icons/react"

import { SaveBar } from "@/components/common/save-bar"
import { useI18n } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { useSettingsForm } from "@/hooks/use-settings-form"
import { fmt } from "@/lib/i18n/config"
import { updateGuildSettings } from "@/services/guilds"
import type { Voice, VoiceSettings } from "@/types/voice"

import { VoicePriorityNote } from "@/features/voices/voice-priority-note"
import { VoiceSettingsEditor } from "@/features/voices/voice-settings-editor"

/**
 * サーバーのデフォルト音声（仕様書 §14〜19）。
 * マイボイスを設定していない、またはマイボイスのエンジンがこのサーバーで使えないメンバーに使う。
 */
export function GuildVoiceForm({
  guildId,
  voice,
  voices,
  availableEngines,
}: {
  guildId: string
  voice: VoiceSettings
  voices: Voice[]
  /** このサーバーで使えるエンジン */
  availableEngines: string[]
}) {
  const { t } = useI18n()
  const form = useSettingsForm(voice, async (v) => (await updateGuildSettings(guildId, { voice: v })).voice)
  const value = form.values
  const engineUnavailable = !availableEngines.includes(value.engine)
  // 選択肢は使えるエンジンに限定する（保存済みの値が使えない場合も表示はできるよう含める）
  const selectable = voices.filter((v) => availableEngines.includes(v.engine) || v.engine === value.engine)

  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!engineUnavailable) form.save()
      }}
    >
      <VoiceSettingsEditor
        idPrefix="guild-voice"
        voices={selectable}
        title={t.voice.title}
        description={t.voice.description}
        value={value}
        onChange={form.setValues}
        leading={
          <>
            <VoicePriorityNote />
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">{t.voice.availableEngines}</span>
              {availableEngines.length === 0 ? (
                <span className="text-warning">{t.voice.noAvailableEngines}</span>
              ) : (
                availableEngines.map((e) => (
                  <Badge key={e} variant="outline">
                    {e}
                  </Badge>
                ))
              )}
            </div>
            {engineUnavailable && (
              <p role="alert" className="flex items-start gap-2 text-xs text-warning">
                <WarningIcon weight="fill" className="mt-px size-4 shrink-0" aria-hidden />
                {fmt(t.voice.engineUnavailable, { engine: value.engine })}
              </p>
            )}
          </>
        }
      />
      <SaveBar dirty={form.dirty} saving={form.saving} onDiscard={form.discard} disabled={engineUnavailable} />
    </form>
  )
}
