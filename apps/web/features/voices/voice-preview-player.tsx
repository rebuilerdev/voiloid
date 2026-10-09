"use client"

import { useEffect, useRef, useState } from "react"
import { PlayIcon, SpinnerGapIcon, StopIcon, UserSoundIcon, WarningCircleIcon } from "@phosphor-icons/react"

import { useI18n } from "@/components/providers"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { previewVoice } from "@/services/voices"
import type { VoiceSettings } from "@/types/voice"

type State = "idle" | "generating" | "playing" | "error"

/** 生成して再生するためのフック。生成中は再実行させない（連打防止） */
export function useVoicePreview() {
  const [state, setState] = useState<State>("idle")
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => audioRef.current?.pause(), [])

  function stop() {
    audioRef.current?.pause()
    setState("idle")
  }

  async function play(settings: VoiceSettings, text: string) {
    if (state === "generating") return
    if (state === "playing") return stop()
    setState("generating")
    try {
      const { audioUrl } = await previewVoice({ ...settings, text })
      audioRef.current?.pause()
      const audio = new Audio(audioUrl)
      audio.playbackRate = settings.speed
      audio.onended = () => setState("idle")
      audioRef.current = audio
      await audio.play()
      setState("playing")
    } catch {
      setState("error")
    }
  }

  return { state, play, stop }
}

/** Voice Preview（仕様書 §19）: 話者・テスト文・[▶ 生成して再生] */
export function VoicePreviewPlayer({
  settings,
  speakerName,
  styleName,
  idPrefix,
  disabled,
}: {
  settings: VoiceSettings
  speakerName?: string
  styleName?: string
  idPrefix: string
  disabled?: boolean
}) {
  const { t } = useI18n()
  const [text, setText] = useState(t.voice.previewDefaultText)
  const { state, play } = useVoicePreview()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center bg-primary/10 text-primary">
          <UserSoundIcon className="size-6" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-heading text-sm font-semibold">{speakerName ?? t.common.none}</span>
          <span className="truncate text-xs text-muted-foreground">
            {settings.engine}
            {styleName && ` · ${styleName}`}
          </span>
        </div>
      </div>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-preview-text`}>{t.voice.previewText}</FieldLabel>
        <Textarea
          id={`${idPrefix}-preview-text`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          rows={3}
          disabled={disabled}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => play(settings, text)}
          disabled={disabled || state === "generating" || !text.trim() || !settings.styleId}
        >
          {state === "generating" ? (
            <SpinnerGapIcon className="animate-spin" />
          ) : state === "playing" ? (
            <StopIcon weight="fill" />
          ) : (
            <PlayIcon weight="fill" />
          )}
          {state === "generating" ? t.voice.generating : state === "playing" ? t.voice.playing : t.voice.play}
        </Button>
        {state === "error" && (
          <span role="alert" className="flex items-center gap-1 text-xs text-destructive">
            <WarningCircleIcon weight="fill" className="size-4" />
            {t.voice.previewError}
          </span>
        )}
      </div>
    </div>
  )
}
