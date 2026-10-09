"use client"

import { SimpleSelect } from "@/components/common/simple-select"
import { useI18n } from "@/components/providers"
import { Field, FieldLabel } from "@/components/ui/field"
import type { Voice } from "@/types/voice"

import { enginesOf, speakersOf, stylesOf } from "@/features/voices/utils"

type SelectProps = {
  id: string
  voices: Voice[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

/** Backend から得た Engine のみ表示する（仕様書 §15） */
export function EngineSelect({ id, voices, value, onChange, disabled }: SelectProps) {
  const { t } = useI18n()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t.voice.engine}</FieldLabel>
      <SimpleSelect
        id={id}
        options={enginesOf(voices).map((e) => ({ value: e, label: e }))}
        value={value || null}
        onValueChange={onChange}
        placeholder={t.voice.selectPlaceholder}
        disabled={disabled}
      />
    </Field>
  )
}

/** Engine に属する Speaker（仕様書 §16） */
export function SpeakerSelect({ id, voices, engine, value, onChange, disabled }: SelectProps & { engine: string }) {
  const { t } = useI18n()
  const speakers = speakersOf(voices, engine)
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t.voice.speaker}</FieldLabel>
      <SimpleSelect
        id={id}
        options={speakers.map((s) => ({ value: s.speakerId, label: s.speakerName }))}
        value={value || null}
        onValueChange={onChange}
        placeholder={t.voice.selectPlaceholder}
        disabled={disabled || speakers.length === 0}
      />
    </Field>
  )
}

/** Speaker で利用可能な Style のみ（仕様書 §17） */
export function StyleSelect({ id, voices, speakerId, value, onChange, disabled }: SelectProps & { speakerId: string }) {
  const { t } = useI18n()
  const styles = stylesOf(voices, speakerId)
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t.voice.style}</FieldLabel>
      <SimpleSelect
        id={id}
        options={styles.map((s) => ({ value: s.styleId, label: s.styleName }))}
        value={value || null}
        onValueChange={onChange}
        placeholder={t.voice.selectPlaceholder}
        disabled={disabled || styles.length === 0}
      />
    </Field>
  )
}
