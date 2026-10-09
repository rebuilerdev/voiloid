"use client"

import { PlayIcon, SpinnerGapIcon, StopIcon, UserSoundIcon } from "@phosphor-icons/react"

import { useI18n } from "@/components/providers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { VOICE_PARAM_RANGE } from "@/types/voice"

import type { Speaker } from "@/features/voices/utils"
import { useVoicePreview } from "@/features/voices/voice-preview-player"

/** 話者名・Engine・Style 数・[プレビュー]（仕様書 §45） */
export function VoiceCard({ speaker }: { speaker: Speaker }) {
  const { t } = useI18n()
  const { state, play } = useVoicePreview()
  const first = speaker.styles[0]

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserSoundIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{speaker.speakerName}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline">{speaker.engine}</Badge>
          <span className="text-muted-foreground">
            {t.voices.styles} <span className="font-medium text-foreground tabular-nums">{speaker.styles.length}</span>
          </span>
        </div>
        <p className="truncate text-muted-foreground" title={speaker.styles.map((s) => s.styleName).join(", ")}>
          {speaker.styles.map((s) => s.styleName).join(" · ")}
        </p>
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={state === "generating"}
          onClick={() =>
            play(
              {
                engine: speaker.engine,
                speakerId: speaker.speakerId,
                styleId: first.styleId,
                speed: VOICE_PARAM_RANGE.speed.default,
                pitch: VOICE_PARAM_RANGE.pitch.default,
                intonation: VOICE_PARAM_RANGE.intonation.default,
              },
              t.voice.previewDefaultText
            )
          }
        >
          {state === "generating" ? (
            <SpinnerGapIcon className="animate-spin" />
          ) : state === "playing" ? (
            <StopIcon weight="fill" />
          ) : (
            <PlayIcon weight="fill" />
          )}
          {state === "playing" ? t.voice.playing : t.voices.preview}
        </Button>
      </CardFooter>
    </Card>
  )
}
