"use client"

import { useState } from "react"
import { MagnifyingGlassIcon, WaveformIcon } from "@phosphor-icons/react"

import { EmptyState } from "@/components/common/empty-state"
import { SimpleSelect } from "@/components/common/simple-select"
import { useI18n } from "@/components/providers"
import { Input } from "@/components/ui/input"
import type { Voice } from "@/types/voice"

import { enginesOf, speakersOf } from "@/features/voices/utils"
import { VoiceCard } from "@/features/voices/voice-card"

const ALL = "__all__"

/** Voices 一覧（仕様書 §44）: Engine / Speaker / 検索で絞り込み */
export function VoiceBrowser({ voices }: { voices: Voice[] }) {
  const { t } = useI18n()
  const [engine, setEngine] = useState(ALL)
  const [speaker, setSpeaker] = useState(ALL)
  const [query, setQuery] = useState("")

  if (voices.length === 0) {
    return (
      <EmptyState
        icon={<WaveformIcon />}
        title={t.voices.emptyTitle}
        description={t.voices.emptyDescription}
      />
    )
  }

  const speakersInEngine = speakersOf(voices, engine === ALL ? undefined : engine)
  const q = query.trim().toLowerCase()
  const shown = speakersInEngine.filter(
    (s) =>
      (speaker === ALL || s.speakerId === speaker) &&
      (!q ||
        s.speakerName.toLowerCase().includes(q) ||
        s.styles.some((st) => st.styleName.toLowerCase().includes(q)))
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SimpleSelect
          className="w-44"
          aria-label={t.voices.engine}
          options={[{ value: ALL, label: t.voices.allEngines }, ...enginesOf(voices).map((e) => ({ value: e, label: e }))]}
          value={engine}
          onValueChange={(v) => {
            setEngine(v)
            setSpeaker(ALL)
          }}
        />
        <SimpleSelect
          className="w-44"
          aria-label={t.voices.speaker}
          options={[
            { value: ALL, label: t.voices.allSpeakers },
            ...speakersInEngine.map((s) => ({ value: s.speakerId, label: s.speakerName })),
          ]}
          value={speaker}
          onValueChange={setSpeaker}
        />
        <div className="relative w-full sm:w-64">
          <MagnifyingGlassIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.voices.searchPlaceholder}
            aria-label={t.voices.searchPlaceholder}
            className="pl-8"
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-12 text-center text-xs text-muted-foreground">{t.voices.noMatch}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {shown.map((s) => (
            <VoiceCard key={s.speakerId} speaker={s} />
          ))}
        </div>
      )}
    </div>
  )
}
