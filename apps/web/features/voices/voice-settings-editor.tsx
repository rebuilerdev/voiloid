"use client"

import { WarningIcon } from "@phosphor-icons/react"

import { useI18n } from "@/components/providers"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldGroup, FieldSeparator } from "@/components/ui/field"
import { fmt } from "@/lib/i18n/config"
import type { Voice, VoiceSettings } from "@/types/voice"

import { findVoice, withEngine, withSpeaker } from "@/features/voices/utils"
import { VoiceParameterSlider } from "@/features/voices/voice-parameter-slider"
import { VoicePreviewPlayer } from "@/features/voices/voice-preview-player"
import { EngineSelect, SpeakerSelect, StyleSelect } from "@/features/voices/voice-selects"

/**
 * 左: Voice Settings / 右: Preview の 2 カラム（仕様書 §14）。
 * Guild の Voice 設定と Settings の Default Voice で共用する。
 */
export function VoiceSettingsEditor({
  voices,
  value,
  onChange,
  title,
  description,
  leading,
  disabled,
  idPrefix,
}: {
  voices: Voice[]
  value: VoiceSettings
  onChange: (value: VoiceSettings) => void
  title: string
  description?: string
  /** 設定欄の先頭に置く要素（「デフォルト音声を使用」など） */
  leading?: React.ReactNode
  /** true の場合は値を表示のみ */
  disabled?: boolean
  idPrefix: string
}) {
  const { t } = useI18n()
  const current = findVoice(voices, value)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {leading}
            {leading && <FieldSeparator />}
            {voices.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t.voice.noVoices}</p>
            ) : (
              <>
                {/* 保存済みの声が一覧に無い（対応する Worker がオフライン等）場合 */}
                {!current && value.speakerId && (
                  <p role="alert" className="flex items-start gap-2 text-xs text-warning">
                    <WarningIcon weight="fill" className="mt-px size-4 shrink-0" aria-hidden />
                    {fmt(t.voice.voiceNotListed, { engine: value.engine })}
                  </p>
                )}
                <div className="grid gap-4 sm:grid-cols-3">
                  <EngineSelect
                    id={`${idPrefix}-engine`}
                    voices={voices}
                    value={value.engine}
                    onChange={(engine) => onChange(withEngine(voices, value, engine))}
                    disabled={disabled}
                  />
                  <SpeakerSelect
                    id={`${idPrefix}-speaker`}
                    voices={voices}
                    engine={value.engine}
                    value={value.speakerId}
                    onChange={(speakerId) => onChange(withSpeaker(voices, value, speakerId))}
                    disabled={disabled}
                  />
                  <StyleSelect
                    id={`${idPrefix}-style`}
                    voices={voices}
                    speakerId={value.speakerId}
                    value={value.styleId}
                    onChange={(styleId) => onChange({ ...value, styleId })}
                    disabled={disabled}
                  />
                </div>
                <div className="grid gap-6 sm:grid-cols-3">
                  {(["speed", "pitch", "intonation"] as const).map((param) => (
                    <VoiceParameterSlider
                      key={param}
                      param={param}
                      idPrefix={idPrefix}
                      value={value[param]}
                      onChange={(v) => onChange({ ...value, [param]: v })}
                      disabled={disabled}
                    />
                  ))}
                </div>
              </>
            )}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card className="h-fit lg:sticky lg:top-16">
        <CardHeader>
          <CardTitle>{t.voice.preview}</CardTitle>
        </CardHeader>
        <CardContent>
          <VoicePreviewPlayer
            settings={value}
            speakerName={current?.speakerName}
            styleName={current?.styleName}
            idPrefix={idPrefix}
          />
        </CardContent>
      </Card>
    </div>
  )
}
